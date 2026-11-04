use serde::{Deserialize, Serialize};

/// Черга завдань від API
pub const TASKS_QUEUE: &str = "scraper:tasks";
/// Завдання, які воркер зараз виконує; кожне видаляється після run_finished / run_failed
pub const TASKS_PROCESSING: &str = "scraper:tasks:processing";
/// Ознака життя воркера: run_id останнього активного запуску з TTL.
/// Кожен запуск ще має власний ключ `scraper:heartbeat:<run_id>` (див. ScrapeScheduler в API)
pub const HEARTBEAT_KEY: &str = "scraper:heartbeat";
pub const HEARTBEAT_TTL_SECS: u64 = 900;
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

/// Товар зі сторінки мережі. Поля — контракт з ScrapedProductMessage у packages/contracts.
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

    /// Контракт з packages/contracts: повідомлення парсера мають збігатися із зразками,
    /// які TS-сторона перевіряє своїм parseScraperMessage (packages/contracts/src/index.spec.ts)
    #[test]
    fn product_message_matches_contract_fixture() {
        let product = ScrapedProduct {
            store: "novus".into(),
            external: "440398".into(),
            name: "Вода мінеральна Borjomi 0,75л".into(),
            price: 92.99,
            old_price: Some(109.0),
            image_url: Some("https://img.zakaz.ua/borjomi.jpg".into()),
            scraper_at: "2026-10-11T10:00:00Z".into(),
            url: Some("https://novus.zakaz.ua/uk/products/borjomi/".into()),
            brand: Some("Borjomi".into()),
            category: Some("Напої".into()),
            barcodes: vec!["04860019003166".into()],
            in_stock: true,
            price_unit: Some("шт".into()),
            size: Some("750 мл".into()),
            promo_label: Some("-15%".into()),
            promo_ends_at: Some("2026-10-14".into()),
        };
        let actual = serde_json::to_value(ProductMessage::new(&product, Some("run-1"))).unwrap();
        let expected: serde_json::Value =
            serde_json::from_str(include_str!("../tests/fixtures/contract/product.json")).unwrap();
        assert_eq!(actual, expected);
    }

    #[test]
    fn run_event_matches_contract_fixture() {
        let event = RunEvent {
            kind: "run_failed",
            run_id: Some("run-1".into()),
            store: "novus".into(),
            pages_fetched: 12,
            items_seen: 340,
            error: Some("сайт заблокував запит (403): https://novus.zakaz.ua/uk/".into()),
            at: "2026-10-11T12:30:00Z".into(),
        };
        let expected: serde_json::Value =
            serde_json::from_str(include_str!("../tests/fixtures/contract/run-failed.json")).unwrap();
        assert_eq!(serde_json::to_value(&event).unwrap(), expected);
    }

    #[test]
    fn task_accepts_minimal_json() {
        let task: ScraperTask = serde_json::from_str(r#"{"store":"novus"}"#).unwrap();
        assert_eq!(task.store, "novus");
        assert!(task.run_id.is_none());
        assert!(task.max_pages.is_none());
    }
}
