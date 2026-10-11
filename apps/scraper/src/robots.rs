//! Розбір robots.txt за RFC 9309: групи User-agent, Allow / Disallow з `*` та `$`,
//! перемагає найдовше правило, при рівності — Allow.

#[derive(Debug, Default)]
pub struct RobotsTxt {
    groups: Vec<Group>,
}

#[derive(Debug, Default)]
struct Group {
    agents: Vec<String>,
    rules: Vec<Rule>,
    crawl_delay: Option<f64>,
}

#[derive(Debug)]
struct Rule {
    allow: bool,
    pattern: String,
}

impl RobotsTxt {
    pub fn parse(txt: &str) -> Self {
        let mut groups: Vec<Group> = Vec::new();
        let mut current: Option<Group> = None;
        let mut collecting_agents = false;

        for raw in txt.lines() {
            let line = raw.split('#').next().unwrap_or("").trim();
            let Some((key, value)) = line.split_once(':') else {
                continue;
            };
            let key = key.trim().to_ascii_lowercase();
            let value = value.trim();

            match key.as_str() {
                "user-agent" => {
                    // Кілька User-agent поспіль належать одній групі
                    if !collecting_agents {
                        groups.extend(current.take());
                        current = Some(Group::default());
                    }
                    if let Some(group) = current.as_mut() {
                        group.agents.push(value.to_ascii_lowercase());
                    }
                    collecting_agents = true;
                }
                "allow" | "disallow" => {
                    collecting_agents = false;
                    if let Some(group) = current.as_mut() {
                        // Порожній Disallow означає "дозволено все" — правило не додаємо
                        if !value.is_empty() {
                            group.rules.push(Rule {
                                allow: key == "allow",
                                pattern: value.to_string(),
                            });
                        }
                    }
                }
                "crawl-delay" => {
                    collecting_agents = false;
                    if let Some(group) = current.as_mut() {
                        group.crawl_delay = value.parse().ok();
                    }
                }
                _ => {}
            }
        }
        groups.extend(current);
        Self { groups }
    }

    /// Групи для нашого бота; якщо іменованої групи немає — групи `*`.
    /// Групи з однаковим User-agent об'єднуються (RFC 9309, 2.2.1).
    fn groups_for(&self, agent: &str) -> Vec<&Group> {
        let agent = agent.to_ascii_lowercase();
        let named: Vec<&Group> = self
            .groups
            .iter()
            .filter(|group| group.agents.contains(&agent))
            .collect();
        if !named.is_empty() {
            return named;
        }
        self.groups
            .iter()
            .filter(|group| group.agents.iter().any(|a| a == "*"))
            .collect()
    }

    /// `path` — шлях разом із query: "/category/napoi-52?page=2"
    pub fn is_allowed(&self, agent: &str, path: &str) -> bool {
        if path == "/robots.txt" {
            return true;
        }
        let mut best: Option<(usize, bool)> = None;
        for rule in self.groups_for(agent).iter().flat_map(|g| &g.rules) {
            if !matches(&rule.pattern, path) {
                continue;
            }
            let length = rule.pattern.len();
            let keep_current = matches!(best, Some((len, allow)) if len > length || (len == length && allow));
            if !keep_current {
                best = Some((length, rule.allow));
            }
        }
        best.is_none_or(|(_, allow)| allow)
    }

    pub fn crawl_delay(&self, agent: &str) -> Option<f64> {
        self.groups_for(agent)
            .iter()
            .filter_map(|g| g.crawl_delay)
            .reduce(f64::max)
    }
}

fn matches(pattern: &str, path: &str) -> bool {
    let (pattern, anchored) = match pattern.strip_suffix('$') {
        Some(stripped) => (stripped, true),
        None => (pattern, false),
    };
    let parts: Vec<&str> = pattern.split('*').collect();
    if !path.starts_with(parts[0]) {
        return false;
    }
    let mut position = parts[0].len();
    let last = parts.len() - 1;
    for (index, part) in parts.iter().enumerate().skip(1) {
        if anchored && index == last {
            return path.len() >= position + part.len() && path.ends_with(part);
        }
        match path[position..].find(part) {
            Some(offset) => position += offset + part.len(),
            None => return false,
        }
    }
    !anchored || position == path.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    const BOT: &str = "OnniMartBot";

    #[test]
    fn silpo_allows_pagination_but_not_other_query() {
        let robots = RobotsTxt::parse(
            "User-agent: *\nDisallow: /cart\nAllow: /*?page=\nDisallow: /*?\n\nUser-agent: AhrefsBot\nCrawl-delay: 50\n",
        );
        assert!(robots.is_allowed(BOT, "/category/napoi-52"));
        assert!(robots.is_allowed(BOT, "/category/napoi-52?page=2"));
        assert!(!robots.is_allowed(BOT, "/category/napoi-52?sortBy=price"));
        assert!(!robots.is_allowed(BOT, "/cart"));
        assert_eq!(robots.crawl_delay(BOT), None);
        assert_eq!(robots.crawl_delay("AhrefsBot"), Some(50.0));
    }

    #[test]
    fn longest_rule_wins_and_allow_wins_ties() {
        // АТБ: Allow /catalog/*, але Disallow /*per-page=*
        let robots = RobotsTxt::parse(
            "User-agent: *\nDisallow: /*per-page=*\nDisallow: *trademark*\nAllow: /catalog/*\n",
        );
        assert!(robots.is_allowed(BOT, "/catalog/285-bakaliya?page=2"));
        assert!(!robots.is_allowed(BOT, "/catalog/285-bakaliya?per-page=48"));
        assert!(!robots.is_allowed(BOT, "/catalog/trademark-x"));

        let tie = RobotsTxt::parse("User-agent: *\nDisallow: /a\nAllow: /a\n");
        assert!(tie.is_allowed(BOT, "/a"));
    }

    #[test]
    fn named_group_overrides_wildcard_and_same_groups_merge() {
        let robots = RobotsTxt::parse(
            "User-agent: *\nAllow: /*.css\n\nUser-agent: wget\nDisallow: /\n\nUser-agent: *\nDisallow: /n/\n",
        );
        assert!(robots.is_allowed(BOT, "/uk/categories/drinks/?page=3"));
        assert!(!robots.is_allowed(BOT, "/n/123"));
        assert!(!robots.is_allowed("wget", "/uk/"));

        let named = RobotsTxt::parse("User-agent: *\nDisallow: /\n\nUser-agent: onnimartbot\nAllow: /\n");
        assert!(named.is_allowed(BOT, "/anything"));
    }

    #[test]
    fn handles_anchors_comments_and_empty_disallow() {
        let robots = RobotsTxt::parse(
            "# коментар\nUser-agent: *\nDisallow: /*.php$ # php\nDisallow:\nCrawl-delay: 3\n",
        );
        assert!(!robots.is_allowed(BOT, "/index.php"));
        assert!(robots.is_allowed(BOT, "/index.php?x=1"));
        assert!(robots.is_allowed(BOT, "/products"));
        assert_eq!(robots.crawl_delay(BOT), Some(3.0));
    }

    #[test]
    fn several_agents_share_one_group() {
        let robots = RobotsTxt::parse("User-agent: a\nUser-agent: b\nDisallow: /private\n");
        assert!(!robots.is_allowed("a", "/private"));
        assert!(!robots.is_allowed("b", "/private"));
        assert!(robots.is_allowed(BOT, "/private"));
    }

    #[test]
    fn robots_txt_itself_is_always_allowed() {
        let robots = RobotsTxt::parse("User-agent: *\nDisallow: /\n");
        assert!(robots.is_allowed(BOT, "/robots.txt"));
        assert!(!robots.is_allowed(BOT, "/"));
    }
}
