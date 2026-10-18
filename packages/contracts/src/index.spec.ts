import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRunEvent, parseScraperMessage } from './index';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8');

describe('parseScraperMessage', () => {
  it.each(['product.json', 'product-minimal.json', 'run-finished.json'])(
    'приймає зразок парсера %s',
    (name) => {
      expect(parseScraperMessage(fixture(name)).ok).toBe(true);
    },
  );

  it('розрізняє подію запуску і товар', () => {
    const event = parseScraperMessage(fixture('run-finished.json'));
    const product = parseScraperMessage(fixture('product.json'));
    expect(event.ok && isRunEvent(event.message)).toBe(true);
    expect(product.ok && isRunEvent(product.message)).toBe(false);
  });

  it.each([
    ['не JSON', '{'],
    ['масив', '[]'],
    ['ціна 0', '{"store":"a","external":"1","name":"x","price":0,"scraper_at":"t"}'],
    ['ціна рядком', '{"store":"a","external":"1","name":"x","price":"5","scraper_at":"t"}'],
    ['порожній external', '{"store":"a","external":" ","name":"x","price":5,"scraper_at":"t"}'],
    ['штрихкоди не рядки', '{"store":"a","external":"1","name":"x","price":5,"scraper_at":"t","barcodes":[1]}'],
    ['невідомий kind', '{"kind":"run_paused","store":"a","pages_fetched":0,"items_seen":0,"at":"t"}'],
    ['відʼємний лічильник', '{"kind":"run_finished","store":"a","pages_fetched":-1,"items_seen":0,"at":"t"}'],
  ])('відкидає: %s', (_case, raw) => {
    expect(parseScraperMessage(raw).ok).toBe(false);
  });
});
