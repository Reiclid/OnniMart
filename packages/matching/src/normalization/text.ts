/**
 * Базова нормалізація тексту для зіставлення назв українською, німецькою та англійською.
 */

/** Латинські літери, що виглядають як кириличні: "дiтей" з латинською i */
const HOMOGLYPHS: Record<string, string> = {
  a: 'а',
  c: 'с',
  e: 'е',
  i: 'і',
  o: 'о',
  p: 'р',
  x: 'х',
  y: 'у',
};

const CYRILLIC = /\p{Script=Cyrillic}/u;
const LATIN = /\p{Script=Latin}/u;

/**
 * Нижній регістр, ß → ss, без діакритики (ä → a, é → e, ї → і, й → и) і апострофів.
 * Застосовується однаково до обох порівнюваних назв, тож втрата "й" нічого не ламає.
 */
export function fold(text: string): string {
  // Апострофи — до NFKD: він розкладає ´ (ALDI SÜD: «JACK´S FARM») на пробіл + наголос,
  // і після цього «jack´s» ставало двома словами «jack s»
  return text
    .replace(/['’ʼ`´‘]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '');
}

/** Виправляє латинські літери всередині кириличного слова */
export function fixHomoglyphs(word: string): string {
  if (!CYRILLIC.test(word) || !LATIN.test(word)) return word;
  return [...word].map((ch) => HOMOGLYPHS[ch] ?? ch).join('');
}

export interface Token {
  /** Нормалізоване слово для порівняння */
  norm: string;
  /** Слово як у назві — для підписів в інтерфейсі */
  surface: string;
}

/**
 * Розбиває назву на слова. Десятковий дріб і відсоток лишаються одним токеном:
 * "Молоко 2,5% ультрапастеризоване" → молоко, 2.5%, ультрапастеризоване
 */
export function tokenize(text: string): Token[] {
  const words = text
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/(\d)\s+%/g, '$1%')
    .match(/[\p{L}\p{N}]+(?:[.][\p{N}]+)?%?/gu);
  return (words ?? []).map((surface) => ({
    surface,
    norm: fixHomoglyphs(fold(surface)),
  }));
}

const TRANSLIT: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'h',
  ґ: 'g',
  д: 'd',
  е: 'e',
  є: 'ie',
  ж: 'zh',
  з: 'z',
  и: 'y',
  і: 'i',
  ї: 'i',
  й: 'i',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ь: '',
  ю: 'iu',
  я: 'ia',
  ё: 'e',
  ы: 'y',
  э: 'e',
  ъ: '',
};

/** Транслітерація кирилиці (для ключів брендів і slug): "Моршинська" → "morshynska" */
export function transliterate(text: string): string {
  return [...text].map((ch) => TRANSLIT[ch] ?? ch).join('');
}

/** "Coca-Cola Zero 0,5 л" → "coca-cola-zero-0-5-l" */
export function slugify(text: string): string {
  return transliterate(fold(text))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
