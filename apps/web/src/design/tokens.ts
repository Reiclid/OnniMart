import { oklchCss } from './color';

/**
 * Токени дизайн-системи — одне джерело значень для коду й Figma.
 * Структура та сама, що в змінних Figma (OnniMart — UI): Primitives → Color → Dimension,
 * текстові стилі й Elevation. Правила використання — docs/06-design-system.md.
 *
 * Кольори зберігаються в hex (як у Figma), у CSS виходять в oklch() — color.ts.
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

/** Рух (docs/07-motion.md §3): тривалості твінів, мс */
export const durations = { instant: 90, fast: 150, base: 220, slow: 300, page: 340, ambient: 1600, shimmer: 1200 } as const;

/** Криві твінів (cubic-bezier) — ті самі в переходах прототипу Figma */
export const easings = {
  standard: [0.2, 0, 0, 1],
  enter: [0.05, 0.7, 0.1, 1],
  exit: [0.3, 0, 0.8, 0.15],
  ambient: [0.45, 0, 0.55, 1],
} as const;

/** Пружини: жорсткість / демпфування / маса (Figma Spring); у CSS — крива linear() і її тривалість */
export const springs = {
  pop: { stiffness: 500, damping: 20, mass: 1 },
  snappy: { stiffness: 600, damping: 40, mass: 1 },
  smooth: { stiffness: 380, damping: 38, mass: 1 },
  sheet: { stiffness: 300, damping: 34, mass: 1 },
  page: { stiffness: 260, damping: 33, mass: 1 },
} as const;

/**
 * Перехідна характеристика пружини з 0 до 1 (аналітичний розв'язок m·x'' + c·x' + k·(x − 1) = 0):
 * тривалість — доки відхилення не лишиться < 0,1 %, крива — точки кожні ~16 мс для linear().
 */
export function springCurve({ stiffness, damping, mass }: { stiffness: number; damping: number; mass: number }) {
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const x = (t: number) => {
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
    }
    if (zeta === 1) return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
    const r1 = -w0 * (zeta - Math.sqrt(zeta * zeta - 1));
    const r2 = -w0 * (zeta + Math.sqrt(zeta * zeta - 1));
    return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
  };
  // Останній момент, коли крива ще далі за 0,1 % від 1 (крок 1 мс, межа 2 с)
  let settle = 0;
  for (let ms = 0; ms <= 2000; ms++) if (Math.abs(1 - x(ms / 1000)) > 0.001) settle = ms + 1;
  const steps = Math.max(8, Math.round(settle / 16));
  const points = Array.from({ length: steps + 1 }, (_, i) => (i === steps ? 1 : Math.round(x((settle * i) / steps / 1000) * 1000) / 1000));
  return { ms: settle, css: `linear(${points.join(', ')})` };
}

/** Блок @theme для globals.css: класи Tailwind з цих токенів */
export function themeCss(): string {
  const lines = ['  --font-sans: var(--font-inter), Arial, Helvetica, sans-serif;', ''];
  for (const [name, c] of Object.entries(colors)) {
    const hex = primitives[c.value];
    lines.push(`  --color-${name}: ${oklchCss(hex)}; /* ${hex} · ${c.figma.join(', ')} */`);
  }
  lines.push('');
  for (const [name, px] of Object.entries(radius)) if (name !== 'full') lines.push(`  --radius-${name}: ${px}px;`);
  lines.push('');
  for (const [name, e] of Object.entries(elevation)) lines.push(`  --shadow-${name}: ${e.css}; /* ${e.figma} */`);
  lines.push('');
  for (const [name, t] of Object.entries(type)) {
    lines.push(`  --text-${name}: ${t.size}px; /* ${t.figma} */`, `  --text-${name}--line-height: ${t.lineHeight}px;`);
  }
  // Рух: ease-<ім'я> і duration-(--duration-<ім'я>); пружина — ease-spring-<ім'я> + duration-(--duration-spring-<ім'я>)
  lines.push('');
  for (const [name, ms] of Object.entries(durations)) lines.push(`  --duration-${name}: ${ms}ms;`);
  for (const [name, b] of Object.entries(easings)) lines.push(`  --ease-${name}: cubic-bezier(${b.join(', ')});`);
  for (const [name, spring] of Object.entries(springs)) {
    const { ms, css } = springCurve(spring);
    lines.push(`  --duration-spring-${name}: ${ms}ms; /* k ${spring.stiffness} · c ${spring.damping} · m ${spring.mass} */`, `  --ease-spring-${name}: ${css};`);
  }
  // static: змінні руху потрібні й тим правилам, що беруть їх через var(), а не класом
  return `@theme static {\n${lines.join('\n')}\n}`;
}
