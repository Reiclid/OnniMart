/**
 * Токени дизайн-системи — одне джерело значень для коду й Figma.
 * Структура та сама, що в змінних Figma (OnniMart — UI): Primitives → Color → Dimension,
 * текстові стилі й Elevation. Правила використання — docs/06-design-system.md.
 *
 * Змінили значення → `bun run tokens` (переписує блок @theme у globals.css) → те саме
 * значення у Figma. tokens.spec.ts падає, якщо globals.css розійшовся з цим файлом.
 */

/** Primitives: сирі кольори палітри; в інтерфейсі напряму не використовуються */
export const primitives = {
  white: '#ffffff',
  'blue/50': '#eaf5ff',
  'blue/100': '#cfe9ff',
  'blue/500': '#1a9fff',
  'blue/700': '#0c71c6',
  'slate/50': '#f4f8fc',
  'slate/100': '#e3edf7',
  'slate/300': '#c9d6e2',
  'slate/500': '#5b82a6',
  'slate/600': '#4a6f91',
  'gray/700': '#313131',
  'gray/900': '#121212',
  'red/50': '#ffeceb',
  'red/600': '#e0262b',
} as const;

type Primitive = keyof typeof primitives;

/**
 * Семантичні кольори: ім'я в CSS (клас Tailwind: bg-<ім'я>, text-<ім'я>, border-<ім'я>) →
 * змінна Figma → примітив. Один CSS-колір може покривати кілька змінних Figma з тим самим
 * значенням (brand: bg/brand і text/brand) — вони перелічені в `figma`.
 */
export const colors: Record<string, { figma: string[]; value: Primitive }> = {
  page: { figma: ['color/bg/page', 'color/bg/subtle'], value: 'slate/50' },
  surface: { figma: ['color/bg/surface', 'color/text/on-brand'], value: 'white' },
  selected: { figma: ['color/bg/selected'], value: 'blue/50' },
  brand: { figma: ['color/bg/brand', 'color/text/brand'], value: 'blue/700' },
  accent: { figma: ['color/bg/accent', 'color/icon/brand', 'color/border/brand'], value: 'blue/500' },
  danger: { figma: ['color/bg/danger', 'color/text/danger'], value: 'red/600' },
  'danger-subtle': { figma: ['color/bg/danger-subtle'], value: 'red/50' },
  fg: { figma: ['color/text/primary', 'color/bg/inverse'], value: 'gray/900' },
  'fg-muted': { figma: ['color/text/secondary'], value: 'slate/600' },
  icon: { figma: ['color/icon/default'], value: 'gray/700' },
  'icon-muted': { figma: ['color/icon/muted'], value: 'slate/500' },
  line: { figma: ['color/border/default'], value: 'slate/100' },
  'line-strong': { figma: ['color/border/strong'], value: 'slate/300' },
};

/** Відступи (Figma space/N): крок 4 px = крок Tailwind (p-1 = 4 px, p-4 = 16 px) */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 } as const;

/** Радіуси (Figma radius/*); full — пігулки й круглі кнопки (rounded-full) */
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, full: 999 } as const;

/** Текстові стилі: ім'я в CSS (text-<ім'я>) → стиль Figma; товщину задає клас (font-semibold…) */
export const type: Record<string, { figma: string; size: number; lineHeight: number; weight: 400 | 500 | 600 | 700 }> = {
  'display-lg': { figma: 'Display/L', size: 36, lineHeight: 44, weight: 700 },
  display: { figma: 'Display/M', size: 28, lineHeight: 34, weight: 700 },
  title: { figma: 'Title/L', size: 22, lineHeight: 28, weight: 700 },
  'title-sm': { figma: 'Title/M', size: 17, lineHeight: 22, weight: 600 },
  body: { figma: 'Body/M', size: 15, lineHeight: 21, weight: 400 },
  'body-sm': { figma: 'Body/S', size: 13, lineHeight: 18, weight: 400 },
  caption: { figma: 'Caption', size: 11, lineHeight: 14, weight: 500 },
};

/** Тіні (Figma Elevation/*): лише для того, що плаває над контентом */
export const elevation: Record<string, { figma: string; css: string }> = {
  floating: { figma: 'Elevation/1 — floating', css: '0 4px 16px rgb(13 64 128 / 0.08)' },
  overlay: { figma: 'Elevation/2 — overlay', css: '0 8px 32px rgb(13 64 128 / 0.16)' },
};

/** Блок @theme для globals.css: класи Tailwind з цих токенів */
export function themeCss(): string {
  const lines = ['  --font-sans: var(--font-inter), Arial, Helvetica, sans-serif;', ''];
  for (const [name, c] of Object.entries(colors)) {
    lines.push(`  --color-${name}: ${primitives[c.value]}; /* ${c.figma.join(', ')} */`);
  }
  lines.push('');
  for (const [name, px] of Object.entries(radius)) if (name !== 'full') lines.push(`  --radius-${name}: ${px}px;`);
  lines.push('');
  for (const [name, e] of Object.entries(elevation)) lines.push(`  --shadow-${name}: ${e.css}; /* ${e.figma} */`);
  lines.push('');
  for (const [name, t] of Object.entries(type)) {
    lines.push(`  --text-${name}: ${t.size}px; /* ${t.figma} */`, `  --text-${name}--line-height: ${t.lineHeight}px;`);
  }
  return `@theme {\n${lines.join('\n')}\n}`;
}
