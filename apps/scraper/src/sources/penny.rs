//! PENNY (penny.de): лише щотижневі акції. Сторінка /angebote — це шаблон із порожніми
//! плитками, а пропозиції кожної категорії сайт підвантажує з
//! `/.rest/offers/by-category/<тиждень>/<категорія>` (robots.txt: `Allow: /`).

use std::collections::HashSet;
use std::sync::LazyLock;

use anyhow::{Context, Result};
use chrono::{Datelike, NaiveDate, Weekday};
use scraper::{Html, Selector};
use serde_json::Value;

use super::{Category, Listing, base_product};
use crate::model::ScrapedProduct;
use crate::text::{clean, german_unit, non_empty, parse_price};

pub const START_URL: &str = "https://www.penny.de/angebote";
const SITE: &str = "https://www.penny.de";
const API: &str = "https://www.penny.de/.rest/offers/by-category";

fn selector(css: &str) -> Selector {
    Selector::parse(css).unwrap()
}

static WEEKS: LazyLock<Selector> = LazyLock::new(|| selector("span.js-weeks[data-current-week]"));
static SECTION: LazyLock<Selector> = LazyLock::new(|| {
    selector(".tabs__content--current-week section[data-category-name]")
});
static HEADLINE: LazyLock<Selector> = LazyLock::new(|| selector(".category-bar__hdln"));

/// Категорії поточного тижня. Розділи "ab-donnerstag--…" починають діяти з четверга —
/// до того їхні ціни ще не дійсні, тож пропускаємо їх.
pub fn parse_categories(html: &str, today: NaiveDate) -> Result<Vec<Category>> {
    let document = Html::parse_document(html);
    let week = document
        .select(&WEEKS)
        .next()
        .and_then(|span| span.value().attr("data-current-week"))
        .context("немає номера тижня")?;

    let mut seen = HashSet::new();
    Ok(document
        .select(&SECTION)
        .filter(|section| {
            let start = section.value().id().and_then(|id| id.split("--").next());
            start.and_then(start_weekday).is_none_or(|day| {
                day.num_days_from_monday() <= today.weekday().num_days_from_monday()
            })
        })
        .filter_map(|section| {
            let slug = section.value().attr("data-category-name")?.to_string();
            let name = section
                .select(&HEADLINE)
                .next()
                .and_then(|h| non_empty(&h.text().collect::<String>()))
                .unwrap_or_else(|| slug.clone());
            Some(Category { url: format!("{API}/{week}/{slug}"), slug, name })
        })
        .filter(|category| seen.insert(category.slug.clone()))
        .collect())
}

fn start_weekday(prefix: &str) -> Option<Weekday> {
    Some(match prefix {
        "ab-montag" => Weekday::Mon,
        "ab-dienstag" => Weekday::Tue,
        "ab-mittwoch" => Weekday::Wed,
        "ab-donnerstag" => Weekday::Thu,
        "ab-freitag" => Weekday::Fri,
        "ab-samstag" => Weekday::Sat,
        _ => return None,
    })
}

pub fn parse_page(json: &str, store: &str, category: &Category, scraped_at: &str) -> Result<Listing> {
    let data: Value = serde_json::from_str(json)?;
    let tiles = data.get("offerTiles").and_then(Value::as_array).context("немає offerTiles")?;
    let ends_at = week_end(&category.url);
    Ok(Listing {
        products: tiles
            .iter()
            .filter_map(|tile| product(tile, store, category, scraped_at, ends_at.as_deref()))
            .collect(),
        total_pages: Some(1),
    })
}

/// Акції діють до суботи тижня з URL: ".../2026-42/getraenke" → "2026-10-17"
fn week_end(url: &str) -> Option<String> {
    let week = url.rsplit('/').nth(1)?;
    let (year, number) = week.split_once('-')?;
    let date = NaiveDate::from_isoywd_opt(year.parse().ok()?, number.parse().ok()?, Weekday::Sat)?;
    Some(date.format("%Y-%m-%d").to_string())
}

/// "RITTER SPORT Bunte Vielfalt*" → (Some("RITTER SPORT"), "Bunte Vielfalt").
/// PENNY пише бренд великими літерами на початку назви.
fn split_brand(title: &str) -> (Option<String>, String) {
    let title = clean(&title.replace('\u{ad}', "")).trim_end_matches(['*', '¹', '²', '³']).trim().to_string();
    let words: Vec<&str> = title.split_whitespace().collect();
    let is_upper = |word: &str| {
        let letters: Vec<char> = word.chars().filter(|c| c.is_alphabetic()).collect();
        letters.len() >= 2 && letters.iter().all(|c| c.is_uppercase())
    };
    let brand_words = words.iter().take_while(|word| is_upper(word)).count();
    if brand_words == 0 || brand_words == words.len() {
        return (None, title);
    }
    (Some(words[..brand_words].join(" ")), words[brand_words..].join(" "))
}

fn product(
    tile: &Value,
    store: &str,
    category: &Category,
    scraped_at: &str,
    ends_at: Option<&str>,
) -> Option<ScrapedProduct> {
    let text = |key: &str| tile.get(key).and_then(Value::as_str).and_then(non_empty);
    let (brand, name) = split_brand(&text("title")?);
    let price = parse_price(&text("price")?)?;
    let old_price = ["listPrice", "originalPrice", "crossOutPrice"]
        .iter()
        .find_map(|key| text(key).and_then(|p| parse_price(&p)))
        .filter(|old| *old > price);
    let promo_label = text("advantage")
        .map(|advantage| format!("-{advantage}"))
        .or_else(|| text("benefitPrice").map(|p| format!("PENNY App {}", p.trim_end_matches(['¹', '²', '³']))))
        .or_else(|| {
            tile.get("actionPrice")
                .and_then(Value::as_bool)
                .filter(|action| *action)
                .map(|_| "Aktion".to_string())
        });
    // Стабільний ключ — slug назви з productData; uuid змінюється щотижня
    let external = text("productData")
        .and_then(|data| serde_json::from_str::<Value>(&data).ok())
        .and_then(|data| data.get("name")?.as_str().map(str::to_string))
        .or_else(|| text("uuid"))?;
    let (size, weighted) = german_unit(&text("quantity").unwrap_or_default());

    Some(ScrapedProduct {
        external,
        name,
        brand,
        price,
        old_price,
        promo_ends_at: (promo_label.is_some() || old_price.is_some())
            .then(|| ends_at.map(str::to_string))
            .flatten(),
        promo_label,
        size,
        price_unit: weighted.then(|| "kg".to_string()),
        url: text("linkHref").map(|href| format!("{SITE}{href}")),
        image_url: tile
            .pointer("/imageRendition/tileMd")
            .and_then(Value::as_str)
            .map(str::to_string),
        ..base_product(store, category, scraped_at)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const PAGE: &str = include_str!("../../tests/fixtures/penny_offers.html");
    const OFFERS: &str = include_str!("../../tests/fixtures/penny_category.json");

    fn monday() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 10, 12).unwrap()
    }

    #[test]
    fn builds_category_api_urls_for_current_week() {
        let categories = parse_categories(PAGE, monday()).unwrap();
        let slugs: Vec<&str> = categories.iter().map(|c| c.slug.as_str()).collect();
        // "ab Donnerstag" ще не діє в понеділок
        assert_eq!(slugs, ["top-angebote", "getraenke", "drogerie-und-haushalt"]);
        assert_eq!(categories[1].name, "Getränke");
        assert_eq!(categories[2].name, "Drogerie & Haushalt");
        assert_eq!(
            categories[0].url,
            "https://www.penny.de/.rest/offers/by-category/2026-42/top-angebote"
        );

        let thursday = NaiveDate::from_ymd_opt(2026, 10, 15).unwrap();
        assert_eq!(parse_categories(PAGE, thursday).unwrap().len(), 4);
    }

    #[test]
    fn parses_offer_tiles() {
        let category = parse_categories(PAGE, monday()).unwrap().remove(0);
        let listing = parse_page(OFFERS, "penny-de", &category, "2026-10-12T10:00:00Z").unwrap();
        assert_eq!(listing.products.len(), 4);

        let cheese = &listing.products[0];
        assert_eq!(cheese.external, "philadelphia-frischkaesezubereitung");
        assert_eq!(cheese.brand.as_deref(), Some("PHILADELPHIA"));
        assert_eq!(cheese.name, "Frischkäsezubereitung");
        assert_eq!(cheese.price, 1.11);
        assert_eq!(cheese.old_price, Some(2.29));
        assert_eq!(cheese.promo_label.as_deref(), Some("-51%"));
        assert_eq!(cheese.promo_ends_at.as_deref(), Some("2026-10-17"));
        assert_eq!(cheese.size.as_deref(), Some("195 g"));
        assert!(cheese.url.as_deref().unwrap().starts_with("https://www.penny.de/angebote/"));

        let chocolate = &listing.products[1];
        assert_eq!(chocolate.brand.as_deref(), Some("RITTER SPORT"));
        assert_eq!(chocolate.name, "Bunte Vielfalt");

        let tomatoes = &listing.products[3];
        assert_eq!(tomatoes.brand, None);
        assert_eq!(tomatoes.name, "Cherry-Romatomaten");
        assert_eq!(tomatoes.old_price, None);
        assert_eq!(tomatoes.promo_label.as_deref(), Some("Aktion"));
        assert_eq!(tomatoes.size.as_deref(), Some("250-g-Schale"));
    }

    #[test]
    fn splits_uppercase_brand() {
        assert_eq!(split_brand("BIO"), (None, "BIO".into()));
        assert_eq!(
            split_brand("COCA-COLA Zero*"),
            (Some("COCA-COLA".into()), "Zero".into())
        );
        assert_eq!(split_brand("Äpfel, rot"), (None, "Äpfel, rot".into()));
    }
}
