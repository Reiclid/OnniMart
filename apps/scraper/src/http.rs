use std::collections::HashMap;
use std::fmt;
use std::time::{Duration, Instant};

use anyhow::{Result, bail};
use reqwest::{StatusCode, Url};

use crate::robots::RobotsTxt;

/// Чесно представляємось ботом (див. docs/01-data-sources.md)
pub const USER_AGENT: &str =
    "OnniMartBot/0.2 (+https://github.com/Reiclid/OnniMart; diploma project)";
/// Токен, який шукаємо в групах User-agent у robots.txt
const ROBOTS_TOKEN: &str = "OnniMartBot";
const MAX_ATTEMPTS: u32 = 4;

#[derive(Debug)]
pub enum FetchError {
    /// robots.txt забороняє цю адресу
    Disallowed(String),
    /// Сайт відповів 403 — антибот-захист. Не обходимо його, а зупиняємо обхід.
    Blocked(String),
}

impl fmt::Display for FetchError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Disallowed(url) => write!(f, "robots.txt забороняє {url}"),
            Self::Blocked(url) => write!(f, "сайт заблокував запит (403): {url}"),
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
            self.wait_turn(&origin, delay).await;
            self.requests += 1;
            let response = self
                .client
                .get(url)
                .header("Accept-Language", "uk-UA,uk;q=0.9,de-DE;q=0.8,en;q=0.5")
                .send()
                .await;

            match response {
                Ok(resp) if resp.status().is_success() => return Ok(resp.text().await?),
                Ok(resp) if resp.status() == StatusCode::FORBIDDEN => {
                    return Err(FetchError::Blocked(url.into()).into());
                }
                Ok(resp)
                    if resp.status() == StatusCode::TOO_MANY_REQUESTS
                        || resp.status().is_server_error() =>
                {
                    eprintln!(
                        "[scraper] {url} → {}, спроба {attempt}/{MAX_ATTEMPTS}",
                        resp.status()
                    );
                }
                Ok(resp) => bail!("{url} → HTTP {}", resp.status()),
                Err(error) => {
                    eprintln!("[scraper] {url}: {error}, спроба {attempt}/{MAX_ATTEMPTS}");
                }
            }
            if attempt < MAX_ATTEMPTS {
                // Експоненційна пауза: 5, 10, 20 с
                tokio::time::sleep(Duration::from_secs(5 * 2u64.pow(attempt - 1))).await;
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
        self.wait_turn(origin, self.min_delay).await;
        self.requests += 1;
        let url = format!("{origin}/robots.txt");
        match self.client.get(&url).send().await {
            Ok(resp) if resp.status().is_success() => match resp.text().await {
                Ok(text) => RobotsPolicy::Rules(RobotsTxt::parse(&text)),
                Err(_) => RobotsPolicy::DisallowAll,
            },
            // RFC 9309: robots.txt недоступний (4xx) — обмежень немає;
            // помилка сервера чи мережі — вважаємо, що заборонено все
            Ok(resp) if resp.status().is_client_error() => RobotsPolicy::AllowAll,
            _ => RobotsPolicy::DisallowAll,
        }
    }
}
