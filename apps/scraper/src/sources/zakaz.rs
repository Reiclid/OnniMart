//! Вітрини zakaz.ua (NOVUS, Ашан, METRO, ЕКО, МегаМаркет): Next.js кладе стан у __NEXT_DATA__.
//! API stores-api.zakaz.ua закритий у robots.txt, тому працюємо лише з HTML.

use anyhow::{Context, Result};
use serde_json::Value;

use super::{Category, Listing, base_product};
use crate::model::ScrapedProduct;
use crate::text::{clean, pages, script_json};

const PAGE_SIZE: u64 = 30;
/// Добірки, що дублюють товари з основних категорій
const SKIP: &[&str] = &["low-prices", "health-and-lifestyle"];

pub fn start_url(subdomain: &str) -> String {
    format!("https://{subdomain}.zakaz.ua/uk/")
}

fn next_data(html: &str) -> Result<Value> {
    let json = script_json(html, "__NEXT_DATA__").context("немає __NEXT_DATA__")?;
    Ok(serde_json::from_str(json)?)
}

pub fn parse_categories(html: &str, subdomain: &str) -> Result<Vec<Category>> {
    let data = next_data(html)?;
    let categories = data
        .pointer("/props/initialState/categories/categories")
        .and_then(Value::as_array)
        .context("немає списку категорій")?;

    Ok(categories
        .iter()
        .filter(|c| !c.get("is_collection").and_then(Value::as_bool).unwrap_or(false))
        .filter_map(|c| {
            let id = c.get("id")?.as_str()?;
            let title = c.get("title").and_then(Value::as_str).unwrap_or(id);
            Some((id, title))
        })
        .filter(|(id, _)| !SKIP.iter().any(|skip| id.contains(skip)))
        .map(|(id, title)| Category {
            slug: id.to_string(),
            name: title.to_string(),
            url: format!("https://{subdomain}.zakaz.ua/uk/categories/{id}/"),
        })
        .collect())
}

pub fn parse_page(html: &str, store: &str, category: &Category, scraped_at: &str) -> Result<Listing> {
    let data = next_data(html)?;
    let catalogue = data
        .pointer("/props/initialState/catalogue/categoryData")
        .context("немає categoryData")?;
    let results = catalogue.get("results").and_then(Value::as_array).context("немає results")?;
    let count = catalogue.get("count").and_then(Value::as_u64).unwrap_or(0);

    Ok(Listing {
        products: results
            .iter()
            .filter_map(|item| product(item, store, category, scraped_at))
            .collect(),
        total_pages: Some(pages(count, PAGE_SIZE)),
    })
}

fn product(item: &Value, store: &str, category: &Category, scraped_at: &str) -> Option<ScrapedProduct> {
    let text = |pointer: &str| item.pointer(pointer).and_then(Value::as_str);
    let number = |pointer: &str| item.pointer(pointer).and_then(Value::as_f64);

    // Ціни в копійках; 0 — ціну ще не задали, такий товар черга все одно відкине
    let price = number("/price").filter(|price| *price > 0.0)? / 100.0;
    let on_discount = item.pointer("/discount/status").and_then(Value::as_bool).unwrap_or(false);
    let weighted = text("/unit") == Some("kg");
    let size = if weighted {
        None
    } else {
        number("/volume")
            .filter(|ml| *ml > 0.0)
            .map(|ml| format!("{ml} мл"))
            .or_else(|| number("/weight").filter(|g| *g > 0.0).map(|g| format!("{g} г")))
    };
    // Вагові товари мають внутрішній код мережі ("novus0285…") — це не EAN
    let barcodes = text("/ean")
        .filter(|ean| !ean.is_empty() && ean.chars().all(|c| c.is_ascii_digit()))
        .map(|ean| vec![ean.to_string()])
        .unwrap_or_default();

    Some(ScrapedProduct {
        external: text("/sku").or(text("/ean"))?.to_string(),
        name: clean(text("/title")?),
        price,
        old_price: number("/discount/old_price")
            .map(|old| old / 100.0)
            .filter(|old| on_discount && *old > price),
        promo_label: item
            .pointer("/discount/value")
            .and_then(Value::as_u64)
            .filter(|value| on_discount && *value > 0)
            .map(|value| format!("-{value}%")),
        promo_ends_at: text("/discount/due_date")
            .filter(|_| on_discount)
            .map(str::to_string),
        image_url: text("/img/s350x350").map(str::to_string),
        url: text("/web_url").map(str::to_string),
        brand: text("/producer/trademark")
            .filter(|brand| *brand != "без тм")
            .map(str::to_string),
        barcodes,
        in_stock: item.get("in_stock").and_then(Value::as_bool).unwrap_or(true),
        price_unit: Some(if weighted { "кг" } else { "шт" }.into()),
        size,
        ..base_product(store, category, scraped_at)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("../../tests/fixtures/zakaz_category.html");

    fn category() -> Category {
        Category {
            slug: "drinks".into(),
            name: "Напої".into(),
            url: "https://novus.zakaz.ua/uk/categories/drinks/".into(),
        }
    }

    #[test]
    fn skips_products_without_a_price() {
        let item = serde_json::json!({ "sku": "1", "title": "Печиво", "price": 0 });
        assert!(product(&item, "auchan", &category(), "2026-11-04T08:45:00Z").is_none());
    }

    #[test]
    fn parses_categories_without_collections() {
        let categories = parse_categories(FIXTURE, "novus").unwrap();
        assert!(categories.iter().all(|c| !c.slug.contains("low-prices")));
        assert!(!categories.is_empty());
        assert!(categories[0].url.starts_with("https://novus.zakaz.ua/uk/categories/"));
    }

    #[test]
    fn parses_discounted_product_with_ean() {
        let listing = parse_page(FIXTURE, "novus", &category(), "2026-10-11T10:00:00Z").unwrap();
        assert_eq!(listing.total_pages, Some(40));
        assert_eq!(listing.products.len(), 3);

        let borjomi = &listing.products[0];
        assert_eq!(borjomi.external, "440398");
        assert_eq!(borjomi.price, 92.99);
        assert_eq!(borjomi.old_price, Some(109.0));
        assert_eq!(borjomi.promo_label.as_deref(), Some("-15%"));
        assert_eq!(borjomi.promo_ends_at.as_deref(), Some("2026-10-14"));
        assert_eq!(borjomi.barcodes, ["04860019003166"]);
        assert_eq!(borjomi.size.as_deref(), Some("750 мл"));
        assert_eq!(borjomi.brand.as_deref(), Some("Borjomi"));
        assert_eq!(borjomi.price_unit.as_deref(), Some("шт"));
    }

    #[test]
    fn product_without_discount_has_no_old_price() {
        let listing = parse_page(FIXTURE, "novus", &category(), "2026-10-11T10:00:00Z").unwrap();
        let regular = &listing.products[1];
        assert_eq!(regular.old_price, None);
        assert_eq!(regular.promo_label, None);
    }

    #[test]
    fn weighted_product_has_no_ean_and_is_priced_per_kg() {
        let listing = parse_page(FIXTURE, "novus", &category(), "2026-10-11T10:00:00Z").unwrap();
        let apples = &listing.products[2];
        assert_eq!(apples.price_unit.as_deref(), Some("кг"));
        assert!(apples.barcodes.is_empty());
        assert_eq!(apples.brand, None);
        assert_eq!(apples.size, None);
    }
}
