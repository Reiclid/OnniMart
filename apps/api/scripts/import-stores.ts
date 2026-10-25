// Магазини мереж з вибірок OpenStreetMap (data/osm, див. osm-download.ts) → таблиця stores.
// Магазини мереж з реєстру оновлюються за ключем osm:<тип>/<id>; ті, яких більше немає у
// вивантаженні, видаляються (лише osm:*, лише мережі країн цього вивантаження).
// Дані — © учасники OpenStreetMap, ODbL: показуючи магазини, вказувати джерело.
//   bun run stores:import            # усі готові вибірки
//   bun run stores:import -- germany # одна
import {
  createReadStream,
  existsSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { Prisma } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  brandIndex,
  chainOf,
  toStore,
  type ChainRef,
  type OsmFeature,
  type OsmStore,
} from '../src/modules/stores/osm-stores';
import { CHAINS } from '../prisma/data/chains';
import { OSM_DIR } from './osm-download';

/** Країни без власного вивантаження Geofabrik — у складі сусіднього */
const ALSO_COVERS: Record<string, string[]> = {
  china: ['HK'],
  'malaysia-singapore-brunei': ['SG'],
  'gcc-states': ['SA'],
};
const BATCH = 1000;

async function readStores(
  file: string,
  index: Map<string, ChainRef>,
  countries: string[],
) {
  const stores = new Map<string, OsmStore>();
  const unmatched = new Map<string, number>();
  const lines = createInterface({
    input: createReadStream(file, 'utf8'),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const feature = JSON.parse(line) as OsmFeature;
    const chain = chainOf(feature.properties, index, countries);
    if (!chain) {
      const brand = feature.properties.brand;
      if (typeof brand === 'string')
        unmatched.set(brand, (unmatched.get(brand) ?? 0) + 1);
      continue;
    }
    const store = toStore(feature, chain);
    if (store) stores.set(`${store.chainId}|${store.externalId}`, store);
  }
  return { stores: [...stores.values()], unmatched };
}

async function upsert(prisma: PrismaService, stores: OsmStore[]) {
  for (let i = 0; i < stores.length; i += BATCH) {
    const rows = stores
      .slice(i, i + BATCH)
      .map(
        (s) =>
          Prisma.sql`(gen_random_uuid()::text, ${s.chainId}, ${s.externalId}, ${s.name}, ${s.city}, ${s.address}, ${s.latitude}, ${s.longitude})`,
      );
    await prisma.$executeRaw`
      INSERT INTO stores (id, "chainId", "externalId", name, city, address, latitude, longitude)
      VALUES ${Prisma.join(rows)}
      ON CONFLICT ("chainId", "externalId") DO UPDATE SET
        name = EXCLUDED.name, city = EXCLUDED.city, address = EXCLUDED.address,
        latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude`;
  }
}

async function main() {
  const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const prisma = new PrismaService();
  const osmBrands = new Map(CHAINS.map((c) => [c.slug, c.osmBrands]));
  const chains = (
    await prisma.storeChain.findMany({
      where: { status: { not: 'RULED_OUT' } },
      select: { id: true, slug: true, name: true, countryCode: true },
    })
  ).map((c) => ({ ...c, osmBrands: osmBrands.get(c.slug) }));
  const index = brandIndex(chains);

  const metas = readdirSync(OSM_DIR)
    .filter((f) => f.endsWith('.meta.json'))
    .map(
      (f) =>
        JSON.parse(readFileSync(join(OSM_DIR, f), 'utf8')) as {
          id: string;
          iso: string[];
        },
    )
    .filter((m) => only.length === 0 || only.includes(m.id));

  let total = 0;
  for (const meta of metas) {
    const file = join(OSM_DIR, `${meta.id}.shops.geojsonseq`);
    if (!existsSync(file)) continue;
    const countries = [...meta.iso, ...(ALSO_COVERS[meta.id] ?? [])];
    const { stores, unmatched } = await readStores(file, index, countries);
    await upsert(prisma, stores);

    // Магазини, що зникли з OSM (закрились або перейменовані), — лише наші osm:* у цих країнах
    const chainIds = chains
      .filter((c) => countries.includes(c.countryCode))
      .map((c) => c.id);
    const seen = stores.map((s) => s.externalId);
    const removed = chainIds.length
      ? await prisma.$executeRaw`
          DELETE FROM stores WHERE "chainId" IN (${Prisma.join(chainIds)})
            AND "externalId" LIKE 'osm:%' AND NOT ("externalId" = ANY(${seen}::text[]))`
      : 0;

    total += stores.length;
    const perChain = new Map<string, number>();
    for (const s of stores)
      perChain.set(s.chainId, (perChain.get(s.chainId) ?? 0) + 1);
    const names = new Map(chains.map((c) => [c.id, c.name]));
    console.log(
      `${meta.id} (${countries.join(', ')}): ${stores.length} магазинів мереж, видалено ${removed}\n  ` +
        [...perChain]
          .sort((a, b) => b[1] - a[1])
          .map(([id, n]) => `${names.get(id)} ${n}`)
          .join(', '),
    );
    // Найчастіші бренди без мережі — підказка для osmBrands у реєстрі
    const top = [...unmatched].sort((a, b) => b[1] - a[1]).slice(0, 12);
    if (top.length)
      console.log(
        `  без мережі: ${top.map(([b, n]) => `${b} ${n}`).join(', ')}`,
      );
  }
  console.log(`Разом: ${total} магазинів`);
  await prisma.$disconnect();
}

void main();
