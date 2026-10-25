import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { colors, primitives, themeCss } from './tokens';

// Кінці рядків — як видав git (CRLF на Windows): порівнюємо без них
const css = readFileSync(join(import.meta.dir, '../app/globals.css'), 'utf8').replace(/\r\n/g, '\n');

describe('tokens', () => {
  it('globals.css містить блок @theme, згенерований з tokens.ts (bun run tokens)', () => {
    expect(css).toContain(themeCss());
  });

  it('кожна змінна Figma описана один раз, кожен примітив існує', () => {
    const figma = Object.values(colors).flatMap((c) => c.figma);
    expect(new Set(figma).size).toBe(figma.length);
    for (const c of Object.values(colors)) expect(primitives[c.value]).toMatch(/^#[0-9a-f]{6}$/);
  });
});
