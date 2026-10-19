# User research: personas, scenarios, information priority

This document drives the UI design. Every screen element must answer a need listed here; anything that does not is removed or moved deeper.

Main question of the product: **"What does this product look like, and where is it cheapest right now?"** The user must reach that answer in as few actions as possible.

---

## 1. Personas

### Olena — family budget shopper (primary)

| | |
|---|---|
| Age, place | 38, Kyiv, two children |
| Shops | One big weekly shop (Silpo, NOVUS, VARUS) plus small top-ups near home |
| Device | Android phone; plans the shop at home in the evening |
| Goal | Spend less on the same basket without visiting five apps |
| Problems | Prices for the same item differ by 10–20 % between chains; "discounts" with an inflated old price; no time to compare every product |
| Wants | See the cheapest chain for each item at a glance; trust that a discount is real; a shopping list split by chain |
| Success | "In two minutes I know where to buy milk, cola and nappies this week." |

### Max — in-store checker (primary)

| | |
|---|---|
| Age, place | 24, Lviv, student, lives alone |
| Shops | Small baskets several times a week, whichever store is on the way |
| Device | iPhone, uses it one-handed in the aisle |
| Goal | Not to overpay right now, in the store |
| Problems | Pack sizes hide the real price (0.5 L vs 1.25 L); typing product names in a store is slow |
| Wants | Scan a barcode and instantly see whether it is cheaper elsewhere; price per litre / kilogram to compare sizes |
| Success | "Scan, one glance, decide — in under five seconds." |

### Iryna — price-alert follower (secondary)

| | |
|---|---|
| Age, place | 67, Zhytomyr, pensioner |
| Shops | The same 15–20 products every month |
| Device | Older phone, large system font |
| Goal | Buy her usual products when they are on a real discount |
| Problems | Small text and dense screens; does not browse catalogues; forgets to check prices |
| Wants | A notification "Your milk is 15 % cheaper at VARUS until Sunday"; large, simple screens |
| Success | "The app tells me when to buy; I do not have to look." |

Later persona (out of scope now): a person who lives between Ukraine and Germany and compares the same product across countries.

---

## 2. Scenarios and effort

Actions = taps, typing a query or aiming the camera. Scrolling within one screen is counted separately. "v1" is the current Figma design, "v2" the redesign.

| # | Persona | Scenario | v1 | v2 | What changes |
|---|---|---|---|---|---|
| S1 | Olena | Where is Coca-Cola 1.25 L cheapest right now? | 3 actions (search → type → open product), answer on the 3rd screen: the results list shows only the price per litre and a price range | **2 actions**, answer in the results list | Result row shows the lowest real price and its chain; price per litre is secondary |
| S2 | Max | In the store: is this cheaper elsewhere? | 2 actions (scanner → aim), but the scanner is a big floating button that dominates every screen | **2 actions** | Scanner icon lives in the search field; the result sheet shows the cheapest price, chain and the saving |
| S3 | Olena / Max | Which pack size is the best value? | 4 extra taps on the product screen (one per size) and remembering numbers | **0 extra taps** | Size selector shows the price per litre under each size and marks the best value |
| S4 | Iryna | Get notified when milk gets cheaper | 4 actions (search → type → product → Track) | **4 actions**, clearer | "Track price" opens presets (any discount / below a price); larger text setting |
| S5 | Olena | Is this discount real? | 1 scroll to the history chart | **1 scroll** | History chart shows the lowest price of the last 30 days |
| S6 | All | Change notification or region settings | Not possible — no Profile or Settings screens | **2 actions** (Profile → Settings) | New Profile and Settings screens |

---

## 3. Information priority heatmap

Score per persona: 3 = needed every time, 2 = often, 1 = sometimes, 0 = never. Tier by average:

- **Tier 1 (≥ 2.5)** — visible without scrolling or tapping.
- **Tier 2 (1.5–2.4)** — one tap or one scroll away.
- **Tier 3 (0.5–1.4)** — in details, collapsed or at the bottom.
- **Remove (< 0.5)**.

| Information / feature | Olena | Max | Iryna | Avg | Tier | Decision |
|---|---|---|---|---|---|---|
| Product photo | 3 | 3 | 3 | 3.0 | 1 | Large on the product screen, on every card and row |
| Product name with pack size | 3 | 3 | 3 | 3.0 | 1 | One line in rows, max two lines in cards |
| Lowest current price | 3 | 3 | 3 | 3.0 | 1 | Largest number on every screen |
| Chain with the lowest price | 3 | 3 | 2 | 2.7 | 1 | Next to the price |
| Discount: badge and old price | 3 | 2 | 3 | 2.7 | 1 | Badge on the photo, old price struck through |
| Price per litre / kg | 2 | 3 | 1 | 2.0 | 2 | Secondary line; under each pack size |
| Prices in all chains | 3 | 2 | 1 | 2.0 | 2 | First section below the price card |
| Price alert (track) | 2 | 1 | 3 | 2.0 | 2 | Sticky button on the product screen |
| Barcode scanner | 1 | 3 | 1 | 1.7 | 2 | Icon in the search field |
| Flavours / variants | 2 | 1 | 1 | 1.3 | 3 | Chips below pack sizes |
| Chain filter on Home | 2 | 1 | 0 | 1.0 | 3 | Keep as a single chip row |
| Price history, 30-day low | 2 | 1 | 1 | 1.3 | 3 | Below the chain list |
| Add to shopping list | 2 | 0 | 1 | 1.0 | 3 | Secondary icon button |
| Promo end date | 2 | 1 | 1 | 1.3 | 3 | Only in the chain row of that promo |
| Notifications bell | 1 | 0 | 2 | 1.0 | 3 | Small icon in the Home header |
| Brand label above the name | 1 | 1 | 0 | 0.7 | 3 | Removed from cards (name already has the brand); kept on the product screen only |
| "Updated at 14:05" per chain | 1 | 1 | 0 | 0.7 | 3 | One line at the end of the chain list |
| "−6 % this month" trend | 1 | 1 | 0 | 0.7 | 3 | Moved into the history section |
| Number of chains ("in 6 chains") | 1 | 1 | 0 | 0.7 | 3 | Removed from cards and rows; the chain list shows it |
| Prices in other countries | 1 | 1 | 0 | 0.7 | 3 | Collapsed row "Other countries" |
| Desktop stats (average, spread) | 1 | 0 | 0 | 0.3 | Remove | Removed |
| Price range in search results | 1 | 1 | 0 | 0.7 | 3 | Removed (the lowest price is enough) |
| Greeting on Home | 0 | 0 | 0 | 0 | Remove | Removed |
| Results count in search | 0 | 0 | 0 | 0 | Remove | Removed |

---

## 4. Design rules derived from the research

1. Price and photo are always the first thing the eye meets. One price per card, one accent colour for it.
2. No element without a need in the heatmap. A new element enters at Tier 3 and is promoted only with evidence.
3. Cards and rows carry at most four pieces of information: photo, name, price, one context line.
4. Shadows only for things that float (tab bar, sticky actions, sheets). Cards use a 1 px border.
5. Text respects the system font size (Iryna); no text below 11 px.
6. All copy in English for now; Ukrainian localisation comes later.

---

## 5. Applied in Figma (v2, 19.10.2026)

File: OnniMart — UI, page **Screens** (screens, heatmap, scenarios) and **Foundations · Components** (tokens, components).

| Screen | Removed or moved | Added |
|---|---|---|
| Home | Greeting, brand line and promo dates on cards, "from" before prices | Bell next to the search field; card = photo, name, price, cheapest chain |
| Search | Results count, price range, "in N chains" | Row = lowest price + cheapest chain; price per litre secondary |
| Product | Subtitle with chain count, per-row "updated", trend chip, other-country row | Price per litre under each pack size with "best"; one "updated" footnote; collapsed "Other countries" |
| Scanner | Barcode formats, raw barcode, size line | Saving vs elsewhere next to the price |
| Alerts | Explanatory subtitle | — |
| Desktop | Average / 90-day low / spread cards, long subtitle | — |
| New | — | Profile, Settings, Track price sheet (presets) |
| All | Floating scanner button, 26 decorative shadows, drawn bottle images | English copy, real product photos, components |
