mod crawler;
mod http;
mod model;
mod robots;
mod sources;
mod text;

use std::collections::HashMap;
use std::io::IsTerminal;
use std::time::Duration;

use anyhow::{Context, Result, bail};
use redis::AsyncCommands;
use redis::aio::MultiplexedConnection;
use tokio::task::JoinHandle;

use crate::crawler::{CrawlOptions, CrawlStats, Sink, crawl, summarize_errors};
use crate::http::Fetcher;
use crate::model::{
    HEARTBEAT_KEY, HEARTBEAT_TTL_SECS, ProductMessage, RESULTS_QUEUE, RunEvent, ScrapedProduct,
    ScraperTask, TASKS_PROCESSING, TASKS_QUEUE,
};
use crate::sources::{SUPPORTED, Source};
use crate::text::now_iso;
use tracing::{Instrument, error, info, info_span};

/// Мінімальна пауза між запитами до одного сайту (docs/01-data-sources.md, правило 3)
const MIN_DELAY_MS: u64 = 3000;
/// Як часто воркер дивиться в чергу завдань
const POLL_EVERY: Duration = Duration::from_secs(2);

const HELP: &str = "\
OnniMart scraper

  scraper_worker                      воркер: чекає завдань у Redis (scraper:tasks)
  scraper_worker scrape <store> [опції]
      --max-pages N     не більше N сторінок на категорію
      --category TEXT   лише категорії, slug яких містить TEXT
      --delay-ms N      пауза між запитами, не менше 3000 (за замовчуванням 3000)
      --json            вивести всі товари як JSON Lines
      --push            надіслати товари в Redis (scraper:results)
";

#[tokio::main]
async fn main() -> Result<()> {
    dotenv::dotenv().ok();
    init_logging();
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        None | Some("worker") => run_worker().await,
        Some("scrape") => run_cli(&args[1..]).await,
        Some("help" | "--help" | "-h") => {
            print!("{HELP}");
            Ok(())
        }
        Some(other) => bail!("невідома команда {other}\n\n{HELP}"),
    }
}

/// Логи в stderr: текст для людини або JSON (LOG_FORMAT=json) з полями run_id / store;
/// рівень — RUST_LOG (за замовчуванням info)
fn init_logging() {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));
    let builder =
        tracing_subscriber::fmt().with_env_filter(filter).with_writer(std::io::stderr);
    // Кольори лише в терміналі, не в docker compose logs
    let builder = builder.with_ansi(std::io::stderr().is_terminal());
    if std::env::var("LOG_FORMAT").as_deref() == Ok("json") {
        builder.json().flatten_event(true).with_span_list(false).init();
    } else {
        builder.compact().init();
    }
}

fn redis_url() -> String {
    std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".into())
}

fn source_for(store: &str) -> Result<Source> {
    Source::for_store(store)
        .with_context(|| format!("невідома мережа {store}; доступні: {}", SUPPORTED.join(", ")))
}

struct RedisSink {
    con: MultiplexedConnection,
    run_id: Option<String>,
}

impl Sink for RedisSink {
    async fn product(&mut self, product: ScrapedProduct) -> Result<()> {
        let json = serde_json::to_string(&ProductMessage::new(&product, self.run_id.as_deref()))?;
        let _: () = self.con.lpush(RESULTS_QUEUE, json).await?;
        if let Some(run_id) = &self.run_id {
            heartbeat(&mut self.con, run_id).await?;
        }
        Ok(())
    }
}

async fn heartbeat(con: &mut MultiplexedConnection, run_id: &str) -> Result<()> {
    let _: () = redis::pipe()
        .set_ex(HEARTBEAT_KEY, run_id, HEARTBEAT_TTL_SECS)
        .set_ex(format!("{HEARTBEAT_KEY}:{run_id}"), 1, HEARTBEAT_TTL_SECS)
        .query_async(con)
        .await?;
    Ok(())
}

struct PrintSink {
    json: bool,
    shown: u32,
}

impl Sink for PrintSink {
    async fn product(&mut self, product: ScrapedProduct) -> Result<()> {
        if self.json {
            println!("{}", serde_json::to_string(&product)?);
        } else if self.shown < 20 {
            println!(
                "{:>9.2} {:<9} {:<10} {} {}",
                product.price,
                product.old_price.map(|p| format!("({p:.2})")).unwrap_or_default(),
                product.size.as_deref().unwrap_or(""),
                product.name,
                product.barcodes.join(","),
            );
        }
        self.shown += 1;
        Ok(())
    }
}

/// Сайт завдання: на один сайт ходить лише один обхід
fn site_of(store: &str) -> String {
    Source::for_store(store).map_or_else(|| store.to_string(), |source| source.site())
}

struct Running {
    handle: JoinHandle<()>,
    raw: String,
}

async fn run_worker() -> Result<()> {
    let url = redis_url();
    info!(redis = %redact(&url), "воркер запущено");
    let client = redis::Client::open(url)?;
    let mut con = client.get_multiplexed_async_connection().await?;

    // Воркер упав посеред обходів: позначаємо ті запуски як невдалі, а не перезапускаємо
    // (багатогодинний обхід, що падає, інакше крутився б нескінченно)
    let unfinished: Vec<String> = con.lrange(TASKS_PROCESSING, 0, -1).await?;
    for raw in unfinished {
        if let Ok(task) = serde_json::from_str::<ScraperTask>(&raw) {
            let event = RunEvent {
                kind: "run_failed",
                run_id: task.run_id,
                store: task.store,
                pages_fetched: 0,
                items_seen: 0,
                error: Some("воркер парсера перезапустився посеред обходу".into()),
                at: now_iso(),
            };
            send_event(&mut con, &event).await?;
        }
        let _: () = con.lrem(TASKS_PROCESSING, -1, &raw).await?;
    }

    // Обходи різних сайтів ідуть одночасно, кожен зі своєю паузою між запитами.
    // Завдання зайнятого сайту чекає в черзі: так воно переживе перезапуск воркера
    let mut running: HashMap<String, Running> = HashMap::new();
    loop {
        let finished: Vec<String> = running
            .iter()
            .filter(|(_, run)| run.handle.is_finished())
            .map(|(site, _)| site.clone())
            .collect();
        for site in finished {
            if let Some(run) = running.remove(&site) {
                let _: () = con.lrem(TASKS_PROCESSING, -1, &run.raw).await?;
            }
        }

        // API додає завдання зліва, тож найстаріше — справа
        let queue: Vec<String> = con.lrange(TASKS_QUEUE, 0, -1).await?;
        for raw in queue.into_iter().rev() {
            let task = match serde_json::from_str::<ScraperTask>(&raw) {
                Ok(task) => task,
                Err(error) => {
                    error!(%error, raw, "некоректне завдання");
                    let _: () = con.lrem(TASKS_QUEUE, -1, &raw).await?;
                    continue;
                }
            };
            let site = site_of(&task.store);
            if running.contains_key(&site) {
                continue;
            }
            // Завдання лишається в TASKS_PROCESSING, доки обхід не завершиться
            let _: () = redis::pipe()
                .atomic()
                .lrem(TASKS_QUEUE, -1, &raw)
                .lpush(TASKS_PROCESSING, &raw)
                .query_async(&mut con)
                .await?;
            // Усі логи обходу несуть run_id і store — їх видно в кожному рядку
            let run_id = task.run_id.clone().unwrap_or_default();
            let span = info_span!("run", run_id, store = %task.store);
            let mut task_con = con.clone();
            let handle = tokio::spawn(
                async move {
                    if let Err(error) = handle_task(&mut task_con, task).await {
                        error!(%error, "помилка Redis");
                    }
                }
                .instrument(span),
            );
            running.insert(site, Running { handle, raw });
        }
        tokio::time::sleep(POLL_EVERY).await;
    }
}

async fn handle_task(con: &mut MultiplexedConnection, task: ScraperTask) -> Result<()> {
    info!(max_pages = ?task.max_pages, "завдання");
    let event = |kind: &'static str, stats: &CrawlStats, error: Option<String>| RunEvent {
        kind,
        run_id: task.run_id.clone(),
        store: task.store.clone(),
        pages_fetched: stats.pages,
        items_seen: stats.items,
        error,
        at: now_iso(),
    };
    send_event(con, &event("run_started", &CrawlStats::default(), None)).await?;
    if let Some(run_id) = &task.run_id {
        heartbeat(con, run_id).await?;
    }

    let prepared = source_for(&task.store).and_then(|source| {
        let delay = polite_delay(task.crawl_delay_ms.unwrap_or(MIN_DELAY_MS));
        Ok((source, Fetcher::new(delay)?))
    });
    let (stats, result) = match prepared {
        Ok((source, mut fetcher)) => {
            let options = CrawlOptions { max_pages: task.max_pages, category: None };
            let mut sink = RedisSink { con: con.clone(), run_id: task.run_id.clone() };
            crawl(&source, &mut fetcher, &options, &mut sink).await
        }
        Err(error) => (CrawlStats::default(), Err(error)),
    };

    // Статистика зібраного не губиться й тоді, коли обхід перервався
    let finished = match result {
        Ok(()) => event("run_finished", &stats, summarize_errors(&stats.errors)),
        Err(error) => {
            let mut text = format!("{error:#}");
            if let Some(pages) = summarize_errors(&stats.errors) {
                text.push_str(&format!("\nПомилки сторінок:\n{pages}"));
            }
            event("run_failed", &stats, Some(text))
        }
    };
    info!(
        kind = finished.kind,
        pages = finished.pages_fetched,
        items = finished.items_seen,
        "обхід завершено"
    );
    send_event(con, &finished).await
}

/// Адреса Redis для логів: пароль не друкуємо ("redis://:***@redis:6379")
fn redact(url: &str) -> String {
    match (url.find("://"), url.rfind('@')) {
        (Some(scheme), Some(at)) if at > scheme => format!("{}://***{}", &url[..scheme], &url[at..]),
        _ => url.to_string(),
    }
}

/// Пауза не менша за MIN_DELAY_MS, навіть якщо завдання чи CLI просять менше
fn polite_delay(ms: u64) -> Duration {
    Duration::from_millis(ms.max(MIN_DELAY_MS))
}

async fn send_event(con: &mut MultiplexedConnection, event: &RunEvent) -> Result<()> {
    let _: () = con.lpush(RESULTS_QUEUE, serde_json::to_string(event)?).await?;
    Ok(())
}

async fn run_cli(args: &[String]) -> Result<()> {
    let store = args.first().context("вкажіть мережу: scrape <store>")?;
    let source = source_for(store)?;
    let mut options = CrawlOptions::default();
    let mut delay_ms = MIN_DELAY_MS;
    let (mut json, mut push) = (false, false);

    let mut rest = args[1..].iter();
    while let Some(arg) = rest.next() {
        match arg.as_str() {
            "--max-pages" => options.max_pages = Some(rest.next().context("--max-pages N")?.parse()?),
            "--category" => options.category = Some(rest.next().context("--category TEXT")?.clone()),
            "--delay-ms" => delay_ms = rest.next().context("--delay-ms N")?.parse()?,
            "--json" => json = true,
            "--push" => push = true,
            other => bail!("невідомий параметр {other}\n\n{HELP}"),
        }
    }

    let mut fetcher = Fetcher::new(polite_delay(delay_ms))?;
    let (stats, result) = if push {
        let client = redis::Client::open(redis_url())?;
        let con = client.get_multiplexed_async_connection().await?;
        crawl(&source, &mut fetcher, &options, &mut RedisSink { con, run_id: None }).await
    } else {
        crawl(&source, &mut fetcher, &options, &mut PrintSink { json, shown: 0 }).await
    };

    info!(
        store = %store,
        pages = stats.pages,
        items = stats.items,
        requests = fetcher.requests,
        errors = stats.errors.len(),
        "обхід завершено"
    );
    for error in &stats.errors {
        eprintln!("  - {error}");
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redis_password_is_not_logged() {
        assert_eq!(redact("redis://:secret@redis:6379"), "redis://***@redis:6379");
        assert_eq!(redact("redis://127.0.0.1:6379"), "redis://127.0.0.1:6379");
    }

    #[test]
    fn delay_is_never_below_minimum() {
        assert_eq!(polite_delay(0), Duration::from_millis(MIN_DELAY_MS));
        assert_eq!(polite_delay(5000), Duration::from_millis(5000));
    }
}
