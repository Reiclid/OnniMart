import { Logger } from '@nestjs/common';
import { WorkerLock } from './worker-lock';

/** Мінімальний Redis: SET NX і скрипти RENEW / RELEASE */
function fakeRedis(store: Map<string, string>) {
  return {
    set: (key: string, value: string, ..._args: unknown[]) => {
      if (store.has(key)) return Promise.resolve(null);
      store.set(key, value);
      return Promise.resolve('OK');
    },
    eval: (script: string, _n: number, key: string, id: string) => {
      if (store.get(key) !== id) return Promise.resolve(0);
      if (script.includes("'del'")) store.delete(key);
      return Promise.resolve(1);
    },
    disconnect: () => undefined,
  };
}

function lock(store: Map<string, string>) {
  const instance = new WorkerLock();
  Object.assign(instance, { redis: fakeRedis(store) });
  return instance;
}

describe('WorkerLock', () => {
  beforeAll(() => Logger.overrideLogger(false));

  it('другий воркер не стартує, поки перший тримає замок', async () => {
    const store = new Map<string, string>();
    const first = lock(store);
    await first.onModuleInit();
    await expect(lock(store).onModuleInit()).rejects.toThrow('Інший воркер');
    expect(await first.renew()).toBe(true);

    await first.onModuleDestroy();
    const next = lock(store);
    await expect(next.onModuleInit()).resolves.toBeUndefined();
    await next.onModuleDestroy();
  });

  it('чужий замок не продовжує і не знімає', async () => {
    const store = new Map([['worker:lock', 'someone-else']]);
    const instance = lock(store);
    expect(await instance.renew()).toBe(false);
    await instance.onModuleDestroy();
    expect(store.get('worker:lock')).toBe('someone-else');
  });
});
