//! ALDI Nord: Next.js SSR. Сторінка підкатегорії містить у __NEXT_DATA__ результати
//! Algolia — усі товари підкатегорії з цінами. Список підкатегорій беремо з sitemap.

use std::collections::HashSet;
use std::sync::LazyLock;

use anyhow::{Context, Result};
use chrono::DateTime;
use regex::Regex;
use serde_json::Value;

use super::{Category, Listing, base_product};
use crate::model::ScrapedProduct;
use crate::text::{non_empty, script_json};

pub const START_URL: &str = "https://www.aldi-nord.de/sitemaps/.aldi-nord-sitemap-pages.xml";
const BASE: &str = "https://www.aldi-nord.de";
/// Добірки, що дублюють товари з основних розділів
const SKIP: &[&str] = &[
    "sortiment-highlights",
    "aldi-eigenmarken",
    "weihnachten",
    "vegane-produkte",
    "grillen",
];

static LEAF: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"<loc>(https://www\.aldi-nord\.de/sortiment/([a-z0-9-]+)/([a-z0-9-]+)\.html)</loc>")
        .unwrap()
});

pub fn parse_categories(sitemap: &str) -> Result<Vec<Category>> {
    let mut seen = HashSet::new();
    Ok(LEAF
        .captures_iter(sitemap)
        .filter(|caps| !SKIP.iter().any(|skip| caps[2].contains(skip)))
        .filter(|caps| seen.insert(caps[1].to_string()))
        .map(|caps| Category {
            slug: format!("{}/{}", &caps[2], &caps[3]),
            name: caps[3].to_string(),
            url: caps[1].to_string(),
        })
        .collect())
}

/// Перший результат пошуку Algolia, у якому є товари
fn algolia_result(data: &Value) -> Option<&Value> {
    data.pointer("/props/pageProps/algoliaState/initialResults")?
        .as_object()?
        .values()
        .filter_map(|index| index.pointer("/results/0"))
        .find(|result| result.get("hits").is_some_and(Value::is_array))
}

pub fn parse_page(html: &str, store: &str, category: &Category, scraped_at: &str) -> Result<Listing> {
    let json = script_json(html, "__NEXT_DATA__").context("немає __NEXT_DATA__")?;
    let data: Value = serde_json::from_str(json)?;
    let Some(result) = algolia_result(&data) else {
        // Сторінка розділу без товарів (лише плитки підкатегорій)
        return Ok(Listing::default());
    };
    let hits = result.get("hits").and_then(Value::as_array).context("немає hits")?;
    let pages = result.get("nbPages").and_then(Value::as_u64).unwrap_or(1).max(1) as u32;

    Ok(Listing {
        products: hits
            .iter()
            .filter_map(|hit| product(hit, store, category, scraped_at))
            .collect(),
        total_pages: Some(pages),
    })
}

fn product(hit: &Value, store: &str, category: &Category, scraped_at: &str) -> Option<ScrapedProduct> {
    let text = |pointer: &str| hit.pointer(pointer).and_then(Value::as_str);
    let price = hit.pointer("/currentPrice/priceValue")?.as_f64()?;
    let old_price = hit
        .pointer("/currentPrice/strikePrice/strikePriceValue")
        .and_then(Value::as_f64)
        .filter(|old| *old > price);
    // validUntil є і в звичайних цін (до 2029 р.), тому дата має сенс лише для знижки
    let promo_ends_at = hit
        .pointer("/currentPrice/validUntil")
        .and_then(Value::as_i64)
        .filter(|_| old_price.is_some())
        .and_then(|seconds| DateTime::from_timestamp(seconds, 0))
        .map(|date| date.format("%Y-%m-%d").to_string());
    let image_url = hit
        .get("assets")
        .and_then(Value::as_array)
        .and_then(|assets| {
            assets
                .iter()
                .find(|asset| asset.get("type").and_then(Value::as_str) == Some("primary"))
                .or_else(|| assets.first())
        })
        .and_then(|asset| asset.get("url")?.as_str())
        .map(str::to_string);

    Some(ScrapedProduct {
        external: text("/objectID")?.to_string(),
        name: non_empty(text("/name")?)?,
        price,
        old_price,
        promo_label: text("/currentPrice/priceTagLabels/promoText1").and_then(non_empty),
        promo_ends_at,
        brand: text("/brandName").and_then(non_empty),
        size: text("/salesUnit").and_then(non_empty),
        url: text("/productSlug").map(|slug| format!("{BASE}/produkt/{slug}.html")),
        image_url,
        in_stock: hit.get("isAvailable").and_then(Value::as_bool).unwrap_or(true),
        ..base_product(store, category, scraped_at)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const PAGE: &str = include_str!("../../tests/fixtures/aldi_nord_category.html");
    const SITEMAP: &str = include_str!("../../tests/fixtures/aldi_nord_sitemap.xml");

    fn category() -> Category {
        Category {
            slug: "getraenke-heissgetraenke/cola-limo-schorlen".into(),
            name: "cola-limo-schorlen".into(),
            url: format!("{BASE}/sortiment/getraenke-heissgetraenke/cola-limo-schorlen.html"),
        }
    }

    #[test]
    fn takes_leaf_categories_from_sitemap() {
        let categories = parse_categories(SITEMAP).unwrap();
        let slugs: Vec<&str> = categories.iter().map(|c| c.slug.as_str()).collect();
        assert_eq!(
            slugs,
            [
                "getraenke-heissgetraenke/mineralwasser",
                "getraenke-heissgetraenke/cola-limo-schorlen",
                "milchprodukte/joghurt-quark-milchdesserts"
            ]
        );
    }

    #[test]
    fn parses_algolia_hits() {
        let listing = parse_page(PAGE, "aldi-nord", &category(), "2026-10-11T10:00:00Z").unwrap();
        assert_eq!(listing.total_pages, Some(1));
        assert_eq!(listing.products.len(), 3);

        let cola = &listing.products[0];
        assert_eq!(cola.external, "475");
        assert_eq!(cola.name, "Cola Zero / Light");
        assert_eq!(cola.brand.as_deref(), Some("RIVER"));
        assert_eq!(cola.price, 0.49);
        assert_eq!(cola.old_price, Some(0.65));
        assert_eq!(cola.promo_label.as_deref(), Some("-24 %"));
        assert!(cola.promo_ends_at.is_some());
        assert_eq!(cola.size.as_deref(), Some("1,5-L-Flasche"));
        assert_eq!(cola.url.as_deref(), Some("https://www.aldi-nord.de/produkt/cola-zero-light-475.html"));
        assert!(cola.image_url.as_deref().unwrap().starts_with("https://s7g10.scene7.com/"));
    }

    #[test]
    fn regular_price_has_no_promo() {
        let listing = parse_page(PAGE, "aldi-nord", &category(), "2026-10-11T10:00:00Z").unwrap();
        let fanta = &listing.products[1];
        assert_eq!(fanta.old_price, None);
        assert_eq!(fanta.promo_ends_at, None);
        assert_eq!(fanta.brand, None);
        assert_eq!(listing.products[2].size.as_deref(), Some("6x0,5-L-Flasche"));
    }

    #[test]
    fn section_page_without_products_is_empty() {
        let html = r#"<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{}}}</script>"#;
        let listing = parse_page(html, "aldi-nord", &category(), "2026-10-11T10:00:00Z").unwrap();
        assert!(listing.products.is_empty());
    }
}
