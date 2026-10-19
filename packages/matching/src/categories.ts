import { fold, transliterate } from './normalization/text';

/**
 * Єдиний довідник категорій каталогу. Категорії мереж різні (українською, німецькою,
 * транслітом у slug, рекламні "Nächste Woche"), тож зводимо їх правилами до цього списку.
 */
export const CATEGORIES = [
  { slug: 'dairy-eggs', name: 'Dairy & eggs' },
  { slug: 'meat', name: 'Meat & sausages' },
  { slug: 'fish', name: 'Fish & seafood' },
  { slug: 'fruit-veg', name: 'Fruit & vegetables' },
  { slug: 'bakery', name: 'Bakery' },
  { slug: 'pantry', name: 'Pantry' },
  { slug: 'frozen', name: 'Frozen' },
  { slug: 'ready-meals', name: 'Ready meals' },
  { slug: 'sweets-snacks', name: 'Sweets & snacks' },
  { slug: 'drinks', name: 'Drinks' },
  { slug: 'coffee-tea', name: 'Coffee & tea' },
  { slug: 'alcohol', name: 'Alcohol' },
  { slug: 'baby', name: 'Baby' },
  { slug: 'pets', name: 'Pets' },
  { slug: 'household', name: 'Household' },
  { slug: 'beauty', name: 'Health & beauty' },
  { slug: 'other', name: 'Other' },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]['slug'];

/**
 * Правила по латинізованому тексту (fold + транслітерація), перше збігле перемагає.
 * Порядок важливий: "безалкогольні напої" — не алкоголь, "чай, кава, гарячі напої" —
 * не просто напої, "молочний шоколад" — солодощі.
 */
const RULES: [CategorySlug, RegExp][] = [
  ['drinks', /bezalko|alkoholfrei/],
  ['alcohol', /alko[hg]ol|spiritu|wein|\bwine|\bbier|pyvo|vyno|horilk|vodk|kon[iy]ak|likor|likoer|whisk|viski|\brum\b|\bgin\b|\bsekt|prosecco|shampan/],
  ['coffee-tea', /\bkav[ay]?\b|kava-|kaffee|coffee|\bchai\b|chai-|\btee\b|\btea\b|kakao|cappuccino|hariach/],
  ['baby', /\bdit|\bdyt|\bbaby|kinder|pidhuz|pelyuk/],
  ['pets', /tvaryn|\btier|\bpets?\b|korm\b|korm-|kotiv|sobak/],
  ['frozen', /zamoroz|tiefkuh|tiefkueh|frozen|morozyv/],
  ['fish', /meeresfr|\bryb|fisch|\bfish|moreprod|krevet|losos|oseledets|tunets|\bikra/],
  ['meat', /rind|beef|schinken|salami|hackfleisch|m-?iaso|fleisch|\bmeat|geflugel|gefluegel|wurst|kovbas|sosysk|kuriach|\bkurk|svyn|ialovych|indych|farsh|shynk|bekon|delikates/],
  ['sweets-snacks', /salzstang|riegel|solodoshch|sweet|sussw|suess|konditer|shokolad|schoko|chocol|tsukerk|pechyv|\bkeks|vafl|snek|snack|chyps|chips|salzgeback|salzgebaeck|pralin/],
  ['dairy-eggs', /moloch|molok|milch|\bmilk|kefir|joghurt|iohurt|yogurt|\bsyr(?!op)|kase|kaese|quark|tvoroh|smetan|vershk|\bbutter|molkerei|iaits|\beier\b|\beggs?\b/],
  ['fruit-veg', /frukt|ovoch|\bobst|gemus|gemues|horikh|\bnuss|nuess|trockenfr|iabluk|banan|kartopl|tomat/],
  ['bakery', /khlib|\bbrot|bread|vypich|backwaren|bulk|baton|toast|lavash|pekarn/],
  ['ready-meals', /fertig|mikrowell|salat|sandwich|kulinar|gotovi|\bstrav|pizza|sendvich/],
  ['pantry', /oele?|oel|essig|porridge|haferflock|bakali|grundnahrung|kharchuv|\bkrup|makaron|nudel|\bpasta|boroshn|\bmehl|tsukor|zucker|oliia|sous|sauce|soss|spets|gewurz|gewuerz|kon[st]erv|dosen|backzutat|cereal|musli|muesli|kasha|\bris\b/],
  ['drinks', /napo|napii|getrank|getraenk|\bvoda\b|\bvod[iy]\b|wasser|water|\bsik\b|\bsoky|saft|saefte|nektar|lymonad|limonad|\bcola|\bkola|energet/],
  ['household', /spuel|spul|toiletten|kuchenroll|kuechenroll|wasch|pobutov|khimi|dlia domu|dlia-domu|\bhaus|haushalt|reinig|prann|myiuch/],
  ['beauty', /pflege|shampoo|deo|hihiien|gigiien|dohliad|kosmet|drogerie|krasa|aptech|zdorov|shampun|zubn|\bbady/],
  ['other', /guthaben|streaming|gaming|einrichtung|wohnen|leucht|beleucht|slips?|odiah|vzutt|kleidung|kantsel|schreib|hobi|hobby|tekhnik|elektro|\bsad\b|garten|interier|tekstyl|textil|kukhn|tsyhar|sygaret|stik|sport|heimwerk|werkstatt|kvity/],
];

/** Категорія за довільним текстом (категорія мережі або назва товару); null — не впізнали */
export function categoryOf(text: string | null | undefined): CategorySlug | null {
  if (!text) return null;
  const latin = transliterate(fold(text)).replace(/[_,.;/&]+/g, ' ');
  return RULES.find(([, rule]) => rule.test(latin))?.[0] ?? null;
}

/**
 * Категорія товару — найчастіша серед його карток. Для кожної картки спершу категорія мережі,
 * а якщо вона рекламна ("Rabatt-Monat") чи невідома — назва.
 */
export function productCategory(
  listings: { rawCategory: string | null; rawName: string }[],
): CategorySlug | null {
  const votes = new Map<CategorySlug, number>();
  for (const l of listings) {
    const slug = categoryOf(l.rawCategory) ?? categoryOf(l.rawName);
    if (slug) votes.set(slug, (votes.get(slug) ?? 0) + 1);
  }
  let best: CategorySlug | null = null;
  for (const [slug, count] of votes) if (!best || count > votes.get(best)!) best = slug;
  return best;
}
