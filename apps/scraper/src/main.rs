mod crawler;
mod http;
mod model;
mod robots;
mod sources;
mod text;

use std::time::Duration;

use anyhow::{Context, Result, bail};
use redis::AsyncCommands;
use redis::aio::MultiplexedConnection;

use crate::crawler::{CrawlOptions, CrawlStats, Sink, crawl};
use crate::http::Fetcher;
use crate::model::{
    ProductMessage, RESULTS_QUEUE, RunEvent, ScrapedProduct, ScraperTask, TASKS_QUEUE,
};
use crate::sources::{SUPPORTED, Source};
use crate::text::now_iso;

const DEFAULT_DELAY_MS: u64 = 3000;

const HELP: &str = "\
OnniMart scraper

  scraper_worker                      воркер: чекає завдань у Redis (scraper:tasks)
  scraper_worker scrape <store> [опції]
      --max-pages N     не більше N сторінок на категорію
      --category TEXT   лише категорії, slug яких містить TEXT
      --delay-ms N      пауза між запитами (за замовчуванням 3000)
      --json            вивести всі товари як JSON Lines
      --push            надіслати товари в Redis (scraper:results)
";

#[tokio::main]
async fn main() -> Result<()> {
    dotenv::dotenv().ok();
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
        Ok(())
    }
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

async fn run_worker() -> Result<()> {
    let url = redis_url();
    eprintln!("[scraper] воркер запущено, Redis: {url}");
    let client = redis::Client::open(url)?;
    let mut con = client.get_multiplexed_async_connection().await?;

    loop {
        let task: Option<(String, String)> = con.brpop(TASKS_QUEUE, 0.0).await?;
        let Some((_, raw)) = task else { continue };
        match serde_json::from_str::<ScraperTask>(&raw) {
            Ok(task) => {
                if let Err(error) = handle_task(&mut con, task).await {
                    eprintln!("[scraper] помилка Redis: {error}");
                }
            }
            Err(error) => eprintln!("[scraper] некоректне завдання {raw}: {error}"),
        }
    }
}

async fn handle_task(con: &mut MultiplexedConnection, task: ScraperTask) -> Result<()> {
    eprintln!("[scraper] завдання: {} (run {:?})", task.store, task.run_id);
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

    let result = async {
        let source = source_for(&task.store)?;
        let delay = Duration::from_millis(task.crawl_delay_ms.unwrap_or(DEFAULT_DELAY_MS));
        let mut fetcher = Fetcher::new(delay)?;
        let options = CrawlOptions { max_pages: task.max_pages, category: None };
        let mut sink = RedisSink { con: con.clone(), run_id: task.run_id.clone() };
        crawl(&source, &mut fetcher, &options, &mut sink).await
    }
    .await;

    let finished = match result {
        Ok(stats) => {
            let error = (!stats.errors.is_empty()).then(|| stats.errors.join("\n"));
            event("run_finished", &stats, error)
        }
        Err(error) => event("run_failed", &CrawlStats::default(), Some(format!("{error:#}"))),
    };
    eprintln!(
        "[scraper] {}: {} — сторінок {}, товарів {}",
        task.store, finished.kind, finished.pages_fetched, finished.items_seen
    );
    send_event(con, &finished).await
}

async fn send_event(con: &mut MultiplexedConnection, event: &RunEvent) -> Result<()> {
    let _: () = con.lpush(RESULTS_QUEUE, serde_json::to_string(event)?).await?;
    Ok(())
}

async fn run_cli(args: &[String]) -> Result<()> {
    let store = args.first().context("вкажіть мережу: scrape <store>")?;
    let source = source_for(store)?;
    let mut options = CrawlOptions::default();
    let mut delay_ms = DEFAULT_DELAY_MS;
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

    let mut fetcher = Fetcher::new(Duration::from_millis(delay_ms))?;
    let stats = if push {
        let client = redis::Client::open(redis_url())?;
        let con = client.get_multiplexed_async_connection().await?;
        crawl(&source, &mut fetcher, &options, &mut RedisSink { con, run_id: None }).await?
    } else {
        crawl(&source, &mut fetcher, &options, &mut PrintSink { json, shown: 0 }).await?
    };

    eprintln!(
        "[scraper] {store}: сторінок {}, товарів {}, HTTP-запитів {}, помилок {}",
        stats.pages,
        stats.items,
        fetcher.requests,
        stats.errors.len()
    );
    for error in &stats.errors {
        eprintln!("  - {error}");
    }
    Ok(())
}
