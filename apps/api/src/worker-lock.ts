import { errorText } from './common/errors';
import { randomUUID } from 'node:crypto';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { WORKER_LOCK_KEY } from '@repo/contracts';
import Redis from 'ioredis';
import { createRedis } from './redis';

const TTL_SECONDS = 60;
const RENEW_MS = 20_000;

/**
 * Продовжити замок, якщо він наш або вже нічий: поки компʼютер спить, TTL спливає,
 * а після пробудження воркер має забрати його назад, а не лаятися до перезапуску
 */
const RENEW = `local owner = redis.call('get', KEYS[1]) if owner and owner ~= ARGV[1] then return 0 end redis.call('set', KEYS[1], ARGV[1], 'EX', ARGV[2]) return 1`;
/** Зняти замок, лише якщо він досі наш */
const RELEASE = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

/**
 * Воркер має бути один: блокування зіставлення, планувальник і споживачі черг живуть
 * у памʼяті процесу. Замок береться до старту фонових циклів (onModuleInit), тож другий
 * екземпляр падає при запуску, а не працює паралельно.
 */
@Injectable()
export class WorkerLock implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerLock.name);
  private readonly redis: Redis = createRedis();
  private readonly id = randomUUID();
  private timer?: NodeJS.Timeout;

  async onModuleInit() {
    const taken = await this.redis.set(
      WORKER_LOCK_KEY,
      this.id,
      'EX',
      TTL_SECONDS,
      'NX',
    );
    if (taken !== 'OK') {
      throw new Error(
        `Інший воркер уже працює (${WORKER_LOCK_KEY}); другий екземпляр не запускаємо`,
      );
    }
    this.timer = setInterval(() => void this.renew(), RENEW_MS);
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.redis.eval(RELEASE, 1, WORKER_LOCK_KEY, this.id).catch(() => 0);
    this.redis.disconnect();
  }

  async renew(): Promise<boolean> {
    try {
      const ok = await this.redis.eval(
        RENEW,
        1,
        WORKER_LOCK_KEY,
        this.id,
        TTL_SECONDS,
      );
      if (ok !== 1)
        this.logger.error('Замок воркера втрачено — перезапустіть воркер');
      return ok === 1;
    } catch (error) {
      this.logger.error(`Замок воркера: ${errorText(error)}`);
      return false;
    }
  }
}
