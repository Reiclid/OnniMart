import {
  OFF_SLOT_KEY,
  offMissKey,
  OpenFoodFactsClient,
} from './open-food-facts.client';

/** Redis у памʼяті: лише те, що використовує клієнт (exists, set з NX) */
function memoryRedis() {
  const keys = new Map<string, string>();
  return {
    keys,
    exists: (key: string) => Promise.resolve(keys.has(key) ? 1 : 0),
    set: (key: string, value: string, ...args: unknown[]) => {
      if (args.includes('NX') && keys.has(key)) return Promise.resolve(null);
      keys.set(key, value);
      return Promise.resolve('OK');
    },
    disconnect: () => undefined,
  };
}

describe('OpenFoodFactsClient', () => {
  const realFetch = globalThis.fetch;
  let calls: number;
  let reply: () => Response;
  let redis: ReturnType<typeof memoryRedis>;
  let client: OpenFoodFactsClient;

  beforeEach(() => {
    calls = 0;
    globalThis.fetch = () => {
      calls++;
      return Promise.resolve(reply());
    };
    redis = memoryRedis();
    client = new OpenFoodFactsClient();
    Object.assign(client, { redis });
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('невідомий штрихкод питаємо в OFF лише раз — далі кеш промахів', async () => {
    reply = () => new Response('{"status":0}', { status: 404 });
    expect(await client.product('05449000000996')).toBeNull();
    redis.keys.delete(OFF_SLOT_KEY); // минула секунда
    expect(await client.product('05449000000996')).toBeNull();
    expect(calls).toBe(1);
    expect(redis.keys.has(offMissKey('05449000000996'))).toBe(true);
  });

  it('не частіше 1 запиту за секунду: зайнятий слот — без запиту', async () => {
    reply = () =>
      Response.json({ status: 1, product: { product_name: 'Cola' } });
    expect(await client.product('05449000000996')).toEqual({
      product_name: 'Cola',
    });
    expect(await client.product('04820017000277')).toBeNull();
    expect(calls).toBe(1);
  });

  it('збій OFF (429, 5xx) не кешується як промах', async () => {
    reply = () => new Response('', { status: 503 });
    expect(await client.product('05449000000996')).toBeNull();
    expect(redis.keys.has(offMissKey('05449000000996'))).toBe(false);
  });

  it('Redis недоступний — сканер працює без OFF', async () => {
    Object.assign(client, {
      redis: { exists: () => Promise.reject(new Error('ECONNREFUSED')) },
    });
    expect(await client.product('05449000000996')).toBeNull();
    expect(calls).toBe(0);
  });
});
