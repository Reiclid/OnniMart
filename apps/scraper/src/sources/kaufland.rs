//! Kaufland (filiale.kaufland.de): повного асортименту з цінами на сайті немає — лише
//! щотижневі акції. Сторінка огляду акцій дозволена robots.txt (заборонені лише сторінки
//! деталей) і містить усі пропозиції тижня в JSON для Vue SSR:
//! `window.SSR['…'] = {"component":"OfferTemplate","props":{"offerData":{"cycles":[…]}}}`.

use std::collections::HashMap;
use std::sync::LazyLock;

use anyhow::{Context, Result};
use chrono::NaiveDate;
use regex::Regex;
use serde_json::Value;

use super::{Category, Listing, base_product};
use crate::model::ScrapedProduct;
use crate::text::{german_unit, json_object_after, non_empty, parse_price};

pub const START_URL: &str = "https://filiale.kaufland.de/angebote/uebersicht.html";

/// Частина зображень названа штрихкодом: ".../schwarz/4002334119577_DE_P-1"
static GTIN_IN_IMAGE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"/(\d{13,14})(?:_|$)").unwrap());

/// Усі пропозиції лежать на одній сторінці, тож і "категорія" одна.
/// Справжні категорії (Obst, Getränke…) беремо з JSON кожної пропозиції.
pub fn parse_categories(_html: &str) -> Result<Vec<Category>> {
    Ok(vec![Category {
        slug: "angebote".into(),
        name: "Angebote".into(),
        url: START_URL.into(),
    }])
}

pub fn parse_page(
    html: &str,
    store: &str,
    category: &Category,
    scraped_at: &str,
    today: NaiveDate,
) -> Result<Listing> {
    // На сторінці може бути кілька SSR-компонентів — потрібен саме OfferTemplate
    let marker = html
        .find(r#""component":"OfferTemplate""#)
        .context("немає даних Vue SSR з акціями")?;
    let script = html[..marker].rfind("window.SSR[").context("немає window.SSR")?;
    let json = json_object_after(&html[script..], "window.SSR[").context("обрізаний JSON")?;
    let state: Value = serde_json::from_str(json)?;
    let cycles = state
        .pointer("/props/offerData/cycles")
        .and_then(Value::as_array)
        .context("немає offerData")?;

    // Одна позиція буває в кількох циклах (Mo–Sa, Do–Sa, минулий тиждень):
    // беремо ту пропозицію, що діє сьогодні
    let mut offers: Vec<(&Value, String)> = Vec::new();
    let mut index: HashMap<String, usize> = HashMap::new();
    for cycle in cycles {
        let categories = cycle.get("categories").and_then(Value::as_array);
        for group in categories.into_iter().flatten() {
            let group_name = text(group, "displayName")
                .or_else(|| text(group, "name"))
                .unwrap_or_else(|| category.name.clone());
            let list = group.get("offers").and_then(Value::as_array);
            for offer in list.into_iter().flatten() {
                let Some(key) = text(offer, "klNr").or_else(|| text(offer, "offerId")) else {
                    continue;
                };
                match index.get(&key) {
                    None => {
                        index.insert(key, offers.len());
                        offers.push((offer, group_name.clone()));
                    }
                    Some(&i) if !is_current(offers[i].0, today) && is_current(offer, today) => {
                        offers[i] = (offer, group_name.clone());
                    }
                    Some(_) => {}
                }
            }
        }
    }

    Ok(Listing {
        products: offers
            .into_iter()
            .filter_map(|(offer, group)| product(offer, &group, store, category, scraped_at))
            .collect(),
        total_pages: Some(1),
    })
}

fn text(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).and_then(non_empty)
}

fn date(value: &Value, key: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(value.get(key)?.as_str()?, "%Y-%m-%d").ok()
}

fn is_current(offer: &Value, today: NaiveDate) -> bool {
    matches!(
        (date(offer, "dateFrom"), date(offer, "dateTo")),
        (Some(from), Some(to)) if from <= today && today <= to
    )
}

fn product(
    offer: &Value,
    group: &str,
    store: &str,
    category: &Category,
    scraped_at: &str,
) -> Option<ScrapedProduct> {
    let title = text(offer, "title")?;
    // "HASSERÖDER" + "Premium Pils": заголовок — бренд, підзаголовок — товар.
    // Без підзаголовка (фрукти, овочі) заголовок і є назвою.
    let (name, brand) = match text(offer, "subtitle") {
        Some(subtitle) => (subtitle, Some(title)),
        None => (title, None),
    };

    // Акція лише з карткою Kaufland: звичайна ціна 0, ціна з карткою — окремим полем ("0.99*")
    let shelf_price = offer.get("price").and_then(Value::as_f64).filter(|p| *p > 0.0);
    let card_price = text(offer, "loyaltyFormattedPrice").and_then(|p| parse_price(&p));
    let card_only = shelf_price.is_none() && card_price.is_some();
    let price = shelf_price.or(card_price)?;
    let old_key = if card_only { "loyaltyFormattedOldPrice" } else { "formattedOldPrice" };
    let old_price = text(offer, old_key)
        .and_then(|p| parse_price(&p))
        .filter(|old| *old > price);

    let discount_key = if card_only { "loyaltyDiscount" } else { "discount" };
    let discount = offer.get(discount_key).and_then(Value::as_u64).filter(|d| *d > 0);
    let with_card = card_only
        || text(offer, "detailTitle").is_some_and(|t| t.contains("Kaufland Card"));
    let promo_label = match (with_card, discount) {
        (true, Some(d)) => Some(format!("Kaufland Card -{d}%")),
        (true, None) => Some("Kaufland Card".to_string()),
        (false, Some(d)) => Some(format!("-{d}%")),
        (false, None) => None,
    };
    let on_promo = promo_label.is_some() || old_price.is_some();

    let (size, weighted) = german_unit(&text(offer, "unit").unwrap_or_default());
    let image_url = text(offer, "listImage");
    let barcodes = image_url
        .as_deref()
        .and_then(|url| GTIN_IN_IMAGE.captures(url))
        .map(|caps| vec![caps[1].to_string()])
        .unwrap_or_default();

    Some(ScrapedProduct {
        external: text(offer, "klNr").or_else(|| text(offer, "offerId"))?,
        name,
        brand,
        price,
        old_price,
        promo_label,
        promo_ends_at: on_promo
            .then(|| text(offer, "salesTo").or_else(|| text(offer, "dateTo")))
            .flatten(),
        size,
        price_unit: weighted.then(|| "kg".to_string()),
        barcodes,
        image_url,
        url: Some(START_URL.to_string()),
        category: Some(group.to_string()),
        ..base_product(store, category, scraped_at)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("../../tests/fixtures/kaufland_offers.html");

    fn listing() -> Listing {
        let category = parse_categories(FIXTURE).unwrap().remove(0);
        let today = NaiveDate::from_ymd_opt(2026, 10, 12).unwrap();
        parse_page(FIXTURE, "kaufland-de", &category, "2026-10-12T10:00:00Z", today).unwrap()
    }

    fn find<'a>(listing: &'a Listing, external: &str) -> &'a ScrapedProduct {
        listing.products.iter().find(|p| p.external == external).unwrap()
    }

    #[test]
    fn has_single_offers_page() {
        let categories = parse_categories("").unwrap();
        assert_eq!(categories.len(), 1);
        assert_eq!(categories[0].url, START_URL);
    }

    #[test]
    fn parses_weekly_offers_once_per_article() {
        let listing = listing();
        assert_eq!(listing.total_pages, Some(1));
        // 5 позицій, дубль апельсинів з минулого тижня відкинуто
        assert_eq!(listing.products.len(), 5);

        let oranges = find(&listing, "01134564");
        assert_eq!(oranges.name, "Südafrik. Orangen");
        assert_eq!(oranges.brand, None);
        assert_eq!(oranges.price, 1.99);
        assert_eq!(oranges.old_price, Some(3.49));
        assert_eq!(oranges.promo_label.as_deref(), Some("-42%"));
        assert_eq!(oranges.promo_ends_at.as_deref(), Some("2026-10-17"));
        assert_eq!(oranges.size.as_deref(), Some("1,5-kg-Netz"));
        assert_eq!(oranges.category.as_deref(), Some("Obst, Gemüse, Pflanzen"));
    }

    #[test]
    fn splits_brand_and_multipack() {
        let listing = listing();
        let beer = find(&listing, "01453428");
        assert_eq!(beer.brand.as_deref(), Some("HASSERÖDER"));
        assert_eq!(beer.name, "Premium Pils");
        assert_eq!(beer.price, 7.99);
        assert_eq!(beer.size.as_deref(), Some("Ka. 20 x 0,5-l-Fl."));
        // Зображення назване номером Kaufland, а не штрихкодом
        assert!(beer.barcodes.is_empty());
    }

    #[test]
    fn takes_card_price_and_gtin_from_image() {
        let listing = listing();
        let broccoli = find(&listing, "00370726");
        assert_eq!(broccoli.price, 0.99);
        assert_eq!(broccoli.old_price, Some(1.79));
        assert_eq!(broccoli.promo_label.as_deref(), Some("Kaufland Card -44%"));

        let cheese = find(&listing, "01066107");
        assert_eq!(cheese.brand.as_deref(), Some("BAUER"));
        assert_eq!(cheese.size.as_deref(), Some("100 g"));
        assert_eq!(cheese.barcodes, ["4002334119577"]);
    }
}
