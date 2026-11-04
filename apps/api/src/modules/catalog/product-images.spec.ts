import {
  CARD_IMAGES_LIMIT,
  dHash,
  distinctImages,
  hammingDistance,
  IMAGES_LIMIT,
  imageKey,
  productImageUrls,
  variantImageUrls,
} from './product-images';

const productImages = (product: Parameters<typeof productImageUrls>[0]) =>
  distinctImages(productImageUrls(product));

describe('фото товару', () => {
  it('фото товару першим, далі фасувань, без повторів', () => {
    expect(
      productImages({
        imageUrl: 'https://img/b.jpg',
        variants: [
          {
            imageUrl: 'https://img/a.jpg',
            listings: [
              { imageUrl: 'https://img/a.jpg' },
              { imageUrl: null },
              { imageUrl: 'https://img/c.jpg' },
            ],
          },
          { imageUrl: null, listings: [{ imageUrl: 'https://img/b.jpg' }] },
        ],
      }),
    ).toEqual(['https://img/b.jpg', 'https://img/a.jpg', 'https://img/c.jpg']);
  });

  it(`не більше ${IMAGES_LIMIT}, у картці списку — ${CARD_IMAGES_LIMIT}`, () => {
    const listings = Array.from({ length: 20 }, (_, i) => ({
      imageUrl: `https://img/${i}.jpg`,
    }));
    const product = {
      imageUrl: null,
      variants: [{ imageUrl: null, listings }],
    };
    expect(productImages(product)).toHaveLength(IMAGES_LIMIT);
    expect(
      distinctImages(productImageUrls(product), undefined, CARD_IMAGES_LIMIT),
    ).toHaveLength(CARD_IMAGES_LIMIT);
  });

  it('домени-дзеркала zakaz.ua дають одне фото', () => {
    const path = 'c860e95160594613bc91a7369bfaf9d0/1722925155-s350x350.jpg';
    expect(imageKey(`https://img2.zakaz.ua/${path}`)).toBe(
      imageKey(`https://img3.zakaz.ua/${path}`),
    );
    expect(
      distinctImages([
        `https://img2.zakaz.ua/${path}`,
        `https://img3.zakaz.ua/${path}`,
      ]),
    ).toEqual([`https://img2.zakaz.ua/${path}`]);
  });

  it('фото фасування: спершу основне, далі з карток', () => {
    expect(
      distinctImages(
        variantImageUrls({
          imageUrl: 'https://img/v.jpg',
          listings: [
            { imageUrl: 'https://img/l.jpg' },
            { imageUrl: 'https://img/v.jpg' },
          ],
        }),
      ),
    ).toEqual(['https://img/v.jpg', 'https://img/l.jpg']);
  });

  it('однакові за вмістом фото з різними адресами згортаються, різні лишаються', () => {
    const hashes = new Map([
      ['https://a/1.jpg', 'ffffffffffffffff'],
      ['https://b/1.jpg', 'ffffffffffffffc0'], // 6 бітів різниці — те саме фото
      ['https://c/1.jpg', 'ffffffffffffff80'], // 7 бітів — інше
    ]);
    expect(
      distinctImages([...hashes.keys(), 'https://d/без-хешу.jpg'], hashes),
    ).toEqual(['https://a/1.jpg', 'https://c/1.jpg', 'https://d/без-хешу.jpg']);
  });
});

describe('dHash', () => {
  const gradient = Array.from({ length: 72 }, (_, i) => (i % 9) * 10);

  it('рахує різницю сусідніх пікселів', () => {
    expect(dHash(gradient)).toBe('0000000000000000');
    expect(dHash([...gradient].reverse())).toBe('ffffffffffffffff');
  });

  it('не залежить від загальної яскравості', () => {
    expect(dHash(gradient.map((v) => v + 100))).toBe(dHash(gradient));
  });

  it('відкидає неправильну сітку', () => {
    expect(() => dHash([1, 2, 3])).toThrow();
  });

  it('hammingDistance рахує різні біти', () => {
    expect(hammingDistance('ff', 'ff')).toBe(0);
    expect(hammingDistance('ffffffffffffffff', '0000000000000000')).toBe(64);
    expect(hammingDistance('0f', 'f0')).toBe(8);
  });
});
