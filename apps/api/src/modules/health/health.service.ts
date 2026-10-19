import { Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  SCRAPER_HEARTBEAT_KEY,
  SCRAPER_RESULTS_DEAD,
  SCRAPER_RESULTS_QUEUE,
  SCRAPER_TASKS_QUEUE,
  WORKER_HEARTBEAT_KEY,
} from '@repo/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { createRedis } from '../../redis';
import { HealthDto } from './health.dto';

@Injectable()
export class HealthService implements OnModuleDestroy {
  // Health-check має відповідати швидко, а не чекати, поки ioredis перепідключається
  private readonly redis = createRedis({
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
  });

  constructor(private readonly prisma: PrismaService) {}

  onModuleDestroy() {
    this.redis.disconnect();
  }

  async check(): Promise<HealthDto> {
    const [database, state] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(
        () => true,
        () => false,
      ),
      this.redisState(),
    ]);
    const redis = state !== null;
    const worker = Boolean(state?.worker);
    return {
      status: !database || !redis ? 'down' : worker ? 'ok' : 'degraded',
      database,
      redis,
      worker,
      scraperRun: state?.scraperRun ?? null,
      queues: state?.queues ?? null,
    };
  }

  private async redisState() {
    try {
      const [tasks, results, dead, worker, scraperRun] = await Promise.all([
        this.redis.llen(SCRAPER_TASKS_QUEUE),
        this.redis.llen(SCRAPER_RESULTS_QUEUE),
        this.redis.llen(SCRAPER_RESULTS_DEAD),
        this.redis.get(WORKER_HEARTBEAT_KEY),
        this.redis.get(SCRAPER_HEARTBEAT_KEY),
      ]);
      return { queues: { tasks, results, dead }, worker, scraperRun };
    } catch {
      return null;
    }
  }
}
