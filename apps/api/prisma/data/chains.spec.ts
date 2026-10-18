import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHAINS } from './chains';
import { COUNTRIES } from './countries';

/** Слаги з `SUPPORTED` у Rust-парсері */
function scraperSources(): string[] {
  const rs = readFileSync(
    join(__dirname, '../../../scraper/src/sources/mod.rs'),
    'utf8',
  );
  const block = /pub const SUPPORTED: &\[&str\] = &\[([\s\S]*?)\];/.exec(rs);
  return [...(block?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe('реєстр мереж', () => {
  it('слаги унікальні й у форматі a-z0-9-', () => {
    const slugs = CHAINS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('кожна країна мережі є в довіднику країн', () => {
    const codes = new Set(COUNTRIES.map((c) => c.code));
    for (const chain of CHAINS) expect(codes.has(chain.countryCode)).toBe(true);
  });

  it('мережі з парсером (ACTIVE/PAUSED) ↔ джерела Rust-парсера', () => {
    const withParser = CHAINS.filter(
      (c) => c.status === 'ACTIVE' || c.status === 'PAUSED',
    ).map((c) => c.slug);
    expect(withParser.sort()).toEqual(scraperSources().sort());
  });

  it('відкинуті мережі пояснюють чому', () => {
    for (const chain of CHAINS.filter((c) => c.status === 'RULED_OUT'))
      expect(chain.notes).toBeTruthy();
  });
});
