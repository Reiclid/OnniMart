// Магазини з OpenStreetMap: вивантаження Geofabrik країн, де в реєстрі є мережі, → вибірка
// продуктових магазинів (tools/osm) → data/osm/<вивантаження>.shops.geojsonseq. Далі stores:import.
// Повне оновлення ≈ 66 ГБ (≈ 5 год при 3–4 МБ/с), тому раз на квартал: свіжіші за 80 днів
// вивантаження пропускаються. Країни без жодної дозволеної мережі (RU, BY) не завантажуються.
//   bun run stores:download                # усе, що застаріло
//   bun run stores:download -- DE UA       # лише ці країни
//   bun run stores:download -- --force DE  # навіть якщо свіже
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHAINS } from '../prisma/data/chains';

const ROOT = join(__dirname, '../../..');
export const OSM_DIR = join(ROOT, 'data/osm');
const INDEX_URL = 'https://download.geofabrik.de/index-v1-nogeom.json';
const USER_AGENT = 'OnniMartBot/0.1 (diploma project; reiclid@gmail.com)';
const FRESH_DAYS = 80;
/** Спершу країни з мережами, що вже парсяться: їхні магазини потрібні першими */
const FIRST = ['DE', 'UA'];

type Extract = { id: string; url: string; iso: string[] };

async function extracts(
  countries: Set<string>,
): Promise<{ plan: Extract[]; missing: string[] }> {
  const response = await fetch(INDEX_URL, {
    headers: { 'user-agent': USER_AGENT },
  });
  const index = (await response.json()) as {
    features: {
      properties: {
        id: string;
        urls: { pbf: string };
        'iso3166-1:alpha2'?: string[];
      };
    }[];
  };
  const byId = new Map<string, Extract>();
  const missing: string[] = [];
  for (const country of countries) {
    // Найменше вивантаження, що покриває країну (сама країна, а не континент)
    const best = index.features
      .map((f) => f.properties)
      .filter((p) => p['iso3166-1:alpha2']?.includes(country))
      .sort(
        (a, b) =>
          (a['iso3166-1:alpha2']?.length ?? 0) -
          (b['iso3166-1:alpha2']?.length ?? 0),
      )[0];
    if (!best) {
      missing.push(country);
      continue;
    }
    const extract = byId.get(best.id) ?? {
      id: best.id,
      url: best.urls.pbf,
      iso: [],
    };
    extract.iso.push(country);
    byId.set(best.id, extract);
  }
  const rank = (e: Extract) => (e.iso.some((c) => FIRST.includes(c)) ? 0 : 1);
  return {
    plan: [...byId.values()].sort(
      (a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id),
    ),
    missing,
  };
}

function isFresh(id: string): boolean {
  const file = join(OSM_DIR, `${id}.shops.geojsonseq`);
  return (
    existsSync(file) &&
    Date.now() - statSync(file).mtimeMs < FRESH_DAYS * 86_400_000
  );
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const only = new Set(args.filter((a) => /^[A-Z]{2}$/.test(a)));
  const countries = new Set(
    CHAINS.filter(
      (c) =>
        c.status !== 'RULED_OUT' &&
        (only.size === 0 || only.has(c.countryCode)),
    ).map((c) => c.countryCode),
  );
  mkdirSync(OSM_DIR, { recursive: true });
  const { plan, missing } = await extracts(countries);
  if (missing.length)
    console.warn(
      `Немає окремого вивантаження Geofabrik: ${missing.join(', ')}`,
    );

  const todo = plan.filter((e) => force || !isFresh(e.id));
  console.log(`Вивантажень: ${plan.length}, до завантаження: ${todo.length}`);
  const started = Date.now();
  for (const [i, extract] of todo.entries()) {
    console.log(
      `\n[${i + 1}/${todo.length}] ${extract.id} (${extract.iso.join(', ')})`,
    );
    const run = spawnSync(
      'docker',
      [
        'compose',
        '--profile',
        'tools',
        'run',
        '--rm',
        'osm',
        extract.url,
        extract.id,
      ],
      {
        cwd: ROOT,
        stdio: 'inherit',
      },
    );
    // Ctrl-C (130) — зупинити все, а не перейти до наступної країни
    if (run.status === 130 || run.signal) process.exit(130);
    if (run.status !== 0) {
      console.error(
        `${extract.id}: помилка (код ${run.status}), далі — наступне`,
      );
      continue;
    }
    writeFileSync(
      join(OSM_DIR, `${extract.id}.meta.json`),
      JSON.stringify({ ...extract, downloadedAt: new Date().toISOString() }),
    );
    const perItem = (Date.now() - started) / (i + 1);
    console.log(
      `Залишилось ≈ ${Math.round((perItem * (todo.length - i - 1)) / 60_000)} хв`,
    );
  }
}

if (require.main === module) void main();
