mod aldi_nord;
mod aldi_sued;
mod atb;
mod globus;
mod kaufland;
mod norma;
mod open_prices;
mod penny;
mod silpo;
mod varus;
mod zakaz;

use anyhow::Result;
use chrono::Local;

use crate::model::ScrapedProduct;

#[derive(Debug, Clone)]
pub struct Category {
    pub slug: String,
    pub name: String,
    pub url: String,
}

#[derive(Debug, Default)]
pub struct Listing {
    pub products: Vec<ScrapedProduct>,
    /// Скільки всього сторінок у категорії (якщо сайт це показує)
    pub total_pages: Option<u32>,
}

#[derive(Debug, Clone, Copy)]
enum Kind {
    Silpo,
    /// Вітрина zakaz.ua, параметр — піддомен
    Zakaz(&'static str),
    AldiSued,
    AldiNord,
    Globus,
    /// Відкрита база цін Open Prices, параметр — назва мережі в OpenStreetMap
    OpenPrices(&'static str),
    Atb,
    Varus,
    Kaufland,
    Penny,
    Norma,
}

/// Мережа і спосіб її парсингу. Ключ — StoreChain.slug в базі.
#[derive(Debug, Clone)]
pub struct Source {
    pub store: String,
    kind: Kind,
}

pub const SUPPORTED: &[&str] = &[
    "silpo",
    "novus",
    "auchan",
    "metro-ua",
    "eko",
    "megamarket",
    "varus",
    "aldi-sued",
    "aldi-nord",
    "globus-de",
    "lidl-de",
    "kaufland-de",
    "penny-de",
    "norma-de",
    "atb",
];

impl Source {
    pub fn for_store(store: &str) -> Option<Self> {
        let kind = match store {
            "silpo" => Kind::Silpo,
            "novus" => Kind::Zakaz("novus"),
            "auchan" => Kind::Zakaz("auchan"),
            "metro-ua" => Kind::Zakaz("metro"),
            "eko" => Kind::Zakaz("eko"),
            "megamarket" => Kind::Zakaz("megamarket"),
            "aldi-sued" => Kind::AldiSued,
            "aldi-nord" => Kind::AldiNord,
            "globus-de" => Kind::Globus,
            "lidl-de" => Kind::OpenPrices("Lidl"),
            "atb" => Kind::Atb,
            "varus" => Kind::Varus,
            "kaufland-de" => Kind::Kaufland,
            "penny-de" => Kind::Penny,
            "norma-de" => Kind::Norma,
            _ => return None,
        };
        Some(Self { store: store.to_string(), kind })
    }

    /// Сайт для правила "один запит за раз": усі піддомени одного домену, як вітрини
    /// zakaz.ua, це один сайт. Різні сайти можна обходити одночасно
    pub fn site(&self) -> String {
        let url = self.start_url();
        let host = url.split('/').nth(2).unwrap_or(&url);
        let labels: Vec<&str> = host.split('.').collect();
        labels[labels.len().saturating_sub(2)..].join(".")
    }

    /// Сторінка, з якої беремо список категорій
    pub fn start_url(&self) -> String {
        match self.kind {
            Kind::Silpo => silpo::START_URL.into(),
            Kind::Zakaz(subdomain) => zakaz::start_url(subdomain),
            Kind::AldiSued => aldi_sued::START_URL.into(),
            Kind::AldiNord => aldi_nord::START_URL.into(),
            Kind::Globus => globus::START_URL.into(),
            Kind::OpenPrices(brand) => open_prices::start_url(brand),
            Kind::Atb => atb::START_URL.into(),
            Kind::Varus => varus::START_URL.into(),
            Kind::Kaufland => kaufland::START_URL.into(),
            Kind::Penny => penny::START_URL.into(),
            Kind::Norma => norma::START_URL.into(),
        }
    }

    pub fn parse_categories(&self, html: &str) -> Result<Vec<Category>> {
        let today = Local::now().date_naive();
        match self.kind {
            Kind::Silpo => silpo::parse_categories(html),
            Kind::Zakaz(subdomain) => zakaz::parse_categories(html, subdomain),
            Kind::AldiSued => aldi_sued::parse_categories(html),
            Kind::AldiNord => aldi_nord::parse_categories(html),
            Kind::Globus => globus::parse_categories(html),
            Kind::OpenPrices(brand) => open_prices::parse_categories(html, brand, today),
            Kind::Atb => atb::parse_categories(html),
            Kind::Varus => varus::parse_categories(html),
            Kind::Kaufland => kaufland::parse_categories(html),
            Kind::Penny => penny::parse_categories(html, today),
            Kind::Norma => norma::parse_categories(html, today),
        }
    }

    pub fn page_url(&self, category: &Category, page: u32) -> String {
        if page <= 1 {
            return category.url.clone();
        }
        // Параметри пагінації дозволені в robots.txt кожного з сайтів
        let param = match self.kind {
            Kind::Globus => "p",
            _ => "page",
        };
        let separator = if category.url.contains('?') { '&' } else { '?' };
        format!("{}{separator}{param}={page}", category.url)
    }

    pub fn parse_page(&self, html: &str, category: &Category, scraped_at: &str) -> Result<Listing> {
        let store = self.store.as_str();
        match self.kind {
            Kind::Silpo => silpo::parse_page(html, store, category, scraped_at),
            Kind::Zakaz(_) => zakaz::parse_page(html, store, category, scraped_at),
            Kind::AldiSued => aldi_sued::parse_page(html, store, category, scraped_at),
            Kind::AldiNord => aldi_nord::parse_page(html, store, category, scraped_at),
            Kind::Globus => globus::parse_page(html, store, category, scraped_at),
            Kind::OpenPrices(_) => open_prices::parse_page(html, store, category, scraped_at),
            Kind::Atb => atb::parse_page(html, store, category, scraped_at),
            Kind::Varus => varus::parse_page(html, store, category, scraped_at),
            Kind::Kaufland => {
                let today = Local::now().date_naive();
                kaufland::parse_page(html, store, category, scraped_at, today)
            }
            Kind::Penny => penny::parse_page(html, store, category, scraped_at),
            Kind::Norma => norma::parse_page(html, store, category, scraped_at),
        }
    }
}

/// Порожня картка товару з полями, спільними для всіх джерел
fn base_product(store: &str, category: &Category, scraped_at: &str) -> ScrapedProduct {
    ScrapedProduct {
        store: store.to_string(),
        category: Some(category.name.clone()),
        scraper_at: scraped_at.to_string(),
        in_stock: true,
        ..Default::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn storefronts_of_one_domain_are_one_site() {
        let site = |store| Source::for_store(store).unwrap().site();
        assert_eq!(site("novus"), "zakaz.ua");
        assert_eq!(site("metro-ua"), site("eko"));
        assert_eq!(site("globus-de"), "globus.de");
        assert_ne!(site("aldi-sued"), site("aldi-nord"));
    }

    #[test]
    fn maps_store_slugs_to_sources() {
        for store in SUPPORTED {
            assert!(Source::for_store(store).is_some(), "{store}");
        }
        assert!(Source::for_store("rewe-de").is_none());
    }

    #[test]
    fn builds_page_urls() {
        let category = Category {
            slug: "drinks".into(),
            name: "Напої".into(),
            url: "https://novus.zakaz.ua/uk/categories/drinks/".into(),
        };
        let novus = Source::for_store("novus").unwrap();
        assert_eq!(novus.page_url(&category, 1), category.url);
        assert_eq!(
            novus.page_url(&category, 3),
            "https://novus.zakaz.ua/uk/categories/drinks/?page=3"
        );

        let globus = Source::for_store("globus-de").unwrap();
        assert!(globus.page_url(&category, 2).ends_with("?p=2"));

        let api = Category { url: "https://example.org/prices?size=100".into(), ..category };
        let lidl = Source::for_store("lidl-de").unwrap();
        assert_eq!(lidl.page_url(&api, 2), "https://example.org/prices?size=100&page=2");
    }
}
