//! Globus (produkte.globus.de): Shopware SSR. У кожній плитці є EAN (data-product-gtin).

use std::collections::HashSet;
use std::sync::LazyLock;

use anyhow::Result;
use scraper::{ElementRef, Html, Selector};
use serde_json::Value;

use super::{Category, Listing, base_product};
use crate::model::ScrapedProduct;
use crate::text::{clean, non_empty, parse_price};

pub const START_URL: &str = "https://produkte.globus.de/";
/// Службові розділи меню, де немає товарів з цінами
const SKIP: &[&str] = &["/globus/", "geschenkgutscheine", "restaurant", "vorbestellservice"];

fn selector(css: &str) -> Selector {
    Selector::parse(css).unwrap()
}

static ROOT_LINK: LazyLock<Selector> =
    LazyLock::new(|| selector("a.navigation-mega-menu-category-link"));
static BOX: LazyLock<Selector> = LazyLock::new(|| selector(".product-box"));
static NAME: LazyLock<Selector> = LazyLock::new(|| selector("a.product-name"));
static BRAND: LazyLock<Selector> = LazyLock::new(|| selector(".product-manufacturer"));
static GTIN: LazyLock<Selector> = LazyLock::new(|| selector("[data-product-gtin]"));
static PRICE: LazyLock<Selector> = LazyLock::new(|| selector(".js-unit-price"));
static OLD_PRICE: LazyLock<Selector> =
    LazyLock::new(|| selector(".list-price-price, .list-price, .product-price-old"));
static UNIT: LazyLock<Selector> = LazyLock::new(|| selector(".price-unit-content"));
static IMAGE: LazyLock<Selector> = LazyLock::new(|| selector("a.product-image-link img"));
static OUT_OF_STOCK: LazyLock<Selector> =
    LazyLock::new(|| selector(r#"link[href*="OutOfStock"]"#));
static LAST_PAGE: LazyLock<Selector> = LazyLock::new(|| selector("input#p-last"));

pub fn parse_categories(html: &str) -> Result<Vec<Category>> {
    let document = Html::parse_document(html);
    let mut seen = HashSet::new();
    Ok(document
        .select(&ROOT_LINK)
        .filter_map(|link| {
            let url = link.value().attr("href")?.to_string();
            let name = link
                .value()
                .attr("data-mega-menu-navigation-name")
                .map(clean)
                .unwrap_or_else(|| clean(&link.text().collect::<String>()));
            Some((url, name))
        })
        .filter(|(url, _)| !SKIP.iter().any(|skip| url.contains(skip)))
        .filter(|(url, _)| seen.insert(url.clone()))
        .map(|(url, name)| Category {
            slug: url.trim_start_matches(START_URL).trim_matches('/').to_string(),
            name,
            url,
        })
        .collect())
}

pub fn parse_page(html: &str, store: &str, category: &Category, scraped_at: &str) -> Result<Listing> {
    let document = Html::parse_document(html);
    let products = document
        .select(&BOX)
        .filter_map(|card| product(card, store, category, scraped_at))
        .collect();
    let total_pages = document
        .select(&LAST_PAGE)
        .next()
        .and_then(|input| input.value().attr("value"))
        .and_then(|value| value.parse().ok())
        .unwrap_or(1);
    Ok(Listing { products, total_pages: Some(total_pages) })
}

fn product(card: ElementRef, store: &str, category: &Category, scraped_at: &str) -> Option<ScrapedProduct> {
    let first = |selector: &Selector| card.select(selector).next();
    let name_link = first(&NAME)?;
    let price: f64 = first(&PRICE)?.value().attr("data-value")?.parse().ok()?;
    let gtin = first(&GTIN).and_then(|el| el.value().attr("data-product-gtin"));
    // Shopware-ID з data-product-information; якщо його немає — EAN
    let external = card
        .value()
        .attr("data-product-information")
        .and_then(|json| serde_json::from_str::<Value>(json).ok())
        .and_then(|info| info.get("id")?.as_str().map(str::to_string))
        .or_else(|| gtin.map(str::to_string))?;
    // "2 l (1,10 € / 1 l) zzgl. Pfand 0.25 €" → "2 l"
    let size = card
        .select(&UNIT)
        .filter_map(|el| non_empty(&el.text().collect::<String>()))
        .next()
        .and_then(|text| non_empty(text.split('(').next().unwrap_or_default()));

    Some(ScrapedProduct {
        external,
        name: non_empty(&name_link.text().collect::<String>())
            .or_else(|| name_link.value().attr("title").map(clean))?,
        price,
        old_price: first(&OLD_PRICE)
            .and_then(|el| parse_price(&el.text().collect::<String>()))
            .filter(|old| *old > price),
        brand: first(&BRAND)
            .and_then(|el| el.value().attr("title"))
            .and_then(non_empty),
        barcodes: gtin.map(|g| vec![g.to_string()]).unwrap_or_default(),
        url: name_link.value().attr("href").map(str::to_string),
        image_url: first(&IMAGE)
            .and_then(|img| img.value().attr("src"))
            .map(str::to_string),
        in_stock: first(&OUT_OF_STOCK).is_none(),
        size,
        ..base_product(store, category, scraped_at)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("../../tests/fixtures/globus_category.html");

    fn category() -> Category {
        Category {
            slug: "getraenke".into(),
            name: "Getränke".into(),
            url: "https://produkte.globus.de/getraenke/".into(),
        }
    }

    #[test]
    fn parses_root_categories_without_service_pages() {
        let categories = parse_categories(FIXTURE).unwrap();
        let slugs: Vec<&str> = categories.iter().map(|c| c.slug.as_str()).collect();
        assert_eq!(slugs, ["getraenke", "milchprodukte-eier"]);
        assert_eq!(categories[1].name, "Milchprodukte & Eier");
    }

    #[test]
    fn parses_product_boxes_with_gtin() {
        let listing = parse_page(FIXTURE, "globus-de", &category(), "2026-10-11T10:00:00Z").unwrap();
        assert_eq!(listing.total_pages, Some(518));
        assert_eq!(listing.products.len(), 3);

        let cola = &listing.products[0];
        assert_eq!(cola.external, "41ab87f38d520f52d834130c5529a740");
        assert_eq!(cola.name, "Cola, zuckerfrei");
        assert_eq!(cola.brand.as_deref(), Some("Coca Cola"));
        assert_eq!(cola.price, 2.19);
        assert_eq!(cola.size.as_deref(), Some("2 l"));
        assert_eq!(cola.barcodes, ["5000112552218"]);
        assert!(cola.in_stock);
        assert_eq!(
            cola.url.as_deref(),
            Some("https://produkte.globus.de/getraenke/soft-drinks/cola-limonaden/5000112552218/cola-zuckerfrei")
        );
        assert!(cola.image_url.as_deref().unwrap().contains("5000112552218"));
    }
}
