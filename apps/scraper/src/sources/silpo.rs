//! Сільпо: Angular SSR кладе відповіді свого API в <script id="serverApp-state">.

use anyhow::{Context, Result};
use serde_json::Value;

use super::{Category, Listing, base_product};
use crate::model::ScrapedProduct;
use crate::text::{clean, pages, script_json};

pub const START_URL: &str = "https://silpo.ua/";
const BASE: &str = "https://silpo.ua";
const IMAGE_BASE: &str = "https://images.silpo.ua/v2/products/300x300/origin/";
/// Добірки, що дублюють товари з основних категорій
const SKIP: &[&str] = &["spetsialni-propozytsii", "vlasni-marky", "lavka-tradytsii"];

fn state(html: &str) -> Result<Value> {
    let json = script_json(html, "serverApp-state").context("немає serverApp-state")?;
    Ok(serde_json::from_str(json)?)
}

/// Тіло збереженої відповіді API, чия адреса задовольняє умову
fn response(state: &Value, url_matches: impl Fn(&str) -> bool) -> Option<&Value> {
    state.as_object()?.values().find_map(|entry| {
        let url = entry.get("u")?.as_str()?;
        url_matches(url).then(|| entry.get("b")).flatten()
    })
}

pub fn parse_categories(html: &str) -> Result<Vec<Category>> {
    let state = state(html)?;
    let tree = response(&state, |url| url.ends_with("/categories/tree"))
        .and_then(|body| body.get("items"))
        .and_then(Value::as_array)
        .context("немає дерева категорій")?;

    Ok(tree
        .iter()
        .filter_map(|node| node.get("slug").and_then(Value::as_str))
        .filter(|slug| !SKIP.iter().any(|skip| slug.contains(skip)))
        .map(|slug| Category {
            slug: slug.to_string(),
            name: slug.to_string(),
            url: format!("{BASE}/category/{slug}"),
        })
        .collect())
}

pub fn parse_page(html: &str, store: &str, category: &Category, scraped_at: &str) -> Result<Listing> {
    let state = state(html)?;
    let body = response(&state, |url| url.contains("/products") && !url.contains("/products/"))
        .context("немає списку товарів")?;
    let items = body.get("items").and_then(Value::as_array).context("немає items")?;
    let total = body.get("total").and_then(Value::as_u64).unwrap_or(0);
    let limit = body.get("limit").and_then(Value::as_u64).unwrap_or(items.len() as u64);

    Ok(Listing {
        products: items
            .iter()
            .filter_map(|item| product(item, store, category, scraped_at))
            .collect(),
        total_pages: Some(pages(total, limit)),
    })
}

fn product(item: &Value, store: &str, category: &Category, scraped_at: &str) -> Option<ScrapedProduct> {
    let title = item.get("title")?.as_str()?;
    let price = item.get("price")?.as_f64()?;
    let external = item
        .get("externalProductId")
        .and_then(|id| id.as_u64().map(|n| n.to_string()).or_else(|| id.as_str().map(str::to_string)))
        .or_else(|| item.get("id")?.as_str().map(str::to_string))?;
    let weighted = item.get("weighted").and_then(Value::as_bool).unwrap_or(false)
        || item.get("ratio").and_then(Value::as_str) == Some("кг");
    let text = |key: &str| item.get(key).and_then(Value::as_str);

    Some(ScrapedProduct {
        external,
        name: clean(title),
        price,
        old_price: item.get("oldPrice").and_then(Value::as_f64).filter(|old| *old > price),
        image_url: text("icon").map(|icon| format!("{IMAGE_BASE}{icon}")),
        url: text("slug").map(|slug| format!("{BASE}/product/{slug}")),
        brand: text("brandTitle").map(str::to_string),
        in_stock: item.get("stock").and_then(Value::as_f64).is_none_or(|stock| stock > 0.0),
        // Для вагових товарів ціна — за 1 кг, а displayRatio ("100г") лише крок показу ціни
        price_unit: Some(if weighted { "кг" } else { "шт" }.into()),
        size: text("displayRatio")
            .filter(|ratio| !weighted && ratio.chars().any(|c| c.is_ascii_digit()))
            .map(str::to_string),
        ..base_product(store, category, scraped_at)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("../../tests/fixtures/silpo_category.html");

    fn category() -> Category {
        Category { slug: "napoi-52".into(), name: "napoi-52".into(), url: format!("{BASE}/category/napoi-52") }
    }

    #[test]
    fn parses_root_categories_without_promo_collections() {
        let categories = parse_categories(FIXTURE).unwrap();
        let slugs: Vec<&str> = categories.iter().map(|c| c.slug.as_str()).collect();
        assert_eq!(slugs, ["frukty-ovochi-4788", "napoi-52"]);
        assert_eq!(categories[1].url, "https://silpo.ua/category/napoi-52");
    }

    #[test]
    fn parses_products_and_pagination() {
        let listing = parse_page(FIXTURE, "silpo", &category(), "2026-10-11T10:00:00Z").unwrap();
        assert_eq!(listing.total_pages, Some(74));
        assert_eq!(listing.products.len(), 3);

        let discounted = &listing.products[0];
        assert_eq!(discounted.external, "932943");
        assert_eq!(discounted.name, "Напій Dr.Pepper Strawberries&Cream газований з/б");
        assert_eq!(discounted.price, 59.99);
        assert_eq!(discounted.old_price, Some(82.99));
        assert_eq!(discounted.brand.as_deref(), Some("Dr.Pepper"));
        assert_eq!(discounted.size.as_deref(), Some("0,355л"));
        assert_eq!(discounted.price_unit.as_deref(), Some("шт"));
        assert_eq!(
            discounted.url.as_deref(),
            Some("https://silpo.ua/product/napii-dr-pepper-strawberries-cream-gazovanyi-z-b-932943")
        );
        assert!(discounted.image_url.as_deref().unwrap().starts_with(IMAGE_BASE));
        assert_eq!(discounted.category.as_deref(), Some("napoi-52"));
    }

    #[test]
    fn weighted_products_are_priced_per_kg() {
        let listing = parse_page(FIXTURE, "silpo", &category(), "2026-10-11T10:00:00Z").unwrap();
        let weighted = &listing.products[2];
        assert_eq!(weighted.price_unit.as_deref(), Some("кг"));
        assert_eq!(weighted.size, None);
        assert!(weighted.price > 10.0);
    }
}
