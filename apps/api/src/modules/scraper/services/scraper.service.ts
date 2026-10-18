import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TriggerScraperResponseDto } from '../dto/trigger-scraper.dto';
import { SCRAPER_TASKS_QUEUE, ScraperTask } from '@repo/contracts';
import { createRedis } from '../../../redis';

@Injectable()
export class ScraperService implements OnModuleDestroy {
  private readonly logger = new Logger(ScraperService.name);
  private readonly redis = createRedis();

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

    // Мережа вже в черзі чи обходиться — другий запуск лише навантажив би сайт.
    // Завислі запуски знімає ScrapeScheduler.reapLostRuns
    const active = await this.prisma.scrapeRun.findFirst({
      where: { chainId: chain.id, status: { in: ['QUEUED', 'RUNNING'] } },
      select: { id: true },
    });
    if (active) {
      throw new ConflictException(
        `${chain.name} уже в черзі або обходиться (запуск ${active.id})`,
      );
    }

    const run = await this.prisma.scrapeRun.create({
      data: { chainId: chain.id, trigger },
    });

    const task: ScraperTask = {
      run_id: run.id,
      store: chain.slug,
      max_pages: maxPages ?? null,
      crawl_delay_ms: chain.crawlDelayMs,
      created_at: new Date().toISOString(),
    };
    try {
      await this.redis.lpush(SCRAPER_TASKS_QUEUE, JSON.stringify(task));
    } catch (error) {
      // Інакше запуск лишився б QUEUED назавжди й блокував мережу
      await this.prisma.scrapeRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          error: `Не вдалося поставити завдання в чергу: ${String(error)}`,
        },
      });
      throw new ServiceUnavailableException('Redis недоступний');
    }

    this.logger.log(`Задача на скрейпінг мережі [${store}] додана в чергу.`);

    return {
      status: 'queued',
      message: `Завдання для ${chain.name} успішно поставлено в чергу`,
      runId: run.id,
    };
  }
}
