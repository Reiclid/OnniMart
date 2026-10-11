use std::collections::HashSet;

use anyhow::{Result, bail};

use crate::http::{FetchError, Fetcher};
use crate::model::ScrapedProduct;
use crate::sources::Source;
use crate::text::now_iso;

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

/// Обхід мережі: категорії → сторінки → товари.
/// Помилка окремої сторінки не зупиняє обхід, а 403 від сайту — зупиняє.
pub async fn crawl<S: Sink>(
    source: &Source,
    fetcher: &mut Fetcher,
    options: &CrawlOptions,
    sink: &mut S,
) -> Result<CrawlStats> {
    let mut stats = CrawlStats::default();
    let start_page = fetcher.get(&source.start_url()).await?;
    let mut categories = source.parse_categories(&start_page)?;
    if let Some(filter) = &options.category {
        categories.retain(|c| c.slug.contains(filter.as_str()));
    }
    if categories.is_empty() {
        bail!("{}: не знайдено жодної категорії", source.store);
    }
    eprintln!("[scraper] {}: категорій — {}", source.store, categories.len());

    let mut seen = HashSet::new();
    'categories: for category in &categories {
        let mut page = 1;
        loop {
            let url = source.page_url(category, page);
            let html = match fetcher.get(&url).await {
                Ok(html) => html,
                Err(error) => {
                    let blocked = matches!(
                        error.downcast_ref::<FetchError>(),
                        Some(FetchError::Blocked(_))
                    );
                    stats.errors.push(error.to_string());
                    if blocked {
                        break 'categories;
                    }
                    break;
                }
            };
            stats.pages += 1;

            let listing = match source.parse_page(&html, category, &now_iso()) {
                Ok(listing) => listing,
                Err(error) => {
                    stats.errors.push(format!("{url}: {error}"));
                    break;
                }
            };
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

            let last_page = listing.total_pages.unwrap_or(page);
            eprintln!(
                "[scraper] {} / {}: сторінка {page}/{last_page}, товарів усього {}",
                source.store, category.slug, stats.items
            );
            if page >= last_page || options.max_pages.is_some_and(|max| page >= max) {
                break;
            }
            page += 1;
        }
    }
    Ok(stats)
}
