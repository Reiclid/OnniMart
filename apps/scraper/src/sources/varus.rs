//! VARUS (varus.ua): Vue Storefront кладе стан сторінки у `window.__INITIAL_STATE__`.
//! robots.txt обмежень не має. Штрихкодів у списку товарів немає.

use anyhow::{Context, Result};
use serde_json::Value;

use super::{Category, Listing, base_product};
use crate::model::ScrapedProduct;
use crate::text::{json_object_after, non_empty};

pub const START_URL: &str = "https://varus.ua/";
const SITE: &str = "https://varus.ua";
/// Фото товару: `/img/carousel/<ширина>/<висота>/<id>/0` (WebP). Старий шлях
/// `/img/300/300/resize/catalog/product/...` з 2026 року віддає 400 або заглушку Magento
const IMAGES: &str = "https://varus.ua/img/carousel/300/300";
/// Добірки й акційні розділи дублюють товари з основних категорій;
/// тютюн і кафе — не роздрібні продукти
const SKIP: &[&str] = &[
    "rasprodazha",
    "price-of-the-week",
    "weekly-shopping",
    "tilki-onlajn",
    "zamovlyaj-novoyu-poshtoyu",
    "natsionalnij-keshbek",
    "healthy",
    "own-trademarks",
    "tyutyunovi-virobi",
    "varuscafe",
];

fn state(html: &str) -> Result<Value> {
    let json = json_object_after(html, "window.__INITIAL_STATE__").context("немає __INITIAL_STATE__")?;
    Ok(serde_json::from_str(json)?)
}

pub fn parse_categories(html: &str) -> Result<Vec<Category>> {
    let state = state(html)?;
    let list = state
        .pointer("/category/list")
        .and_then(Value::as_array)
        .context("немає списку категорій")?;
    Ok(list
        .iter()
        .filter(|c| c.get("level").and_then(Value::as_u64) == Some(2))
        .filter_map(|c| {
            let path = c.get("url_path")?.as_str()?;
            let name = c.get("name").and_then(Value::as_str).unwrap_or(path);
            Some((path, name))
        })
        .filter(|(path, _)| !SKIP.contains(path))
        .map(|(path, name)| Category {
            slug: path.to_string(),
            name: name.to_string(),
            url: format!("{SITE}/{path}"),
        })
        .collect())
}

pub fn parse_page(html: &str, store: &str, category: &Category, scraped_at: &str) -> Result<Listing> {
    let state = state(html)?;
    let products = state
        .pointer("/category/products")
        .and_then(Value::as_array)
        .context("немає товарів")?;
    let total_pages = state
        .pointer("/category-next/searchProductsStats/totalPages")
        .and_then(Value::as_u64)
        .unwrap_or(1)
        .max(1) as u32;
    Ok(Listing {
        products: products
            .iter()
            .filter_map(|item| product(item, store, category, scraped_at))
            .collect(),
        total_pages: Some(total_pages),
    })
}

fn product(item: &Value, store: &str, category: &Category, scraped_at: &str) -> Option<ScrapedProduct> {
    let text = |pointer: &str| item.pointer(pointer).and_then(Value::as_str).and_then(non_empty);
    // volume приходить рядком ("850"), weight — числом
    let number = |pointer: &str| {
        let value = item.pointer(pointer)?;
        value.as_f64().or_else(|| value.as_str()?.trim().parse().ok())
    };

    let regular = number("/regular_price").filter(|p| *p > 0.0);
    let special = number("/special_price").filter(|p| *p > 0.0);
    let price = special
        .or_else(|| number("/final_price").filter(|p| *p > 0.0))
        .or(regular)?;
    let old_price = regular.filter(|old| special.is_some() && *old > price);
    // Вагові товари продаються з кроком 0,5 кг, ціна — за 1 кг
    let weighted = item.pointer("/stock/is_qty_decimal").and_then(Value::as_bool).unwrap_or(false);
    let size = if weighted {
        None
    } else {
        number("/volume")
            .filter(|ml| *ml > 0.0)
            .map(|ml| format!("{ml} мл"))
            .or_else(|| number("/weight").filter(|g| *g >= 1.0).map(|g| format!("{g} г")))
    };

    Some(ScrapedProduct {
        external: text("/sku")?,
        name: text("/name")?,
        price,
        old_price,
        promo_label: number("/special_price_discount")
            .filter(|d| special.is_some() && *d > 0.0)
            .map(|d| format!("-{d}%")),
        promo_ends_at: special.and(text("/special_price_to_date")),
        // "Без TM" (url_key brands/bez-tm) — товар без торгової марки
        brand: text("/brand_data/name")
            .filter(|_| text("/brand_data/url_key").as_deref() != Some("brands/bez-tm")),
        size,
        price_unit: weighted.then(|| "кг".to_string()),
        in_stock: item.pointer("/stock/is_in_stock").and_then(Value::as_bool).unwrap_or(true),
        url: text("/url_path").map(|path| format!("{SITE}/{path}")),
        image_url: text("/image").and_then(|path| image_url(&path)),
        ..base_product(store, category, scraped_at)
    })
}

/// id товару з шляху `/product/2549498/main.jpg?t=…` → адреса фото каруселі
fn image_url(path: &str) -> Option<String> {
    let id = path.split('/').find(|part| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit()))?;
    Some(format!("{IMAGES}/{id}/0"))
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("../../tests/fixtures/varus_category.html");

    fn category() -> Category {
        Category {
            slug: "bakaliya".into(),
            name: "Бакалія".into(),
            url: "https://varus.ua/bakaliya".into(),
        }
    }

    #[test]
    fn parses_food_categories_without_collections() {
        let categories = parse_categories(FIXTURE).unwrap();
        let slugs: Vec<&str> = categories.iter().map(|c| c.slug.as_str()).collect();
        assert!(slugs.contains(&"bakaliya"));
        assert!(slugs.contains(&"molochni-produkti"));
        assert!(!slugs.contains(&"price-of-the-week"));
        assert!(!slugs.contains(&"tyutyunovi-virobi"));
        assert_eq!(categories.len(), 21);
        let dairy = categories.iter().find(|c| c.slug == "molochni-produkti").unwrap();
        assert_eq!(dairy.url, "https://varus.ua/molochni-produkti");
        assert_eq!(dairy.name, "Молочні продукти та яйця");
    }

    #[test]
    fn parses_products_from_initial_state() {
        let listing = parse_page(FIXTURE, "varus", &category(), "2026-10-12T10:00:00Z").unwrap();
        assert_eq!(listing.total_pages, Some(60));
        assert_eq!(listing.products.len(), 3);

        let oil = &listing.products[0];
        assert_eq!(oil.external, "2549498");
        assert_eq!(oil.name, "Олія соняшникова Олейна Традиційна рафінована 850 мл");
        assert_eq!(oil.brand.as_deref(), Some("Олейна"));
        assert_eq!(oil.price, 99.9);
        assert_eq!(oil.old_price, None);
        assert_eq!(oil.size.as_deref(), Some("850 мл"));
        assert_eq!(
            oil.url.as_deref(),
            Some("https://varus.ua/maslo-podsolnechnoe-oleyna-tradicionnaya-rafinirovannoe-850-ml")
        );
        assert_eq!(
            oil.image_url.as_deref(),
            Some("https://varus.ua/img/carousel/300/300/2549498/0")
        );

        let mayo = &listing.products[1];
        assert_eq!(mayo.price, 55.1);
        assert_eq!(mayo.old_price, Some(88.9));
        assert_eq!(mayo.promo_label.as_deref(), Some("-38%"));
        assert_eq!(mayo.promo_ends_at.as_deref(), Some("2026-10-14"));
        assert_eq!(mayo.size.as_deref(), Some("500 г"));

        let banana = &listing.products[2];
        assert_eq!(banana.name, "Банан ваговий");
        assert_eq!(banana.brand, None);
        assert_eq!(banana.price_unit.as_deref(), Some("кг"));
        assert_eq!(banana.size, None);
        assert_eq!(banana.price, 74.9);
    }
}
