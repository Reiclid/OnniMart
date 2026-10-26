// PRD-20: офлайн-оцінка ранжування (AUDIT §9.3, пункт 4) — як match:evaluate для матчингу.
// Синтетичні користувачі з персон (docs/05-user-research.md) поверх справжнього каталогу:
// v0 збирає логи (з 10 % випадкових слотів), v1 вчиться на них, обидві порівнюються на окремих
// сесіях тих самих користувачів: NDCG@10 (проти прихованої корисності), MRR, AUC P(клік), кліків
// на сесію. Лише читає БД.
//   bun run rec:evaluate
//   bun run rec:evaluate -- --users 60 --seed 7
import {
  evaluate,
  examination,
  ipwExamples,
  logit,
  seeded,
  simulate,
  trainLogistic,
  v0Scores,
  FEATURES,
  WEIGHTS,
  type LinearModel,
  type ListType,
  type Report,
  type Session,
} from '@repo/ranking';
import { PrismaService } from '../src/prisma/prisma.service';
import { loadCandidates } from '../src/modules/recommendations/recommendations.service';

/** Найбільший каталог країни для симуляції: товари з цінами, спершу в багатьох мережах */
const CATALOGUE = 5000;

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};

async function main() {
  const prisma = new PrismaService();
  const seed = arg('seed', 42);
  const catalogues = new Map(
    await Promise.all(
      ['UA', 'DE'].map(async (country) => {
        const rows = await prisma.$queryRaw<{ id: string }[]>`
          SELECT v."productId" AS id
          FROM listings l
          JOIN product_variants v ON v.id = l."variantId"
          JOIN store_chains sc ON sc.id = l."chainId"
          WHERE l."delistedAt" IS NULL AND l."currentPrice" IS NOT NULL
            AND sc."countryCode" = ${country}
          GROUP BY v."productId"
          ORDER BY count(DISTINCT l."chainId") DESC, v."productId"
          LIMIT ${CATALOGUE}`;
        const candidates = await loadCandidates(
          prisma,
          rows.map((r) => r.id),
          country,
        );
        return [country, candidates.filter((c) => c.category)] as const;
      }),
    ),
  );
  await prisma.$disconnect();
  console.log(
    `Каталог: ${[...catalogues].map(([c, items]) => `${c} ${items.length}`).join(', ')} товарів`,
  );

  const started = Date.now();
  const sim = simulate({
    catalogues,
    usersPerPersona: arg('users', 40),
    trainSessions: 30,
    testSessions: 10,
    seed,
  });
  const clicks = sim.train.filter((i) => i.clicked).length;
  console.log(
    `Симуляція: ${sim.users.length} користувачів, ${sim.train.length} показів для навчання (${clicks} кліків), ${sim.test.length} тестових сесій за ${Date.now() - started} мс`,
  );

  // Окрема модель на список: у пошуку головна релевантність, у «Для вас» її немає
  const models = new Map<ListType, LinearModel>();
  for (const list of ['search', 'for-you'] as const) {
    models.set(
      list,
      trainLogistic(
        ipwExamples(
          sim.train.filter((i) => i.list === list),
          examination,
        ),
        { random: seeded(seed + 1) },
      ),
    );
  }
  const v1 =
    (personal: boolean) =>
    (s: Session): Map<string, number> => {
      const model = models.get(s.list)!;
      return new Map(
        [...s.features].map(([id, f]) => [
          id,
          logit(model, f, personal ? s.user.id : undefined),
        ]),
      );
    };
  const random = seeded(seed + 2);
  const rankers: [string, (s: Session) => Map<string, number>][] = [
    ['випадковий', (s) => new Map(s.candidates.map((c) => [c.id, random()]))],
    ['v0 (ручні ваги)', v0Scores],
    ['v1 (глобальна)', v1(false)],
    ['v1 (+ зсуви користувача)', v1(true)],
  ];

  for (const list of ['search', 'for-you'] as const) {
    const sessions = sim.test.filter((s) => s.list === list);
    console.log(
      `\n${list === 'search' ? 'Пошук' : 'Для вас'} (${sessions.length} сесій):`,
    );
    console.log('| Модель | NDCG@10 | MRR | AUC | Кліків на сесію |');
    console.log('|---|---|---|---|---|');
    for (const [name, scorer] of rankers) row(name, evaluate(sessions, scorer));
  }

  console.log('\nВаги v1 (глобальні; v0 для порівняння):');
  console.log(
    `| Ознака | ${['search', 'for-you'].map((l) => `v1 ${l} | v0 ${l}`).join(' | ')} |`,
  );
  console.log('|---|---|---|---|---|');
  const v0 = { search: WEIGHTS.search, 'for-you': WEIGHTS.forYou };
  for (const f of FEATURES)
    console.log(
      `| ${f} | ${(['search', 'for-you'] as const)
        .map((l) => `${models.get(l)!.weights[f].toFixed(2)} | ${v0[l][f]}`)
        .join(' | ')} |`,
    );
}

function row(name: string, r: Report) {
  console.log(
    `| ${name} | ${r.ndcg10.toFixed(3)} | ${r.mrr.toFixed(3)} | ${r.auc.toFixed(3)} | ${r.clicks.toFixed(2)} |`,
  );
}

void main();
