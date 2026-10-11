//! ALDI SÜD: Nuxt SSR, товари в HTML-плитках, пагінація ?page=N (дозволена robots.txt).

use std::collections::HashSet;
use std::sync::LazyLock;

use anyhow::Result;
use regex::Regex;
use scraper::{ElementRef, Html, Selector};

use super::{Category, Listing, base_product};
use crate::model::ScrapedProduct;
use crate::text::{non_empty, parse_price};

pub const START_URL: &str = "https://www.aldi-sued.de/produkte";
const BASE: &str = "https://www.aldi-sued.de";
/// Тематичні добірки, що дублюють товари з основних категорій
const SKIP: &[&str] = &[
    "markenprodukte",
    "bio-produkte",
    "fairtrade-produkte",
    "dauerhaft-guenstig",
    "genuss",
];

static CATEGORY_LINK: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"href="(/produkte/([a-z0-9-]+)/k/\d+)""#).unwrap());
static PAGE_LINK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\?page=(\d+)").unwrap());

fn selector(css: &str) -> Selector {
    Selector::parse(css).unwrap()
}

static TILE: LazyLock<Selector> = LazyLock::new(|| selector(r#"div[id^="product-tile-"]"#));
static LINK: LazyLock<Selector> = LazyLock::new(|| selector("a.product-tile__link"));
static NAME: LazyLock<Selector> = LazyLock::new(|| selector(".product-tile__name"));
static BRAND: LazyLock<Selector> = LazyLock::new(|| selector(".product-tile__brandname"));
static SIZE: LazyLock<Selector> = LazyLock::new(|| selector(".product-tile__unit-of-measurement"));
static PRICE: LazyLock<Selector> = LazyLock::new(|| selector(".base-price__regular"));
static OLD_PRICE: LazyLock<Selector> = LazyLock::new(|| {
    selector(r#".base-price [class*="strike"], .base-price s, .base-price del"#)
});
static DISCOUNT: LazyLock<Selector> = LazyLock::new(|| selector(".base-price__discount-tag"));
static PROMO_BADGE: LazyLock<Selector> = LazyLock::new(|| selector(".base-label--red"));
static IMAGE: LazyLock<Selector> = LazyLock::new(|| selector("img.base-image"));

pub fn parse_categories(html: &str) -> Result<Vec<Category>> {
    let mut seen = HashSet::new();
    Ok(CATEGORY_LINK
        .captures_iter(html)
        .filter(|caps| !SKIP.iter().any(|skip| caps[2].contains(skip)))
        .filter(|caps| seen.insert(caps[1].to_string()))
        .map(|caps| Category {
            slug: caps[2].to_string(),
            name: caps[2].to_string(),
            url: format!("{BASE}{}", &caps[1]),
        })
        .collect())
}

pub fn parse_page(html: &str, store: &str, category: &Category, scraped_at: &str) -> Result<Listing> {
    let document = Html::parse_document(html);
    let products = document
        .select(&TILE)
        .filter_map(|tile| product(tile, store, category, scraped_at))
        .collect();
    let total_pages = PAGE_LINK
        .captures_iter(html)
        .filter_map(|caps| caps[1].parse::<u32>().ok())
        .max()
        .unwrap_or(1);
    Ok(Listing { products, total_pages: Some(total_pages) })
}

fn text_of(tile: ElementRef, selector: &Selector) -> Option<String> {
    tile.select(selector)
        .next()
        .and_then(|el| non_empty(&el.text().collect::<String>()))
}

fn product(tile: ElementRef, store: &str, category: &Category, scraped_at: &str) -> Option<ScrapedProduct> {
    let external = tile.value().attr("id")?.trim_start_matches("product-tile-").to_string();
    let price = text_of(tile, &PRICE).and_then(|p| parse_price(&p))?;
    let discount = text_of(tile, &DISCOUNT);

    Some(ScrapedProduct {
        external,
        name: text_of(tile, &NAME)?,
        price,
        old_price: text_of(tile, &OLD_PRICE)
            .and_then(|p| parse_price(&p))
            .filter(|old| *old > price),
        promo_label: discount.or_else(|| text_of(tile, &PROMO_BADGE)),
        brand: text_of(tile, &BRAND),
        size: text_of(tile, &SIZE),
        url: tile
            .select(&LINK)
            .next()
            .and_then(|a| a.value().attr("href"))
            .map(|href| format!("{BASE}{href}")),
        image_url: tile
            .select(&IMAGE)
            .next()
            .and_then(|img| img.value().attr("src"))
            .map(str::to_string),
        ..base_product(store, category, scraped_at)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("../../tests/fixtures/aldi_sued_category.html");

    fn category() -> Category {
        Category {
            slug: "milchprodukte-eier".into(),
            name: "milchprodukte-eier".into(),
            url: format!("{BASE}/produkte/milchprodukte-eier/k/1588161425467093"),
        }
    }

    #[test]
    fn parses_top_level_categories_once() {
        let categories = parse_categories(FIXTURE).unwrap();
        let slugs: Vec<&str> = categories.iter().map(|c| c.slug.as_str()).collect();
        assert_eq!(slugs, ["fleisch-fisch", "getraenke", "kaese"]);
        assert_eq!(categories[0].url, "https://www.aldi-sued.de/produkte/fleisch-fisch/k/1588161425467052");
    }

    #[test]
    fn parses_product_tiles() {
        let listing = parse_page(FIXTURE, "aldi-sued", &category(), "2026-10-11T10:00:00Z").unwrap();
        assert_eq!(listing.total_pages, Some(9));
        assert_eq!(listing.products.len(), 3);

        let ayran = &listing.products[0];
        assert_eq!(ayran.external, "000000000530678001");
        assert_eq!(ayran.name, "Ayran 500 g");
        assert_eq!(ayran.brand.as_deref(), Some("MÜLLER"));
        assert_eq!(ayran.size.as_deref(), Some("500 g"));
        assert_eq!(ayran.price, 0.79);
        assert_eq!(ayran.old_price, None);
        assert_eq!(ayran.promo_label.as_deref(), Some("Aktion"));
        assert_eq!(
            ayran.url.as_deref(),
            Some("https://www.aldi-sued.de/produkt/mueller-ayran-500-g-000000000530678001")
        );
        assert!(ayran.image_url.as_deref().unwrap().starts_with("https://dm.emea.cms.aldi.cx/"));
    }
}
