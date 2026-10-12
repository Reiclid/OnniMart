import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service';
import { TriggerScraperResponseDto } from '../dto/trigger-scraper.dto';
import { DEFAULT_REDIS_URL, SCRAPER_TASKS_QUEUE } from '../scraper.constants';

@Injectable()
export class ScraperService implements OnModuleDestroy {
  private readonly logger = new Logger(ScraperService.name);
  private readonly redis = new Redis(
    process.env.REDIS_URL ?? DEFAULT_REDIS_URL,
    { lazyConnect: true },
  );

  constructor(private readonly prisma: PrismaService) {}

  onModuleDestroy() {
    this.redis.disconnect();
  }

  async triggerScrape(
    store: string,
    maxPages?: number,
    // "manual" — кнопка в адмінці, "cron" — планувальник
    trigger: 'manual' | 'cron' = 'manual',
  ): Promise<TriggerScraperResponseDto> {
    if (
      maxPages !== undefined &&
      (!Number.isInteger(maxPages) || maxPages < 1)
    ) {
      throw new BadRequestException('maxPages має бути цілим числом ≥ 1');
    }

    const chain = await this.prisma.storeChain.findUnique({
      where: { slug: store },
    });
    if (!chain) {
      throw new NotFoundException(`Мережу "${store}" не знайдено`);
    }
    if (!chain.scrapeEnabled) {
      throw new BadRequestException(
        `Збір даних для "${chain.name}" вимкнено (див. docs/01-data-sources.md)`,
      );
    }

    const run = await this.prisma.scrapeRun.create({
      data: { chainId: chain.id, trigger },
    });

    const task = {
      run_id: run.id,
      store: chain.slug,
      max_pages: maxPages ?? null,
      crawl_delay_ms: chain.crawlDelayMs,
      created_at: new Date().toISOString(),
    };
    await this.redis.lpush(SCRAPER_TASKS_QUEUE, JSON.stringify(task));

    this.logger.log(`Задача на скрейпінг мережі [${store}] додана в чергу.`);

    return {
      status: 'queued',
      message: `Завдання для ${chain.name} успішно поставлено в чергу`,
      runId: run.id,
    };
  }
}
