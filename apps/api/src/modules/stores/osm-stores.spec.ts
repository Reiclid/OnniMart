import {
  brandIndex,
  centerOf,
  chainOf,
  normalizeBrand,
  toStore,
  type ChainRef,
  type OsmFeature,
} from './osm-stores';

const CHAINS: ChainRef[] = [
  { id: 'aldi-sued', name: 'ALDI SÜD', countryCode: 'DE' },
  { id: 'lidl-de', name: 'Lidl', countryCode: 'DE' },
  { id: 'lidl-pl', name: 'Lidl', countryCode: 'PL' },
  {
    id: 'eko',
    name: 'ЕКО маркет',
    countryCode: 'UA',
    osmBrands: ['Eko Market'],
  },
  { id: 'silpo', name: 'Сільпо', countryCode: 'UA' },
];
const index = brandIndex(CHAINS);

describe('normalizeBrand', () => {
  it('без регістру, діакритики й розділових', () => {
    expect(normalizeBrand('ALDI SÜD')).toBe('aldisud');
    expect(normalizeBrand('Aldi Süd')).toBe(normalizeBrand('ALDI SUD'));
    expect(normalizeBrand('ЕКО маркет')).toBe('екомаркет');
    expect(normalizeBrand('Сільпо')).toBe('сільпо');
  });
});

describe('chainOf', () => {
  it('за brand, потім name; псевдоніми з реєстру', () => {
    expect(
      chainOf({ brand: 'Aldi Süd', name: 'ALDI' }, index, ['DE'])?.id,
    ).toBe('aldi-sued');
    expect(chainOf({ name: 'Сільпо' }, index, ['UA'])?.id).toBe('silpo');
    expect(chainOf({ brand: 'Eko Market' }, index, ['UA'])?.id).toBe('eko');
    expect(chainOf({ brand: 'Denner' }, index, ['DE'])).toBeNull();
  });

  it('однакова назва в різних країнах — за країною магазину або вивантаження', () => {
    expect(chainOf({ brand: 'Lidl' }, index, ['PL'])?.id).toBe('lidl-pl');
    expect(
      chainOf({ brand: 'Lidl', 'addr:country': 'de' }, index, ['PL', 'DE'])?.id,
    ).toBe('lidl-de');
    // Мережі іншої країни не беремо
    expect(chainOf({ brand: 'Сільпо' }, index, ['DE'])).toBeNull();
  });
});

describe('centerOf / toStore', () => {
  it('середина контуру будівлі', () => {
    const square = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
        ],
      ],
    };
    expect(centerOf(square)).toEqual([1, 1]);
  });

  it('адреса, місто, ключ osm:<тип>/<id>, координати до 6 знаків', () => {
    const feature: OsmFeature = {
      geometry: { type: 'Point', coordinates: [6.433741234, 49.814361234] },
      properties: {
        '@type': 'node',
        '@id': 761534771,
        brand: 'ALDI SÜD',
        'addr:street': 'Bitburger Straße',
        'addr:housenumber': '1A',
        'addr:postcode': '54668',
        'addr:city': 'Echternacherbrück',
      },
    };
    expect(toStore(feature, CHAINS[0])).toEqual({
      chainId: 'aldi-sued',
      externalId: 'osm:node/761534771',
      name: 'ALDI SÜD',
      city: 'Echternacherbrück',
      address: 'Bitburger Straße 1A, 54668',
      latitude: 49.814361,
      longitude: 6.433741,
    });
  });
});
