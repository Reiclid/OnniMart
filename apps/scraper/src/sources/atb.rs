//! АТБ: SSR HTML. Поки вимкнено в seed — сайт на технічних роботах (жовтень 2026).

use std::collections::HashSet;
use std::sync::LazyLock;

use anyhow::Result;
use chrono::Local;
use scraper::{ElementRef, Html, Selector};

use super::{Category, Listing, base_product};
use crate::model::ScrapedProduct;
use crate::text::{clean, day_month_to_date, non_empty};

pub const START_URL: &str = "https://www.atbmarket.com/catalog";
const BASE: &str = "https://www.atbmarket.com";
/// Добірки (економія, новинки, акції) дублюють товари; novetly ще й закрита в robots.txt
const SKIP: &[&str] = &["economy", "novetly", "aktsiya"];

fn selector(css: &str) -> Selector {
    Selector::parse(css).unwrap()
}

static ROOT_LINK: LazyLock<Selector> = LazyLock::new(|| selector("a.category-menu__link-wrap"));
static ROOT_NAME: LazyLock<Selector> = LazyLock::new(|| selector(".category-menu__link"));
static CARD: LazyLock<Selector> = LazyLock::new(|| selector("article.catalog-item"));
static TITLE: LazyLock<Selector> = LazyLock::new(|| selector(".catalog-item__title a"));
static ID: LazyLock<Selector> = LazyLock::new(|| selector("[data-productid]"));
static PRICE: LazyLock<Selector> = LazyLock::new(|| selector("data.product-price__top"));
static OLD_PRICE: LazyLock<Selector> = LazyLock::new(|| selector("data.product-price__bottom"));
static UNIT: LazyLock<Selector> = LazyLock::new(|| selector(".product-price__unit"));
static IMAGE: LazyLock<Selector> = LazyLock::new(|| selector("img.catalog-item__img"));
static LABEL: LazyLock<Selector> = LazyLock::new(|| selector(".custom-product-label"));
static LABEL_DATE: LazyLock<Selector> = LazyLock::new(|| selector(".custom-product-label__date"));
static PAGE_LINK: LazyLock<Selector> = LazyLock::new(|| selector(".product-pagination__link"));

pub fn parse_categories(html: &str) -> Result<Vec<Category>> {
    let document = Html::parse_document(html);
    let mut seen = HashSet::new();
    Ok(document
        .select(&ROOT_LINK)
        .filter_map(|link| {
            let href = link.value().attr("href")?;
            let name = link
                .select(&ROOT_NAME)
                .next()
                .map(|el| clean(&el.text().collect::<String>()))
                .unwrap_or_default();
            Some((href.to_string(), name))
        })
        .filter(|(href, _)| !SKIP.iter().any(|skip| href.contains(skip)))
        .filter(|(href, _)| seen.insert(href.clone()))
        .map(|(href, name)| Category {
            slug: href.trim_start_matches("/catalog/").to_string(),
            name,
            url: format!("{BASE}{href}"),
        })
        .collect())
}

pub fn parse_page(html: &str, store: &str, category: &Category, scraped_at: &str) -> Result<Listing> {
    let document = Html::parse_document(html);
    let products = document
        .select(&CARD)
        .filter_map(|card| product(card, store, category, scraped_at))
        .collect();
    let total_pages = document
        .select(&PAGE_LINK)
        .filter_map(|link| clean(&link.text().collect::<String>()).parse::<u32>().ok())
        .max()
        .unwrap_or(1);
    Ok(Listing { products, total_pages: Some(total_pages) })
}

fn product(card: ElementRef, store: &str, category: &Category, scraped_at: &str) -> Option<ScrapedProduct> {
    let first = |selector: &Selector| card.select(selector).next();
    let attr_number = |selector: &Selector| -> Option<f64> {
        first(selector)?.value().attr("value")?.parse().ok()
    };
    let title = first(&TITLE)?;
    let price = attr_number(&PRICE)?;
    let unit = first(&UNIT).map(|el| el.text().collect::<String>()).unwrap_or_default();
    let label = first(&LABEL);
    // У мітці "-40% до 13.10" перший текстовий вузол — знижка, далі дата
    let promo_label = label.and_then(|el| el.text().next()).and_then(non_empty);
    let promo_ends_at = first(&LABEL_DATE)
        .and_then(|el| day_month_to_date(&el.text().collect::<String>(), Local::now().date_naive()));

    Some(ScrapedProduct {
        external: first(&ID)?.value().attr("data-productid")?.to_string(),
        name: non_empty(&title.text().collect::<String>())?,
        price,
        old_price: attr_number(&OLD_PRICE).filter(|old| *old > price),
        url: title.value().attr("href").map(|href| format!("{BASE}{href}")),
        image_url: first(&IMAGE)
            .and_then(|img| img.value().attr("src"))
            .map(str::to_string),
        price_unit: Some(if unit.contains("кг") { "кг" } else { "шт" }.into()),
        promo_label,
        promo_ends_at,
        ..base_product(store, category, scraped_at)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("../../tests/fixtures/atb_category.html");

    fn category() -> Category {
        Category {
            slug: "285-bakaliya".into(),
            name: "Бакалія".into(),
            url: format!("{BASE}/catalog/285-bakaliya"),
        }
    }

    #[test]
    fn parses_root_categories_without_collections() {
        let categories = parse_categories(FIXTURE).unwrap();
        let slugs: Vec<&str> = categories.iter().map(|c| c.slug.as_str()).collect();
        assert_eq!(slugs, ["287-ovochi-ta-frukti", "285-bakaliya"]);
        assert_eq!(categories[1].name, "Бакалія");
    }

    #[test]
    fn parses_product_cards() {
        let listing = parse_page(FIXTURE, "atb", &category(), "2026-10-11T10:00:00Z").unwrap();
        assert_eq!(listing.total_pages, Some(14));
        assert_eq!(listing.products.len(), 2);

        let topping = &listing.products[0];
        assert_eq!(topping.external, "200092");
        assert!(topping.name.starts_with("Приправа-топінг 20 г Avocado Up"));
        assert_eq!(topping.price, 19.9);
        assert_eq!(topping.old_price, Some(33.7));
        assert_eq!(topping.price_unit.as_deref(), Some("шт"));
        assert_eq!(topping.promo_label.as_deref(), Some("-40%"));
        assert_eq!(topping.promo_ends_at, None);
        assert!(topping.url.as_deref().unwrap().starts_with("https://www.atbmarket.com/product/"));

        // "-40% до 13.10": знижка й дата закінчення акції в одній мітці
        let second = &listing.products[1];
        assert_eq!(second.promo_label.as_deref(), Some("-40%"));
        assert!(second.promo_ends_at.as_deref().unwrap().ends_with("-10-13"));
    }
}
