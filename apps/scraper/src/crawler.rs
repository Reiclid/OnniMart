use std::collections::HashSet;

use anyhow::{Result, bail};

use crate::http::{FetchError, Fetcher};
use crate::model::ScrapedProduct;
use crate::sources::{Category, Listing, Source};
use crate::text::now_iso;
use tracing::info;

/// Куди віддавати знайдені товари: Redis (воркер) або консоль (CLI)
#[allow(async_fn_in_trait)]
pub trait Sink {
    async fn product(&mut self, product: ScrapedProduct) -> Result<()>;
}

#[derive(Debug, Default, Clone)]
pub struct CrawlOptions {
    /// Максимум сторінок на категорію (None — усі)
    pub max_pages: Option<u32>,
    /// Обійти лише категорії, slug яких містить цей текст
    pub category: Option<String>,
}

#[derive(Debug, Default)]
pub struct CrawlStats {
    pub pages: u32,
    pub items: u32,
    pub errors: Vec<String>,
}

/// Скільки сторінок поспіль може не вдатися, перш ніж покинути категорію
const MAX_PAGE_FAILURES: u32 = 3;
/// Скільки помилок сторінок зберігати в журналі запуску (решта — лише кількість)
const MAX_REPORTED_ERRORS: usize = 20;

/// Обхід мережі: категорії → сторінки → товари.
/// Збій сторінки пропускається (категорія покидається після кількох збоїв поспіль),
/// а 403 чи вимога сайту почекати довше за 5 хв зупиняють обхід.
/// Статистику повертає завжди — і коли обхід перервався помилкою.
pub async fn crawl<S: Sink>(
    source: &Source,
    fetcher: &mut Fetcher,
    options: &CrawlOptions,
    sink: &mut S,
) -> (CrawlStats, Result<()>) {
    let mut stats = CrawlStats::default();
    let result = crawl_into(&mut stats, source, fetcher, options, sink).await;
    (stats, result)
}

async fn crawl_into<S: Sink>(
    stats: &mut CrawlStats,
    source: &Source,
    fetcher: &mut Fetcher,
    options: &CrawlOptions,
    sink: &mut S,
) -> Result<()> {
    let start_url = source.start_url();
    let start_page = fetcher.get(&start_url).await?;
    stats.pages += 1;
    let mut categories = source.parse_categories(&start_page)?;
    if let Some(filter) = &options.category {
        categories.retain(|c| c.slug.contains(filter.as_str()));
    }
    if categories.is_empty() {
        bail!("{}: не знайдено жодної категорії", source.store);
    }
    info!(store = source.store, categories = categories.len(), "категорії");

    let mut seen = HashSet::new();
    'categories: for category in &categories {
        let mut page = 1;
        let mut last_page: Option<u32> = None;
        let mut failures = 0;
        loop {
            let url = source.page_url(category, page);
            // Kaufland: усі акції на стартовій сторінці — не завантажуємо її вдруге
            let fetched = if url == start_url {
                source
                    .parse_page(&start_page, category, &now_iso())
                    .map_err(|error| anyhow::anyhow!("{url}: {error}"))
            } else {
                fetch_listing(source, fetcher, stats, &url, category).await
            };
            let listing = match fetched {
                Ok(listing) => listing,
                Err(error) => {
                    let kind = error.downcast_ref::<FetchError>();
                    let stop = matches!(
                        kind,
                        Some(FetchError::Blocked(_) | FetchError::RateLimited(..))
                    );
                    let disallowed = matches!(kind, Some(FetchError::Disallowed(_)));
                    // Товарів поменшало, а лічильник ще старий: це кінець категорії, а не збій
                    if page > 1 && matches!(kind, Some(FetchError::NotFound(_))) {
                        break;
                    }
                    stats.errors.push(error.to_string());
                    if stop {
                        break 'categories;
                    }
                    failures += 1;
                    let at_end = last_page.is_some_and(|last| page >= last)
                        || options.max_pages.is_some_and(|max| page >= max);
                    if disallowed || failures >= MAX_PAGE_FAILURES || at_end {
                        break;
                    }
                    // Пропускаємо сторінку, а не всю решту категорії
                    page += 1;
                    continue;
                }
            };
            failures = 0;
            if listing.products.is_empty() {
                break;
            }
            for product in listing.products {
                // Товар може бути в кількох категоріях — надсилаємо один раз
                if seen.insert(product.external.clone()) {
                    stats.items += 1;
                    sink.product(product).await?;
                }
            }

            let last = listing.total_pages.unwrap_or(page);
            last_page = Some(last);
            info!(category = %category.slug, page, last, items = stats.items, "сторінка");
            if page >= last || options.max_pages.is_some_and(|max| page >= max) {
                break;
            }
            page += 1;
        }
    }
    Ok(())
}

/// Сторінка категорії. Сайт інколи віддає сторінку без даних: один раз запитуємо її ще
async fn fetch_listing(
    source: &Source,
    fetcher: &mut Fetcher,
    stats: &mut CrawlStats,
    url: &str,
    category: &Category,
) -> Result<Listing> {
    let html = fetcher.get(url).await?;
    stats.pages += 1;
    if let Ok(listing) = source.parse_page(&html, category, &now_iso()) {
        return Ok(listing);
    }
    let html = fetcher.get(url).await?;
    stats.pages += 1;
    source
        .parse_page(&html, category, &now_iso())
        .map_err(|error| anyhow::anyhow!("{url}: {error}"))
}

/// Помилки сторінок для журналу запуску: перші MAX_REPORTED_ERRORS і кількість решти
pub fn summarize_errors(errors: &[String]) -> Option<String> {
    if errors.is_empty() {
        return None;
    }
    let mut text = errors
        .iter()
        .take(MAX_REPORTED_ERRORS)
        .cloned()
        .collect::<Vec<_>>()
        .join("\n");
    if errors.len() > MAX_REPORTED_ERRORS {
        text.push_str(&format!(
            "\n… і ще {} помилок",
            errors.len() - MAX_REPORTED_ERRORS
        ));
    }
    Some(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn long_error_lists_are_truncated() {
        assert_eq!(summarize_errors(&[]), None);
        let errors: Vec<String> = (1..=25).map(|i| format!("e{i}")).collect();
        let text = summarize_errors(&errors).unwrap();
        assert!(text.starts_with("e1\ne2"));
        assert!(text.contains("e20"));
        assert!(!text.contains("e21"));
        assert!(text.ends_with("… і ще 5 помилок"));
    }
}
