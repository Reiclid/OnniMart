import { contrast, hexToOklch, oklchCss, oklchToHex } from './color';
import { colors, primitives } from './tokens';

const css = (name: string) => primitives[colors[name]!.value];

describe('oklch', () => {
  it('кожен примітив переходить в oklch() і назад без втрат', () => {
    for (const hex of Object.values(primitives)) {
      const [, l, c, h] = /oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\)/.exec(oklchCss(hex))!.map(Number);
      expect(oklchToHex({ l: l! / 100, c: c!, h: h! })).toBe(hex);
    }
  });

  it('відомі значення: білий, чорний, синій бренду', () => {
    expect(hexToOklch('#ffffff').l).toBeCloseTo(1, 4);
    expect(hexToOklch('#000000').l).toBeCloseTo(0, 4);
    expect(oklchCss('#0c71c6')).toMatch(/^oklch\(5\d\.\d+% 0\.1\d+ 25\d\.\d+\)$/);
  });
});

/** Пари «текст на фоні», які є в інтерфейсі; WCAG AA для звичайного тексту — 4.5 */
const TEXT_PAIRS: [string, string][] = [
  ['fg', 'page'],
  ['fg', 'surface'],
  ['fg', 'selected'],
  ['fg-muted', 'surface'],
  ['fg-muted', 'page'],
  ['brand', 'surface'],
  ['brand', 'selected'],
  ['surface', 'brand'], // текст на синій кнопці й блоці ціни
  ['danger', 'surface'],
  ['surface', 'danger'], // бейдж знижки
];

describe('контраст WCAG AA', () => {
  it('формула: чорний на білому — 21', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  it.each(TEXT_PAIRS)('%s на %s ≥ 4.5', (text, bg) => {
    expect(contrast(css(text), css(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it('іконки (не текст) ≥ 3', () => {
    for (const icon of ['icon', 'icon-muted']) expect(contrast(css(icon), css('surface'))).toBeGreaterThanOrEqual(3);
  });

  // shortcut: accent (рамка фокусу й вибраного) на білому — 2.8 < 3 (WCAG 1.4.11). Колір із
  // Figma; змінювати лише через Figma — AUDIT BUG-W02. Тест фіксує поточне значення.
  it('accent на surface — відома проблема BUG-W02', () => {
    expect(contrast(css('accent'), css('surface'))).toBeLessThan(3);
  });
});
