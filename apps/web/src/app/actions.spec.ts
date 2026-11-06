import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const here = import.meta.dir;

// Серверну дію можна викликати POST-ом з будь-якої адреси, proxy.ts її не захищає
describe('серверні дії адмінки', () => {
  const actions = readFileSync(join(here, 'actions.ts'), 'utf8').split('export async function ').slice(1);

  it('кожна перевіряє доступ через run()', () => {
    expect(actions.length).toBeGreaterThanOrEqual(19);
    const unguarded = actions.filter((body) => !body.includes('run(')).map((body) => body.split('(')[0]);
    expect(unguarded).toEqual([]);
  });

  it('вітрина їх не імпортує', () => {
    const shop = join(here, '(shop)');
    const offenders = [...new Bun.Glob('**/*.{ts,tsx}').scanSync(shop)].filter((file) =>
      readFileSync(join(shop, file), 'utf8').includes("'@/app/actions'"),
    );
    expect(offenders).toEqual([]);
  });
});
