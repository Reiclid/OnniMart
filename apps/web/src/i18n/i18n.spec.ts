import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOGS, INTL_LOCALE, isPlural, LOCALES, translate, translateRich, type Catalog, type Plural } from '.';

/** Ключ → значення (рядок або форми множини) */
function flatten(node: Catalog | Record<string, unknown>, prefix = ''): Map<string, string | Plural> {
  const out = new Map<string, string | Plural>();
  for (const [key, value] of Object.entries(node)) {
    const path = prefix + key;
    if (typeof value === 'string' || isPlural(value)) out.set(path, value);
    else for (const [k, v] of flatten(value as Record<string, unknown>, `${path}.`)) out.set(k, v);
  }
  return out;
}

const placeholders = (value: string | Plural) =>
  [...new Set((typeof value === 'string' ? [value] : Object.values(value)).join(' ').match(/\{\w+\}/g) ?? [])].sort();

const en = flatten(CATALOGS.en);

describe('каталоги перекладів', () => {
  it.each(LOCALES)('%s: ті самі ключі, що й en', (locale) => {
    expect([...flatten(CATALOGS[locale]).keys()].sort()).toEqual([...en.keys()].sort());
  });

  it.each(LOCALES)('%s: ті самі плейсхолдери, що й en', (locale) => {
    for (const [key, value] of flatten(CATALOGS[locale])) {
      expect({ key, placeholders: placeholders(value) }).toEqual({ key, placeholders: placeholders(en.get(key)!) });
    }
  });

  it.each(LOCALES)('%s: множина має всі форми мови (Intl.PluralRules) і {count}', (locale) => {
    const forms = new Intl.PluralRules(INTL_LOCALE[locale]).resolvedOptions().pluralCategories;
    for (const [key, value] of flatten(CATALOGS[locale])) {
      if (!isPlural(value)) continue;
      expect({ key, forms: Object.keys(value).sort() }).toEqual({ key, forms: [...forms].sort() });
      for (const form of Object.values(value)) expect(form).toContain('{count}');
    }
  });

  it.each(LOCALES)('%s: без порожніх рядків', (locale) => {
    for (const [key, value] of flatten(CATALOGS[locale])) {
      for (const text of typeof value === 'string' ? [value] : Object.values(value)) expect({ key, empty: text.trim() === '' }).toEqual({ key, empty: false });
    }
  });
});

describe('translate', () => {
  it('підставляє параметри й обирає форму множини', () => {
    expect(translate('en', 'card.cheapestAt', { chain: 'NOVUS' })).toBe('Cheapest at NOVUS');
    expect(translate('uk', 'profile.active', { count: 1 })).toBe('1 активне');
    expect(translate('uk', 'profile.active', { count: 3 })).toBe('3 активні');
    expect(translate('uk', 'profile.active', { count: 5 })).toBe('5 активних');
    expect(translate('uk', 'profile.active', { count: 21 })).toBe('21 активне');
    expect(translate('uk', 'alerts.newCount', { count: 2 })).toBe('2 нові');
  });

  it('rich: плейсхолдер замінюється елементом, решта — рядки', () => {
    expect(translateRich('en', 'scanner.notFound', { code: 42 })).toEqual(['No product with barcode ', 42, ' yet.']);
  });
});

// --- Використання в коді ----------------------------------------------------------------

const SRC = join(import.meta.dir, '..');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'generated' || name === 'admin' || name === 'i18n' ? [] : files(path);
    return /\.tsx?$/.test(name) && !name.endsWith('.spec.ts') ? [path] : [];
  });
const sources = files(SRC).map((path) => ({ path, text: readFileSync(path, 'utf8') }));

describe('ключі в коді', () => {
  it('кожен ключ каталогу десь використовується (без мертвих перекладів)', () => {
    const all = sources.map((s) => s.text).join('\n');
    const unused = [...en.keys()].filter((key) => !all.includes(`'${key}'`) && !all.includes(`"${key}"`));
    expect(unused).toEqual([]);
  });

  it('вітрина без захардкоджених англійських текстів (JSX-текст, aria-label, placeholder, title)', () => {
    // Компоненти й сторінки покупця; адмінка українською і поки без каталогу
    const shop = sources.filter((s) => s.path.includes('(shop)') || /app[\\/]login[\\/]/.test(s.path) || /components[\\/](Nav|SearchField|FilterChips|ProductCard|ProductGrid|ChainPriceRow|AuthForm|BarcodeScanner|PushPrompt|PushControls)\.tsx$/.test(s.path));
    const found = shop.flatMap(({ path, text }) =>
      [
        ...text.matchAll(/>\s*([A-Za-z][A-Za-z ,.'’!?…-]{2,})\s*</g),
        ...text.matchAll(/\b(?:aria-label|placeholder|title)="([^"]*[A-Za-z][^"]*)"/g),
      ].map((m) => `${path.slice(SRC.length)}: ${m[1]}`),
    );
    expect(found.filter((f) => !/: OnniMart$/.test(f))).toEqual([]);
  });
});
