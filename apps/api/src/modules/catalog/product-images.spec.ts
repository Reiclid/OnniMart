import { IMAGES_LIMIT, productImages } from './product-images';

describe('productImages', () => {
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

  it(`не більше ${IMAGES_LIMIT}`, () => {
    const listings = Array.from({ length: 20 }, (_, i) => ({
      imageUrl: `https://img/${i}.jpg`,
    }));
    expect(
      productImages({
        imageUrl: null,
        variants: [{ imageUrl: null, listings }],
      }),
    ).toHaveLength(IMAGES_LIMIT);
  });
});
