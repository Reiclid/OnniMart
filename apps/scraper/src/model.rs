use serde::{Deserialize, Serialize};

/// Черга завдань від API
pub const TASKS_QUEUE: &str = "scraper:tasks";
/// Черга результатів для API: товари та події запуску в одному списку,
/// щоб "run_finished" гарантовано оброблявся після всіх товарів
pub const RESULTS_QUEUE: &str = "scraper:results";

/// Завдання на парсинг мережі
#[derive(Debug, Deserialize)]
pub struct ScraperTask {
    pub store: String,
    #[serde(default)]
    pub run_id: Option<String>,
    /// Обмеження сторінок на категорію (для тестових запусків)
    #[serde(default)]
    pub max_pages: Option<u32>,
    #[serde(default)]
    pub crawl_delay_ms: Option<u64>,
}

/// Товар зі сторінки мережі. Поля — контракт з ScrapedProductDto в apps/api.
#[derive(Debug, Clone, Default, Serialize)]
pub struct ScrapedProduct {
    pub store: String,
    pub external: String,
    pub name: String,
    pub price: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_price: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_url: Option<String>,
    pub scraper_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub brand: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub barcodes: Vec<String>,
    pub in_stock: bool,
    /// "шт" або "кг" (ваговий товар, ціна за 1 кг)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub price_unit: Option<String>,
    /// Фасування, як його показує сайт: "0,5л", "500 g", "750 мл"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub promo_label: Option<String>,
    /// Дата закінчення акції, YYYY-MM-DD
    #[serde(skip_serializing_if = "Option::is_none")]
    pub promo_ends_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ProductMessage<'a> {
    pub kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub run_id: Option<&'a str>,
    #[serde(flatten)]
    pub product: &'a ScrapedProduct,
}

impl<'a> ProductMessage<'a> {
    pub fn new(product: &'a ScrapedProduct, run_id: Option<&'a str>) -> Self {
        Self { kind: "product", run_id, product }
    }
}

/// Подія життєвого циклу запуску: run_started / run_finished / run_failed
#[derive(Debug, Serialize)]
pub struct RunEvent {
    pub kind: &'static str,
    pub run_id: Option<String>,
    pub store: String,
    pub pages_fetched: u32,
    pub items_seen: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn product_message_is_flat_json() {
        let product = ScrapedProduct {
            store: "silpo".into(),
            external: "42".into(),
            name: "Coca-Cola 0,5 л".into(),
            price: 29.9,
            in_stock: true,
            scraper_at: "2026-10-11T10:00:00Z".into(),
            ..Default::default()
        };
        let json = serde_json::to_value(ProductMessage::new(&product, Some("run-1"))).unwrap();

        assert_eq!(json["kind"], "product");
        assert_eq!(json["run_id"], "run-1");
        assert_eq!(json["store"], "silpo");
        assert_eq!(json["price"], 29.9);
        assert!(json.get("old_price").is_none());
        assert!(json.get("barcodes").is_none());
    }

    #[test]
    fn task_accepts_minimal_json() {
        let task: ScraperTask = serde_json::from_str(r#"{"store":"novus"}"#).unwrap();
        assert_eq!(task.store, "novus");
        assert!(task.run_id.is_none());
        assert!(task.max_pages.is_none());
    }
}
