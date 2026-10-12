use chrono::{Datelike, NaiveDate, SecondsFormat, Utc};

pub fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

/// Схлопує пробіли та переноси рядків
pub fn clean(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Непорожній очищений текст або None
pub fn non_empty(text: &str) -> Option<String> {
    let cleaned = clean(text);
    (!cleaned.is_empty()).then_some(cleaned)
}

/// "2,19 €", "1.299,00 €", "19.90", "33,70 грн" → число
pub fn parse_price(text: &str) -> Option<f64> {
    let filtered: String = text
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == ',' || *c == '.')
        .collect();
    let normalized = if filtered.contains(',') {
        // Європейський формат: крапка — розділювач тисяч, кома — десяткова
        filtered.replace('.', "").replace(',', ".")
    } else {
        filtered
    };
    let value: f64 = normalized.trim_matches('.').parse().ok()?;
    (value > 0.0).then_some(value)
}

pub fn pages(total: u64, per_page: u64) -> u32 {
    if per_page == 0 {
        return 1;
    }
    total.div_ceil(per_page).max(1) as u32
}

/// JSON усередині `<script id="...">…</script>` (Next.js, Angular TransferState)
pub fn script_json<'a>(html: &'a str, id: &str) -> Option<&'a str> {
    let marker = format!("id=\"{id}\"");
    let start = html.find(&marker)?;
    let open_end = start + html[start..].find('>')? + 1;
    let close = open_end + html[open_end..].find("</script>")?;
    Some(&html[open_end..close])
}

/// JSON-обʼєкт, що починається з першої `{` після `marker`:
/// `window.__INITIAL_STATE__ = {...};(function(){...})()` → `{...}`.
/// Дужки рахуються з урахуванням рядків, тож хвіст скрипту не заважає.
pub fn json_object_after<'a>(html: &'a str, marker: &str) -> Option<&'a str> {
    let start = html.find(marker)?;
    let open = start + html[start..].find('{')?;
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;
    for (offset, byte) in html.as_bytes()[open..].iter().enumerate() {
        if in_string {
            match byte {
                _ if escaped => escaped = false,
                b'\\' => escaped = true,
                b'"' => in_string = false,
                _ => {}
            }
            continue;
        }
        match byte {
            b'"' => in_string = true,
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(&html[open..=open + offset]);
                }
            }
            _ => {}
        }
    }
    None
}

/// Фасування з підпису "je 500-g-Packg.", "je Ka. 20 x 0,5-l-Fl.": без "je" на початку.
/// Повертає (фасування, ваговий товар); "je Stück" / "je" — фасування невідоме.
pub fn german_unit(text: &str) -> (Option<String>, bool) {
    let unit = clean(text);
    let unit = unit.strip_prefix("je").unwrap_or(&unit).trim();
    let unit = unit.strip_prefix("ca.").unwrap_or(unit).trim();
    match unit {
        "kg" | "1 kg" => (None, true),
        "" | "Stück" | "Packg." | "Paar" => (None, false),
        _ => (Some(unit.to_string()), false),
    }
}

/// "до 13.10" → "2026-10-13". Рік не вказано, тож беремо найближчу майбутню дату.
pub fn day_month_to_date(text: &str, today: NaiveDate) -> Option<String> {
    let re = regex::Regex::new(r"(\d{1,2})\.(\d{1,2})").ok()?;
    let caps = re.captures(text)?;
    let day: u32 = caps[1].parse().ok()?;
    let month: u32 = caps[2].parse().ok()?;
    let mut date = NaiveDate::from_ymd_opt(today.year(), month, day)?;
    if date < today - chrono::Duration::days(60) {
        date = NaiveDate::from_ymd_opt(today.year() + 1, month, day)?;
    }
    Some(date.format("%Y-%m-%d").to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_prices_in_different_formats() {
        assert_eq!(parse_price("2,19 €"), Some(2.19));
        assert_eq!(parse_price(" 0,79 €¹ "), Some(0.79));
        assert_eq!(parse_price("1.299,00 €"), Some(1299.0));
        assert_eq!(parse_price("19.90"), Some(19.9));
        assert_eq!(parse_price("33,70 грн/шт"), Some(33.7));
        assert_eq!(parse_price("—"), None);
        assert_eq!(parse_price("0,00"), None);
    }

    #[test]
    fn counts_pages() {
        assert_eq!(pages(3467, 47), 74);
        assert_eq!(pages(30, 30), 1);
        assert_eq!(pages(0, 30), 1);
    }

    #[test]
    fn extracts_script_json() {
        let html = r#"<script id="__NEXT_DATA__" type="application/json">{"a":1}</script>"#;
        assert_eq!(script_json(html, "__NEXT_DATA__"), Some(r#"{"a":1}"#));
        assert_eq!(script_json(html, "missing"), None);
    }

    #[test]
    fn extracts_json_object_after_marker() {
        let html = r#"<script>window.__INITIAL_STATE__={"a":{"b":"}{"},"c":[1]};(function(){var x={};}())</script>"#;
        assert_eq!(
            json_object_after(html, "__INITIAL_STATE__"),
            Some(r#"{"a":{"b":"}{"},"c":[1]}"#)
        );
        assert_eq!(json_object_after(html, "missing"), None);
    }

    #[test]
    fn splits_german_unit_labels() {
        assert_eq!(german_unit("je 500-g-Packg."), (Some("500-g-Packg.".into()), false));
        assert_eq!(german_unit("je Ka. 20 x 0,5-l-Fl."), (Some("Ka. 20 x 0,5-l-Fl.".into()), false));
        assert_eq!(german_unit("je ca. 640 g"), (Some("640 g".into()), false));
        assert_eq!(german_unit("je kg"), (None, true));
        assert_eq!(german_unit("je Stück"), (None, false));
        assert_eq!(german_unit("je"), (None, false));
    }

    #[test]
    fn converts_day_month_to_nearest_future_date() {
        let today = NaiveDate::from_ymd_opt(2026, 10, 11).unwrap();
        assert_eq!(day_month_to_date("до 13.10", today).as_deref(), Some("2026-10-13"));
        assert_eq!(day_month_to_date("до 05.01", today).as_deref(), Some("2027-01-05"));
        assert_eq!(day_month_to_date("без дати", today), None);
    }
}
