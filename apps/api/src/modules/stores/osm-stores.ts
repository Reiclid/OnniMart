/**
 * Магазини з OpenStreetMap → таблиця stores, без БД і I/O (тести поруч).
 * Мережу визначаємо за тегами brand → name → operator, звіряючи з назвою мережі з реєстру
 * (і її osmBrands) серед мереж країн, які покриває вивантаження.
 */

export interface OsmFeature {
  geometry:
    | { type: 'Point'; coordinates: [number, number] }
    | { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
  properties: Record<string, string | number | undefined>;
}

export interface ChainRef {
  id: string;
  name: string;
  countryCode: string;
  osmBrands?: string[];
}

export interface OsmStore {
  chainId: string;
  /** "osm:node/123", "osm:way/456" — стабільний ключ для оновлення */
  externalId: string;
  name: string;
  city: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
}

/** "ALDI SÜD" → "aldisud", "ЕКО маркет" → "екомаркет": регістр, діакритика, пробіли й розділові */
export const normalizeBrand = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');

/** Мови, якими назви країн трапляються в назвах мереж: «Lidl Österreich», «Coop Eesti», «Carrefour Brasil» */
const NAME_LOCALES = [
  'en',
  'de',
  'fr',
  'es',
  'pt',
  'it',
  'nl',
  'pl',
  'cs',
  'sk',
  'hu',
  'ro',
  'bg',
  'hr',
  'sl',
  'sv',
  'da',
  'nb',
  'fi',
  'et',
  'lv',
  'lt',
  'el',
  'tr',
  'uk',
  'ja',
  'zh',
  'ko',
];
const countryNames = new Map<string, Set<string>>();
const namesOf = (code: string) => {
  let names = countryNames.get(code);
  if (!names) {
    names = new Set(
      NAME_LOCALES.map((l) =>
        normalizeBrand(
          new Intl.DisplayNames([l], { type: 'region' }).of(code) ?? '',
        ),
      ).filter(Boolean),
    );
    countryNames.set(code, names);
  }
  return names;
};

/**
 * Як мережу пишуть в OSM, коли в реєстрі назва з країною чи уточненням: «Lidl France» → «Lidl»,
 * «Hofer (ALDI SÜD)» → «Hofer», «K-Market / K-Citymarket» → обидві. Країну знімаємо лише
 * цілими словами в кінці.
 */
export function shortNames(name: string, countryCode: string): string[] {
  const short: string[] = [];
  for (const part of name.split(' / ')) {
    const base = part.replace(/\s*\([^)]*\)/g, '').trim();
    const words = base.split(/\s+/);
    short.push(base);
    for (let k = 1; k <= Math.min(3, words.length - 1); k++) {
      if (namesOf(countryCode).has(normalizeBrand(words.slice(-k).join(''))))
        short.push(words.slice(0, -k).join(' '));
    }
  }
  return short.filter((n) => n && n !== name);
}

/** Покажчик «нормалізована назва → мережа» для мереж кількох країн */
export function brandIndex(chains: ChainRef[]): Map<string, ChainRef> {
  const index = new Map<string, ChainRef>();
  const add = (chain: ChainRef, name: string) => {
    const key = normalizeBrand(name);
    // Ключ з країною: однакова назва в кількох країнах (Lidl DE і Lidl PL) — різні мережі
    if (key && !index.has(`${chain.countryCode}:${key}`))
      index.set(`${chain.countryCode}:${key}`, chain);
  };
  for (const chain of chains)
    for (const name of [chain.name, ...(chain.osmBrands ?? [])])
      add(chain, name);
  // Скорочені назви — після точних: «Coop» мережі Coop не віддаємо «Coop Eesti»
  for (const chain of chains)
    for (const name of shortNames(chain.name, chain.countryCode))
      add(chain, name);
  return index;
}

/** Мережа магазину: за brand, а без нього — за name, потім operator; країна — addr:country або єдина у вивантаженні */
export function chainOf(
  props: OsmFeature['properties'],
  index: Map<string, ChainRef>,
  countries: string[],
): ChainRef | null {
  const country =
    typeof props['addr:country'] === 'string'
      ? props['addr:country'].toUpperCase()
      : null;
  // brand — головний тег: є, але не наш — магазин чужої мережі, навіть якщо name збігається
  // (brand «Netto Marken-Discount», name «Netto» — не NETTO Salling)
  const tags =
    typeof props.brand === 'string' ? ['brand'] : ['name', 'operator'];
  for (const tag of tags) {
    const value = props[tag];
    if (typeof value !== 'string') continue;
    const key = normalizeBrand(value);
    for (const c of country ? [country] : countries) {
      const hit = index.get(`${c}:${key}`);
      if (hit) return hit;
    }
  }
  return null;
}

/** Точка магазину: сама точка або середина зовнішнього контуру будівлі */
export function centerOf(
  geometry: OsmFeature['geometry'],
): [number, number] | null {
  if (geometry.type === 'Point') return geometry.coordinates;
  const ring =
    geometry.type === 'Polygon'
      ? (geometry.coordinates as number[][][])[0]
      : (geometry.coordinates as number[][][][])[0]?.[0];
  if (!ring?.length) return null;
  const [lon, lat] = ring.reduce(
    (sum, [x, y]) => [sum[0] + x, sum[1] + y],
    [0, 0],
  );
  return [lon / ring.length, lat / ring.length];
}

export function toStore(feature: OsmFeature, chain: ChainRef): OsmStore | null {
  const p = feature.properties;
  const center = centerOf(feature.geometry);
  if (!center || p['@id'] === undefined) return null;
  const text = (key: string) =>
    typeof p[key] === 'string' && p[key] ? p[key] : null;
  const street = [text('addr:street'), text('addr:housenumber')]
    .filter(Boolean)
    .join(' ');
  const address =
    [street, text('addr:postcode')].filter(Boolean).join(', ') || null;
  return {
    chainId: chain.id,
    externalId: `osm:${p['@type'] as string}/${p['@id']}`,
    name: text('name') ?? chain.name,
    city: text('addr:city'),
    address,
    latitude: Math.round(center[1] * 1e6) / 1e6,
    longitude: Math.round(center[0] * 1e6) / 1e6,
  };
}
