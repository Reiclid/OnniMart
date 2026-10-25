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

/** Покажчик «нормалізована назва → мережа» для мереж кількох країн */
export function brandIndex(chains: ChainRef[]): Map<string, ChainRef> {
  const index = new Map<string, ChainRef>();
  for (const chain of chains) {
    for (const name of [chain.name, ...(chain.osmBrands ?? [])]) {
      const key = normalizeBrand(name);
      // Ключ з країною: однакова назва в кількох країнах (Lidl DE і Lidl PL) — різні мережі
      if (key && !index.has(`${chain.countryCode}:${key}`))
        index.set(`${chain.countryCode}:${key}`, chain);
    }
  }
  return index;
}

/** Мережа магазину: за brand, потім name, потім operator; країна — addr:country або єдина у вивантаженні */
export function chainOf(
  props: OsmFeature['properties'],
  index: Map<string, ChainRef>,
  countries: string[],
): ChainRef | null {
  const country =
    typeof props['addr:country'] === 'string'
      ? props['addr:country'].toUpperCase()
      : null;
  for (const tag of ['brand', 'name', 'operator']) {
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
