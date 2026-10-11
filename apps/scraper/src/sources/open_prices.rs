//! Open Prices (prices.openfoodfacts.org) — відкрита база цін з чеків під ліцензією ODbL.
//! Використовуємо для мереж, які не публікують ціни на продукти онлайн:
//! Lidl Німеччина показує їх лише в листівках-картинках і в застосунку.
//!
//! "Категорія" тут одна — запит цін за всіма магазинами мережі, відсортований від
//! найновіших. Краулер бере перший (найсвіжіший) запис кожного штрихкоду.

use anyhow::{Context, Result};
use chrono::{Duration, NaiveDate};
use serde_json::Value;

use super::{Category, Listing, base_product};
use crate::model::ScrapedProduct;
use crate::text::non_empty;

const API: &str = "https://prices.openfoodfacts.org/api/v1";
/// Ціни, старші за пів року, вважаємо неактуальними
const MAX_AGE_DAYS: i64 = 180;

/// Магазини мережі в Німеччині, від тих, де найбільше цін
pub fn start_url(brand: &str) -> String {
    format!(
        "{API}/locations?osm_name__like={brand}&osm_address_country__like=Deutschland&size=100&order_by=-price_count"
    )
}

pub fn parse_categories(json: &str, brand: &str, today: NaiveDate) -> Result<Vec<Category>> {
    let data: Value = serde_json::from_str(json)?;
    let locations: Vec<String> = data
        .get("items")
        .and_then(Value::as_array)
        .context("немає списку магазинів")?
        .iter()
        .filter(|l| l.get("price_count").and_then(Value::as_u64).unwrap_or(0) > 0)
        .filter_map(|l| l.get("id").and_then(Value::as_u64))
        .map(|id| id.to_string())
        .collect();
    if locations.is_empty() {
        return Ok(Vec::new());
    }

    let since = today - Duration::days(MAX_AGE_DAYS);
    Ok(vec![Category {
        slug: brand.to_lowercase(),
        name: "Open Prices".into(),
        url: format!(
            "{API}/prices?location_id__in={}&date__gte={since}&order_by=-date&size=100",
            locations.join(",")
        ),
    }])
}

pub fn parse_page(json: &str, store: &str, category: &Category, scraped_at: &str) -> Result<Listing> {
    let data: Value = serde_json::from_str(json)?;
    let items = data.get("items").and_then(Value::as_array).context("немає items")?;
    let pages = data.get("pages").and_then(Value::as_u64).unwrap_or(1).max(1) as u32;
    Ok(Listing {
        products: items
            .iter()
            .filter_map(|item| product(item, store, category, scraped_at))
            .collect(),
        total_pages: Some(pages),
    })
}

fn product(item: &Value, store: &str, category: &Category, scraped_at: &str) -> Option<ScrapedProduct> {
    // CATEGORY — ціни без штрихкоду (фрукти на вагу тощо), їх не зіставити з товаром
    if item.get("type").and_then(Value::as_str) != Some("PRODUCT") {
        return None;
    }
    let code = item.get("product_code")?.as_str()?;
    let product = item.get("product")?;
    let text = |key: &str| product.get(key).and_then(Value::as_str);
    let price = item.get("price")?.as_f64()?;
    let discounted = item.get("price_is_discounted").and_then(Value::as_bool).unwrap_or(false);
    let size = product
        .get("product_quantity")
        .and_then(Value::as_f64)
        .filter(|quantity| *quantity > 0.0)
        .zip(text("product_quantity_unit"))
        .map(|(quantity, unit)| format!("{quantity} {unit}"));

    Some(ScrapedProduct {
        external: code.to_string(),
        name: non_empty(text("product_name")?)?,
        price,
        old_price: item
            .get("price_without_discount")
            .and_then(Value::as_f64)
            .filter(|old| discounted && *old > price),
        promo_label: item
            .get("discount_type")
            .and_then(Value::as_str)
            .filter(|_| discounted)
            .map(|kind| match kind {
                "LOYALTY_PROGRAM" => "Ціна з карткою лояльності".to_string(),
                "QUANTITY" => "Знижка за кількість".to_string(),
                _ => "Знижка".to_string(),
            }),
        // Перший бренд у списку — торгова марка, далі виробник і мережа
        brand: text("brands")
            .and_then(|brands| brands.split(',').next())
            .and_then(non_empty),
        size,
        barcodes: vec![code.to_string()],
        url: Some(format!("https://prices.openfoodfacts.org/products/{code}")),
        image_url: text("image_url").map(str::to_string),
        // Ціна зафіксована в день покупки, а не в момент нашого запиту
        scraper_at: item
            .get("date")
            .and_then(Value::as_str)
            .map(|date| format!("{date}T12:00:00Z"))
            .unwrap_or_else(|| scraped_at.to_string()),
        ..base_product(store, category, scraped_at)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const LOCATIONS: &str = include_str!("../../tests/fixtures/open_prices_locations.json");
    const PRICES: &str = include_str!("../../tests/fixtures/open_prices_prices.json");

    fn category() -> Category {
        Category { slug: "lidl".into(), name: "Open Prices".into(), url: format!("{API}/prices") }
    }

    #[test]
    fn builds_one_query_for_all_stores_with_prices() {
        let today = NaiveDate::from_ymd_opt(2026, 10, 11).unwrap();
        let categories = parse_categories(LOCATIONS, "Lidl", today).unwrap();
        assert_eq!(categories.len(), 1);
        assert_eq!(
            categories[0].url,
            "https://prices.openfoodfacts.org/api/v1/prices?location_id__in=204,2602&date__gte=2026-04-14&order_by=-date&size=100"
        );
    }

    #[test]
    fn parses_product_prices_and_skips_category_prices() {
        let listing = parse_page(PRICES, "lidl-de", &category(), "2026-10-11T10:00:00Z").unwrap();
        assert_eq!(listing.total_pages, Some(5));
        // CATEGORY-ціну пропущено; дубль старішою датою лишається — його відкине краулер
        assert_eq!(listing.products.len(), 3);

        let zott = &listing.products[0];
        assert_eq!(zott.external, "4014500522050");
        assert_eq!(zott.name, "Bayerntaler Oktoberfest Edition - Nussig");
        assert_eq!(zott.price, 1.99);
        assert_eq!(zott.size.as_deref(), Some("120 g"));
        assert_eq!(zott.brand.as_deref(), Some("Zott"));
        assert_eq!(zott.barcodes, ["4014500522050"]);
        assert_eq!(zott.scraper_at, "2026-10-08T12:00:00Z");

        let muesli = &listing.products[1];
        assert_eq!(muesli.price, 2.96);
        assert_eq!(muesli.old_price, Some(3.29));
        assert_eq!(muesli.promo_label.as_deref(), Some("Ціна з карткою лояльності"));
        assert_eq!(muesli.brand.as_deref(), Some("Ceralia Getreideprodukte"));

        assert_eq!(listing.products[2].external, zott.external);
        assert_eq!(listing.products[2].price, 2.49);
    }
}
