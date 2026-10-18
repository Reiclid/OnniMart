import Redis, { RedisOptions } from 'ioredis';

export const DEFAULT_REDIS_URL = 'redis://localhost:6379';

/** lazyConnect — щоб генерація OpenAPI і тести не підключались до Redis */
export function createRedis(options: RedisOptions = {}): Redis {
  return new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL, {
    lazyConnect: true,
    ...options,
  });
}
