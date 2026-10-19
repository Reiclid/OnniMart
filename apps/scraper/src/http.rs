use std::collections::HashMap;
use std::fmt;
use std::time::{Duration, Instant};

use anyhow::{Result, bail};
use reqwest::{StatusCode, Url};

use crate::robots::RobotsTxt;
use tracing::warn;

/// Чесно представляємось ботом (див. docs/01-data-sources.md)
pub const USER_AGENT: &str =
    "OnniMartBot/0.2 (+https://github.com/Reiclid/OnniMart; diploma project)";
/// Токен, який шукаємо в групах User-agent у robots.txt
const ROBOTS_TOKEN: &str = "OnniMartBot";
const MAX_ATTEMPTS: u32 = 4;
/// Сайт просить почекати довше — зупиняємо обхід, а не чекаємо годинами
const MAX_RETRY_AFTER_SECS: u64 = 300;
/// shortcut: перевіряється лише Content-Length; відповіді без нього (chunked) не обмежені
const MAX_BODY_BYTES: u64 = 20 * 1024 * 1024;
const ROBOTS_ATTEMPTS: u32 = 3;

#[derive(Debug)]
pub enum FetchError {
    /// robots.txt забороняє цю адресу
    Disallowed(String),
    /// Сайт відповів 403 — антибот-захист. Не обходимо його, а зупиняємо обхід.
    Blocked(String),
    /// 429/503 з Retry-After довшим за MAX_RETRY_AFTER_SECS — зупиняємо обхід
    RateLimited(String, u64),
}

impl fmt::Display for FetchError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Disallowed(url) => write!(f, "robots.txt забороняє {url}"),
            Self::Blocked(url) => write!(f, "сайт заблокував запит (403): {url}"),
            Self::RateLimited(url, secs) => {
                write!(f, "сайт просить почекати {secs} с (Retry-After): {url}")
            }
        }
    }
}

impl std::error::Error for FetchError {}

enum RobotsPolicy {
    Rules(RobotsTxt),
    AllowAll,
    DisallowAll,
}

/// HTTP-клієнт, що дотримується robots.txt і робить паузу між запитами до одного сайту.
pub struct Fetcher {
    client: reqwest::Client,
    min_delay: Duration,
    robots: HashMap<String, RobotsPolicy>,
    last_request: HashMap<String, Instant>,
    pub requests: u32,
}

impl Fetcher {
    pub fn new(min_delay: Duration) -> Result<Self> {
        let client = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(Duration::from_secs(30))
            .gzip(true)
            .brotli(true)
            .build()?;
        Ok(Self {
            client,
            min_delay,
            robots: HashMap::new(),
            last_request: HashMap::new(),
            requests: 0,
        })
    }

    pub async fn get(&mut self, url: &str) -> Result<String> {
        let parsed = Url::parse(url)?;
        let origin = parsed.origin().ascii_serialization();
        if !self.robots.contains_key(&origin) {
            let policy = self.load_robots(&origin).await;
            self.robots.insert(origin.clone(), policy);
        }

        let path = match parsed.query() {
            Some(query) => format!("{}?{query}", parsed.path()),
            None => parsed.path().to_string(),
        };
        let delay = match &self.robots[&origin] {
            RobotsPolicy::DisallowAll => return Err(FetchError::Disallowed(url.into()).into()),
            RobotsPolicy::AllowAll => self.min_delay,
            RobotsPolicy::Rules(robots) => {
                if !robots.is_allowed(ROBOTS_TOKEN, &path) {
                    return Err(FetchError::Disallowed(url.into()).into());
                }
                robots
                    .crawl_delay(ROBOTS_TOKEN)
                    .map(Duration::from_secs_f64)
                    .unwrap_or_default()
                    .max(self.min_delay)
            }
        };

        for attempt in 1..=MAX_ATTEMPTS {
            let mut retry_after = 0;
            self.wait_turn(&origin, delay).await;
            self.requests += 1;
            let response = self
                .client
                .get(url)
                .header("Accept-Language", "uk-UA,uk;q=0.9,de-DE;q=0.8,en;q=0.5")
                .send()
                .await;

            match response {
                Ok(resp) if resp.status().is_success() => {
                    if resp.content_length().is_some_and(|n| n > MAX_BODY_BYTES) {
                        bail!("{url}: відповідь більша за {MAX_BODY_BYTES} байт");
                    }
                    return Ok(resp.text().await?);
                }
                Ok(resp) if resp.status() == StatusCode::FORBIDDEN => {
                    return Err(FetchError::Blocked(url.into()).into());
                }
                Ok(resp)
                    if resp.status() == StatusCode::TOO_MANY_REQUESTS
                        || resp.status().is_server_error() =>
                {
                    retry_after = retry_after_secs(resp.headers()).unwrap_or(0);
                    if retry_after > MAX_RETRY_AFTER_SECS {
                        return Err(FetchError::RateLimited(url.into(), retry_after).into());
                    }
                    warn!(url, status = %resp.status(), attempt, "повтор запиту");
                }
                Ok(resp) => bail!("{url} → HTTP {}", resp.status()),
                Err(error) => {
                    warn!(url, %error, attempt, "повтор запиту");
                }
            }
            if attempt < MAX_ATTEMPTS {
                // Експоненційна пауза 5, 10, 20 с — або скільки просить сайт (Retry-After)
                let backoff = 5 * 2u64.pow(attempt - 1);
                tokio::time::sleep(Duration::from_secs(backoff.max(retry_after))).await;
            }
        }
        bail!("{url}: сайт не відповів після {MAX_ATTEMPTS} спроб")
    }

    async fn wait_turn(&mut self, origin: &str, delay: Duration) {
        if let Some(last) = self.last_request.get(origin) {
            let elapsed = last.elapsed();
            if elapsed < delay {
                tokio::time::sleep(delay - elapsed).await;
            }
        }
        self.last_request.insert(origin.to_string(), Instant::now());
    }

    async fn load_robots(&mut self, origin: &str) -> RobotsPolicy {
        let url = format!("{origin}/robots.txt");
        for attempt in 1..=ROBOTS_ATTEMPTS {
            self.wait_turn(origin, self.min_delay).await;
            self.requests += 1;
            match self.client.get(&url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    if let Ok(text) = resp.text().await {
                        return RobotsPolicy::Rules(RobotsTxt::parse(&text));
                    }
                }
                // RFC 9309: robots.txt недоступний (4xx) — обмежень немає
                Ok(resp) if resp.status().is_client_error() => return RobotsPolicy::AllowAll,
                _ => {}
            }
            // Помилка сервера чи мережі може бути тимчасовою — пробуємо ще
            if attempt < ROBOTS_ATTEMPTS {
                tokio::time::sleep(Duration::from_secs(5 * u64::from(attempt))).await;
            }
        }
        // Так і не отримали — за RFC 9309 вважаємо, що заборонено все
        RobotsPolicy::DisallowAll
    }
}

/// Retry-After у секундах; форма з HTTP-датою не підтримується (тоді — звичайна пауза)
fn retry_after_secs(headers: &reqwest::header::HeaderMap) -> Option<u64> {
    headers
        .get(reqwest::header::RETRY_AFTER)?
        .to_str()
        .ok()?
        .trim()
        .parse()
        .ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::header::{HeaderMap, HeaderValue, RETRY_AFTER};

    #[test]
    fn reads_retry_after_seconds() {
        let mut headers = HeaderMap::new();
        assert_eq!(retry_after_secs(&headers), None);
        headers.insert(RETRY_AFTER, HeaderValue::from_static("120"));
        assert_eq!(retry_after_secs(&headers), Some(120));
        headers.insert(RETRY_AFTER, HeaderValue::from_static("Wed, 21 Oct 2026 07:28:00 GMT"));
        assert_eq!(retry_after_secs(&headers), None);
    }
}
