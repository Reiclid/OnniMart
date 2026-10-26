import { BadRequestException } from '@nestjs/common';
import {
  ProductsQueryDto,
  UpdateProductDto,
} from './modules/catalog/dto/catalog.dto';
import { ListingsQueryDto } from './modules/monitoring/dto/monitoring.dto';
import { TriggerScraperDto } from './modules/scraper/dto/trigger-scraper.dto';
import { createValidationPipe } from './validation';

const pipe = createValidationPipe();
const body = (value: unknown) =>
  pipe.transform(value, { type: 'body', metatype: TriggerScraperDto });
const query = (value: unknown, metatype: new () => object) =>
  pipe.transform(value, { type: 'query', metatype });

describe('ValidationPipe', () => {
  it('пропускає коректний запуск парсингу', async () => {
    await expect(body({ store: 'silpo', maxPages: 2 })).resolves.toMatchObject({
      store: 'silpo',
      maxPages: 2,
    });
  });

  it.each([
    ['store не рядок', { store: { contains: '' } }],
    ['store з пробілами', { store: 'silpo ua' }],
    ['maxPages дробове', { store: 'silpo', maxPages: 1.5 }],
    ['maxPages завелике', { store: 'silpo', maxPages: 100000 }],
    ['невідоме поле', { store: 'silpo', admin: true }],
  ])('відхиляє тіло: %s → 400', async (_case, value) => {
    await expect(body(value)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('правка товару: усі поля, null очищує, невідоме поле — 400', async () => {
    const edit = (value: unknown) =>
      pipe.transform(value, { type: 'body', metatype: UpdateProductDto });
    const value = {
      name: 'Напій',
      brand: null,
      variantLabel: '',
      description: 'Опис',
      imageUrl: null,
      category: 'drinks',
    };
    await expect(edit(value)).resolves.toMatchObject(value);
    await expect(edit({ slug: 'x' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('перетворює числа з query-рядка', async () => {
    await expect(
      query(
        { page: '2', pageSize: '20', multiChain: 'true' },
        ProductsQueryDto,
      ),
    ).resolves.toMatchObject({ page: 2, pageSize: 20, multiChain: 'true' });
  });

  it.each([
    ['занадто довгий q', { q: 'x'.repeat(101) }],
    ['pageSize > 200', { pageSize: '500' }],
    ['page не число', { page: 'abc' }],
    ['promo не булеве', { promo: 'yes' }],
  ])('відхиляє query: %s → 400', async (_case, value) => {
    await expect(query(value, ListingsQueryDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
