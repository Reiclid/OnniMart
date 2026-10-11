use redis::AsyncCommands;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::error::Error;

#[derive(Debug, Deserialize)]
struct ScraperTask {
    store: String,
    #[serde(default)]
    created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ScrapedProduct {
    store: String,
    external: String,
    name: String,
    price: f64,
    old_price: Option<f64>,
    image_url: Option<String>,
    scraper_at: String,
}

async fn scrape_atb() -> Result<Vec<ScrapedProduct>, Box<dyn Error>> {
    println!("[Rust] Завантаження сторінки каталогу АТБ...");

    let url = "https://www.atbmarket.com/catalog/292-alkogol-i-tyutyun";

    let output = tokio::process::Command::new("curl.exe")
        .args([
            "-s",
            url,
            // Чесно представляємось ботом (див. docs/01-data-sources.md): АТБ блокує лише стандартний UA curl
            "-H", "User-Agent: OnniMartBot/0.1 (+https://github.com/Reiclid/OnniMart; diploma project)",
            "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "-H", "Accept-Language: uk-UA,uk;q=0.9,en;q=0.8",
        ])
        .output()
        .await?;

    let html_content = String::from_utf8_lossy(&output.stdout).to_string();
    println!("[Rust] Отримано HTML: {} байт", html_content.len());

    let document = Html::parse_document(&html_content);

    // 1. Пагінація
    let page_link_selector = Selector::parse(".product-pagination__link").unwrap();
    let mut total_pages: u32 = 1;

    for el in document.select(&page_link_selector) {
        let text = el.text().collect::<String>();
        if let Ok(num) = text.trim().parse::<u32>() {
            if num > total_pages {
                total_pages = num;
            }
        }
    }
    println!("[Rust] Всього сторінок у категорії: {}", total_pages);

    let item_selector = Selector::parse(".catalog-item, article.catalog-item, div.catalog-item").unwrap();
    let title_selector = Selector::parse(".catalog-item__title a").unwrap();
    let price_selector = Selector::parse(".product-price__top").unwrap();
    let old_price_selector = Selector::parse(".product-price__bottom").unwrap();
    let img_selector = Selector::parse("img.catalog-item__img").unwrap();
    let cart_selector = Selector::parse(".b-addToCart").unwrap();

    let mut products = Vec::new();

    for (index, element) in document.select(&item_selector).enumerate() {
        let name = element
            .select(&title_selector)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string())
            .unwrap_or_default();

        if name.is_empty() {
            continue;
        }

        // Ціна
        let price = element
            .select(&price_selector)
            .next()
            .and_then(|el| {
                el.value()
                    .attr("value")
                    .and_then(|v| v.parse::<f64>().ok())
                    .or_else(|| {
                        let text = el.text().collect::<String>();
                        text.replace("грн", "")
                            .replace("грн/шт", "")
                            .replace(' ', "")
                            .replace(',', ".")
                            .trim()
                            .parse::<f64>()
                            .ok()
                    })
            })
            .unwrap_or(0.0);

        // Стара ціна
        let old_price = element
            .select(&old_price_selector)
            .next()
            .and_then(|el| {
                el.value()
                    .attr("value")
                    .and_then(|v| v.parse::<f64>().ok())
            });

        // Картинка
        let image_url = element
            .select(&img_selector)
            .next()
            .and_then(|el| {
                el.value()
                    .attr("src")
                    .or_else(|| el.value().attr("data-src"))
            })
            .map(|s| s.to_string());

        // ID товару
        let external_id = element
            .select(&cart_selector)
            .next()
            .and_then(|el| el.value().attr("data-productid").or_else(|| el.value().attr("data-itemid")))
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("atb-{}", index + 1));

        products.push(ScrapedProduct {
            store: "atb".to_string(),
            external: external_id,
            name,
            price,
            old_price,
            image_url,
            scraper_at: chrono_now(),
        });
    }

    println!("[Rust] Успішно спарсено товарів з 1-ї сторінки: {}", products.len());
    Ok(products)
}

fn chrono_now() -> String {
    "2026-08-20T12:00:00Z".to_string()
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    println!("[Rust Worker] Скрейпер запущено!");
    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());

    println!("[Rust Worker] Підключення до Redis: {}", redis_url);
    let client = redis::Client::open(redis_url)?;
    let mut con = client.get_multiplexed_async_connection().await?;

    loop {
        let result: Option<(String, String)> = con.brpop("scraper:tasks", 0.0).await.ok();

        if let Some((_queue, task_json)) = result {
            println!("[Rust Worker] Отримано завдання: {}", task_json);

            if let Ok(task) = serde_json::from_str::<ScraperTask>(&task_json) {
                println!("[Rust Worker] Починаємо обробку магазину: {}", task.store);

                let scraped_products = match task.store.as_str() {
                    "atb" => scrape_atb().await.unwrap_or_default(),
                    _ => {
                        println!("[Rust Worker] Невідомий магазин: {}", task.store);
                        Vec::new()
                    }
                };

                for product in scraped_products {
                    let product_json = serde_json::to_string(&product)?;

                    let _: () = con.lpush("scraper:results", &product_json).await?;
                    println!("[Rust Worker] Відправлено в чергу: {}", product.name);
                }
                println!("[Rust Worker] Завдання для {} завершено!", task.store);
            } else {
                println!("[Rust Worker] Невірний формат JSON у завданні: {}", task_json);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_scrape_atb() {
        println!("--- ТЕСТУВАННЯ ПАРСИНГУ АТБ ---");
        
        let result = scrape_atb().await;
        
        assert!(result.is_ok(), "Парсер повернув помилку!");
        
        let products = result.unwrap();
        println!("Знайдено товарів: {}", products.len());
        
        for (i, p) in products.iter().take(5).enumerate() {
            println!("Товар #{}: {} | Ціна: {} грн | Фото: {:?}", i + 1, p.name, p.price, p.image_url);
        }
    }
}
