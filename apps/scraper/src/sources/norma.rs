//! NORMA (norma-online.de): щотижневі акції, згруповані в тематичні сторінки
//! "/de/angebote/ab-montag,-12.10.26/mediterraner-genuss-t-389133/" (звичайний SSR HTML).
//! Повного асортименту з цінами на сайті немає.

use std::collections::HashSet;
use std::sync::LazyLock;

use anyhow::Result;
use chrono::{Duration, NaiveDate};
use regex::Regex;
use scraper::{ElementRef, Html, Selector};

use super::{Category, Listing, base_product};
use crate::model::ScrapedProduct;
use crate::text::{clean, german_unit, non_empty, parse_price};

pub const START_URL: &str = "https://www.norma-online.de/de/angebote/";
const SITE: &str = "https://www.norma-online.de";

fn selector(css: &str) -> Selector {
    Selector::parse(css).unwrap()
}

/// "/de/angebote/ab-montag,-12.10.26/mediterraner-genuss-t-389133/"
static THEME: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^/de/angebote/ab-[a-z]+,-(\d{2})\.(\d{2})\.(\d{2})/([a-z0-9-]+)-t-(\d+)/").unwrap()
});
static LINK: LazyLock<Selector> = LazyLock::new(|| selector("a[href]"));
static BOX: LazyLock<Selector> = LazyLock::new(|| selector("article.produktBoxContainer"));
static ANCHOR: LazyLock<Selector> = LazyLock::new(|| selector("a[href]"));
static IMAGE: LazyLock<Selector> = LazyLock::new(|| selector(".produktBox-img img"));
static BRAND: LazyLock<Selector> = LazyLock::new(|| selector("strong.supplier"));
static NAME: LazyLock<Selector> = LazyLock::new(|| selector("h3.produktBox-txt-headline"));
static UNIT: LazyLock<Selector> =
    LazyLock::new(|| selector("li.produktBox-txt-inh, li.produktBox-txt-ref"));
static PRICE: LazyLock<Selector> =
    LazyLock::new(|| selector("li.produktBox-cont-wrapper-price span"));
static OLD_PRICE: LazyLock<Selector> = LazyLock::new(|| selector("li.produktBox-cont-wrapper-uvp"));
static SAVING: LazyLock<Selector> =
    LazyLock::new(|| selector(".produktBox-cont-wrapper-billiger p"));

/// Тематичні сторінки, що вже діють: від сьогодні й до тижня тому.
/// Сторінки "ab Mittwoch" чи наступного тижня пропускаємо, поки їхні ціни не почали діяти.
pub fn parse_categories(html: &str, today: NaiveDate) -> Result<Vec<Category>> {
    let document = Html::parse_document(html);
    let mut seen = HashSet::new();
    Ok(document
        .select(&LINK)
        .filter_map(|link| {
            let href = link.value().attr("href")?;
            let caps = THEME.captures(href)?;
            let year: i32 = caps[3].parse().ok()?;
            let start =
                NaiveDate::from_ymd_opt(2000 + year, caps[2].parse().ok()?, caps[1].parse().ok()?)?;
            if start > today || start <= today - Duration::days(7) {
                return None;
            }
            let id = caps[5].to_string();
            if !seen.insert(id) {
                return None;
            }
            Some(Category {
                slug: caps[4].to_string(),
                name: non_empty(&link.text().collect::<String>()).unwrap_or_else(|| caps[4].to_string()),
                url: format!("{SITE}{}", &caps[0]),
            })
        })
        .collect())
}

pub fn parse_page(html: &str, store: &str, category: &Category, scraped_at: &str) -> Result<Listing> {
    let document = Html::parse_document(html);
    Ok(Listing {
        products: document
            .select(&BOX)
            .filter_map(|card| product(card, store, category, scraped_at))
            .collect(),
        total_pages: Some(1),
    })
}

fn text_of(card: ElementRef, selector: &Selector) -> Option<String> {
    card.select(selector)
        .find_map(|el| non_empty(&el.text().collect::<String>()))
}

fn product(card: ElementRef, store: &str, category: &Category, scraped_at: &str) -> Option<ScrapedProduct> {
    let external = card.value().id()?.strip_prefix("of_")?.to_string();
    let price_el = card.select(&PRICE).next()?;
    // aria-label="1,99 Euro" надійніше за текст із виносками "1,99*"
    let price = price_el
        .value()
        .attr("aria-label")
        .and_then(parse_price)
        .or_else(|| parse_price(&price_el.text().collect::<String>()))?;
    // "UVP 2,99" — закреслена рекомендована ціна; "z.B. 640 g" — лише підказка до ваги
    let old_price = card
        .select(&OLD_PRICE)
        .filter(|el| !el.value().classes().any(|c| c.ends_with("uvp-info")))
        .find_map(|el| parse_price(&el.text().collect::<String>()))
        .filter(|old| *old > price);
    let (size, weighted) = german_unit(&text_of(card, &UNIT).unwrap_or_default());

    Some(ScrapedProduct {
        external,
        name: text_of(card, &NAME)?,
        brand: text_of(card, &BRAND),
        price,
        old_price,
        promo_label: text_of(card, &SAVING).map(|saving| clean(&saving)),
        size,
        price_unit: weighted.then(|| "kg".to_string()),
        url: card
            .select(&ANCHOR)
            .next()
            .and_then(|a| a.value().attr("href"))
            .map(|href| format!("{SITE}{href}")),
        image_url: card
            .select(&IMAGE)
            .next()
            .and_then(|img| img.value().attr("src"))
            .map(|src| if src.starts_with('/') { format!("{SITE}{src}") } else { src.to_string() }),
        ..base_product(store, category, scraped_at)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const INDEX: &str = include_str!("../../tests/fixtures/norma_index.html");
    const THEME_PAGE: &str = include_str!("../../tests/fixtures/norma_theme.html");

    #[test]
    fn keeps_only_themes_that_already_started() {
        let monday = NaiveDate::from_ymd_opt(2026, 10, 12).unwrap();
        let categories = parse_categories(INDEX, monday).unwrap();
        assert_eq!(categories.len(), 10);
        assert!(categories.iter().all(|c| c.url.contains("ab-montag,-12.10.26")));
        let genuss = categories.iter().find(|c| c.slug == "mediterraner-genuss").unwrap();
        assert_eq!(genuss.name, "Mediterraner Genuss");
        assert_eq!(
            genuss.url,
            "https://www.norma-online.de/de/angebote/ab-montag,-12.10.26/mediterraner-genuss-t-389133/"
        );

        let wednesday = NaiveDate::from_ymd_opt(2026, 10, 14).unwrap();
        assert_eq!(parse_categories(INDEX, wednesday).unwrap().len(), 14);
    }

    #[test]
    fn parses_product_boxes() {
        let category = Category {
            slug: "mediterraner-genuss".into(),
            name: "Mediterraner Genuss".into(),
            url: "https://www.norma-online.de/de/angebote/x/".into(),
        };
        let listing = parse_page(THEME_PAGE, "norma-de", &category, "2026-10-12T10:00:00Z").unwrap();
        assert_eq!(listing.products.len(), 4);

        let speck = &listing.products[0];
        assert_eq!(speck.external, "389757");
        assert_eq!(speck.brand.as_deref(), Some("Senfter"));
        assert_eq!(speck.name, "Südtiroler Speck");
        assert_eq!(speck.price, 8.95);
        assert_eq!(speck.old_price, None);
        assert_eq!(speck.size.as_deref(), Some("640 g"));
        assert!(speck.image_url.as_deref().unwrap().starts_with("https://www.norma-online.de/ext/img/"));

        let pinsa = &listing.products[1];
        assert_eq!(pinsa.name, "La Pinsa");
        assert_eq!(pinsa.price, 1.99);
        assert_eq!(pinsa.old_price, Some(2.99));
        assert_eq!(pinsa.promo_label.as_deref(), Some("33% billiger"));
        assert_eq!(pinsa.size.as_deref(), Some("230 g"));
    }
}
