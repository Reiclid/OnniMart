/** Порівняння двох назв для модератора: які слова є в обох, а яких немає в іншій назві */

const WORD = /[\p{L}\p{N}]+(?:['’ʼ]\p{L}+)*(?:[.,]\p{N}+)?/gu;
const fold = (s: string) => s.toLocaleLowerCase('uk').replace(/ё/g, 'е').replace(/[’'ʼ]/g, '');

export interface Token {
  text: string;
  /** Слово є й в іншій назві */
  shared: boolean;
}

/** Розбиття `text` на слова й проміжки; слово shared, якщо воно є в `other` (без регістру) */
export function compareWords(text: string, other: string): Token[] {
  const others = new Set([...fold(other).matchAll(WORD)].map((m) => m[0]));
  const out: Token[] = [];
  let at = 0;
  for (const m of text.matchAll(WORD)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index), shared: true });
    out.push({ text: m[0], shared: others.has(fold(m[0])) });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), shared: true });
  return out;
}

/** Однакові значення без регістру й пробілів; невідоме з будь-якого боку — null («не знаємо») */
export function sameValue(a: string | null | undefined, b: string | null | undefined): boolean | null {
  if (!a || !b) return null;
  const norm = (s: string) => fold(s).replace(/\s+/g, '').replace(',', '.');
  return norm(a) === norm(b);
}
