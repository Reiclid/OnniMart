import type { ListingInput } from './catalog-index';
import { extractFeatures } from './features';
import { parseQuantity } from './normalization/quantity';
import { tokenize } from './normalization/text';
import { OffIndex, splitCompounds, type OffProduct } from './off-match';
import { buildIdf } from './similarity';

const idf = buildIdf([]);

function listing(
  name: string,
  brand: string | null,
  country = 'DE',
): ListingInput {
  const q = parseQuantity(name);
  return {
    id: name,
    chainId: 'aldi-sued',
    country,
    barcodes: [],
    quantity: {
      measure: q?.measure ?? null,
      netQuantity: q?.netQuantity ?? null,
      packCount: q?.packCount ?? 1,
      isWeighted: q?.isWeighted ?? false,
    },
    features: extractFeatures(name, brand),
  };
}

function off(
  gtin: string,
  name: string,
  brands: string[],
  quantity: string,
  country = 'DE',
): OffProduct {
  return { gtin, country, name, brands, quantity: parseQuantity(quantity) };
}

describe('OffIndex', () => {
  it('однозначний збіг — GTIN, навіть коли перший бренд OFF помилковий', () => {
    const index = new OffIndex();
    index.add(
      off(
        '00000042141204',
        'Mineralwasser Medium',
        ['Milbona', 'Quellbrunn'],
        '1,5 l',
      ),
    );
    index.add(off('04005906003557', 'Apfelschorle', ['Lichtenauer'], '1,5 l'));
    expect(
      index.decide(
        listing('Quellbrunn Mineralwasser Medium 1,5 l', 'Quellbrunn'),
        idf,
      ),
    ).toEqual({ kind: 'match', gtins: ['00000042141204'], score: 1 });
  });

  it('інше фасування, інша країна, невідоме фасування чи бренд — ні', () => {
    const index = new OffIndex();
    index.add(
      off('00000042141204', 'Mineralwasser Medium', ['Quellbrunn'], '1,5 l'),
    );
    const decide = (name: string, country?: string) =>
      index.decide(listing(name, 'Quellbrunn', country), idf).kind;
    expect(decide('Quellbrunn Mineralwasser Medium 0,5 l')).toBe('none');
    expect(decide('Quellbrunn Mineralwasser Medium 1,5 l', 'AT')).toBe('none');
    expect(decide('Quellbrunn Mineralwasser Medium')).toBe('none');
    expect(
      index.decide(listing('Mineralwasser Medium 1,5 l', null), idf).kind,
    ).toBe('none');
    expect(index.add(off('2', 'Grüne Oliven', [], '200 g'))).toBe(false);
    expect(index.add(off('1', 'Mineralwasser', ['Quellbrunn'], ''))).toBe(
      false,
    );
  });

  it('дублікати OFF (стара й нова упаковка) — один товар, обидва GTIN', () => {
    const index = new OffIndex();
    index.add(
      off('00000042141204', 'Mineralwasser Medium', ['Quellbrunn'], '1,5 l'),
    );
    index.add(
      off('00000042299998', 'Mineralwasser Medium', ['Quellbrunn'], '1,5 l'),
    );
    expect(
      index.decide(
        listing('Quellbrunn Mineralwasser Medium 1,5 l', 'Quellbrunn'),
        idf,
      ),
    ).toEqual({
      kind: 'match',
      gtins: ['00000042141204', '00000042299998'],
      score: 1,
    });
  });

  it('дублікатами вважаються лише однакові товари: «Cola» не отримує GTIN «Cola Zero»', () => {
    const index = new OffIndex();
    index.add(off('04000000000001', 'Cola', ['Jeden Tag'], '1,5 l'));
    index.add(off('04000000000002', 'Cola Zero', ['Jeden Tag'], '1,5 l'));
    expect(
      index.decide(listing('Jeden Tag Cola 1,5 l', 'Jeden Tag'), idf),
    ).toEqual({ kind: 'match', gtins: ['04000000000001'], score: 1 });
  });

  it('різні ознаки різновиду (Medium і Still) не зіставляються', () => {
    const index = new OffIndex();
    index.add(
      off('00000042141204', 'Mineralwasser Medium', ['Quellbrunn'], '1,5 l'),
    );
    expect(
      index.decide(
        listing('Quellbrunn Mineralwasser Still 1,5 l', 'Quellbrunn'),
        idf,
      ).kind,
    ).not.toBe('match');
  });
});

describe('OffIndex: дублікати й ознаки (PRD-27, ітерація 2)', () => {
  it('дублікат з іншою назвою, який рушій звів би в одне фасування, — теж GTIN товару', () => {
    const index = new OffIndex();
    index.add(
      off(
        '04820000000011',
        'Молоко 2,5% ультрапастеризоване',
        ['Селянське'],
        '900 г',
        'UA',
      ),
    );
    index.add(
      off(
        '04820000000028',
        'Молоко 2,5% жиру, ультрапастеризоване',
        ['Селянське'],
        '900 г',
        'UA',
      ),
    );
    const decision = index.decide(
      listing(
        'Молоко Селянське ультрапастеризоване 2.5% 900г',
        'Селянське',
        'UA',
      ),
      idf,
    );
    expect(decision.kind).toBe('match');
    expect(decision.kind === 'match' && decision.gtins.sort()).toEqual([
      '04820000000011',
      '04820000000028',
    ]);
  });

  it('памʼятає фото товару OFF для модератора', () => {
    const index = new OffIndex();
    index.add({
      ...off('04000000000004', 'Klarspüler', ['Somat'], '750 ml'),
      imageUrl: 'https://images.openfoodfacts.org/images/products/x.200.jpg',
    });
    expect(index.imageOf('04000000000004')).toBe(
      'https://images.openfoodfacts.org/images/products/x.200.jpg',
    );
    expect(index.imageOf('0')).toBeNull();
  });

  it('товар OFF з двома країнами — кандидат в обох, hasIn лише там, де він продається', () => {
    const index = new OffIndex();
    const product = off(
      '04820000000035',
      'Вафлі Артек смак шоколаду',
      ['Світоч'],
      '80 г',
    );
    expect(index.add({ ...product, country: 'DE' })).toBe(true);
    expect(index.add({ ...product, country: 'UA' })).toBe(true);
    expect(index.add({ ...product, country: 'UA' })).toBe(false);
    expect(index.size).toBe(1);
    const decide = (country: string) =>
      index.decide(
        listing('Вафлі СВІТОЧ Артек смак шоколаду 80г', 'Світоч', country),
        idf,
      );
    expect(decide('UA')).toEqual({
      kind: 'match',
      gtins: ['04820000000035'],
      score: 1,
    });
    expect(decide('DE').kind).toBe('match');
    expect(index.hasIn('UA', '04820000000035')).toBe(true);
    expect(index.hasIn('AT', '04820000000035')).toBe(false);
    expect(index.has('04820000000035')).toBe(true);
  });

  it('газованість названа лише з одного боку — не збіг', () => {
    const index = new OffIndex();
    index.add(
      off(
        '04000000000003',
        'Aquintus Mineralwasser classic',
        ['Aquintus'],
        '1 l',
      ),
    );
    expect(
      index.decide(
        listing('Aquintus Mineralwasser Medium 1 l', 'Aquintus'),
        idf,
      ).kind,
    ).toBe('none');
  });
});

describe('OffIndex: складені слова (PRD-27, ітерація 3)', () => {
  it('«Langkorn-Reis» у картці — той самий товар, що «Langkornreis» в OFF', () => {
    const index = new OffIndex();
    index.add(off('04006237010041', 'Langkornreis', ['Wurzener'], '500 g'));
    index.add(
      off(
        '04006237010058',
        'Paraboild Reis Spitzenlangkornreis',
        ['Wurzener'],
        '500 g',
      ),
    );
    // Слова карток: «Langkorn» у словнику є лише з картки, у OFF — «Langkornreis»
    index.addWords('DE', [['langkorn', 'reis']]);
    expect(
      index.decide(listing('Langkorn-Reis 500 g', 'Wurzener'), idf),
    ).toEqual({ kind: 'match', gtins: ['04006237010041'], score: 1 });
  });

  it('поділ з боку картки: «Reine Butter Milch» в OFF = картка «Reine Buttermilch»', () => {
    const index = new OffIndex();
    index.add(off('04025500181401', 'Reine Butter Milch', ['Müller'], '500 g'));
    // Слова карток (prepareListings().vocabulary) — разом зі словами OFF
    index.addWords('DE', [['reine', 'buttermilch']]);
    expect(
      index.decide(listing('Reine Buttermilch 500 g', 'Müller'), idf),
    ).toEqual({ kind: 'match', gtins: ['04025500181401'], score: 1 });
  });

  it('словник поповнюють і слова карток: «Wildfond» з іншої мережі ділиться на «Wild-Fond» з OFF', () => {
    const index = new OffIndex();
    index.add(off('04009337000019', 'Wild-Fond', ['Lacroix'], '400 ml'));
    index.addWords('DE', [['wildfond']]);
    expect(index.decide(listing('Wildfond 400 ml', 'Lacroix'), idf)).toEqual({
      kind: 'match',
      gtins: ['04009337000019'],
      score: 1,
    });
    expect(index.vocabulary.get('DE')).toEqual([
      ['wild', 'fond'],
      ['wild', 'fond'],
    ]);
  });

  it('складене слово ділиться, лише якщо обидві частини є окремими словами словника', () => {
    const norms = (name: string, lexicon: string[]) =>
      splitCompounds(tokenize(name), new Set(lexicon)).map((t) => t.norm);
    // Обидві частини в словнику: «Langkornreis» і «Langkorn-Reis» стають однаковими
    expect(norms('Langkornreis', ['langkorn', 'reis'])).toEqual([
      'langkorn',
      'reis',
    ]);
    // Однієї частини немає в словнику — слово лишається цілим
    expect(norms('Biomilch', ['milch'])).toEqual(['biomilch']);
    // Частина коротша за 4 літери не відділяється
    expect(norms('Einudeln', ['nudeln'])).toEqual(['einudeln']);
    expect(norms('Erdbeere', ['erd', 'beere'])).toEqual(['erdbeere']);
  });

  it('слово, додане після запиту, змінює рішення; словники країн окремі', () => {
    const index = new OffIndex();
    index.add(off('04006237010041', 'Langkornreis', ['Wurzener'], '500 g'));
    const card = listing('Langkorn-Reis 500 g', 'Wurzener');
    expect(index.decide(card, idf).kind).toBe('none');
    // Лексикон іншої країни слово не ділить
    index.addWords('UA', [['langkorn', 'reis']]);
    expect(index.decide(card, idf).kind).toBe('none');
    index.addWords('DE', [['langkorn', 'reis']]);
    expect(index.decide(card, idf).kind).toBe('match');
  });

  it('різні товари зі спільною складовою не стають збігом', () => {
    const index = new OffIndex();
    index.add(off('04000000000011', 'Pennenudeln', ['Barilla'], '500 g'));
    index.addWords('DE', [['spaghettinudeln'], ['nudeln']]);
    expect(
      index.decide(listing('Spaghettinudeln 500 g', 'Barilla'), idf).kind,
    ).not.toBe('match');
  });
});
