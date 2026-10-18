import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import {
  isRunEvent,
  parseScraperMessage,
  SCRAPER_RESULTS_DEAD,
  SCRAPER_RESULTS_PROCESSING,
  SCRAPER_RESULTS_QUEUE,
} from '@repo/contracts';
import Redis from 'ioredis';
import { createRedis } from '../../../redis';
import { IngestionService } from './ingestion.service';

/** Після стількох невдалих спроб повідомлення йде в scraper:results:dead */
export const MAX_ATTEMPTS = 10;
const MAX_BACKOFF_MS = 60_000;

/**
 * Фоновий цикл: читає результати Rust-парсера з Redis і передає їх у IngestionService.
 * Надійна черга: BLMOVE переносить повідомлення в scraper:results:processing, і воно
 * зникає звідти лише після запису в БД. Тож падіння воркера чи БД нічого не губить:
 * незавершене повідомлення обробляється першим, із паузою, що зростає до 60 с.
 */
@Injectable()
export class IngestionWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(IngestionWorker.name);
  // Окреме з'єднання: BLMOVE блокує його, поки чекає на дані.
  private readonly redis: Redis = createRedis({ maxRetriesPerRequest: null });
  private running = false;
  private loop?: Promise<void>;
  private processed = 0;
  /** Невдалі спроби поточного повідомлення */
  private attempts = 0;

  constructor(private readonly ingestion: IngestionService) {}

  onApplicationBootstrap() {
    this.running = true;
    // Без await: нескінченний цикл у хуку ініціалізації не дав би Nest дійти до app.listen()
    this.loop = this.run();
  }

  async onApplicationShutdown() {
    this.running = false;
    this.redis.disconnect();
    await this.loop;
  }

  private async run() {
    this.logger.log('IngestionWorker запущено, очікування даних від Rust...');
    while (this.running) {
      const delay = await this.step();
      if (delay > 0 && this.running) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /** Обробляє одне повідомлення; повертає паузу перед наступним кроком, мс */
  async step(): Promise<number> {
    let raw: string | null = null;
    try {
      // Спершу — незавершене повідомлення (воркер чи БД падали посеред обробки)
      raw =
        (await this.redis.lindex(SCRAPER_RESULTS_PROCESSING, -1)) ??
        (await this.redis.blmove(
          SCRAPER_RESULTS_QUEUE,
          SCRAPER_RESULTS_PROCESSING,
          'RIGHT',
          'LEFT',
          5,
        ));
      if (!raw) return 0;

      const parsed = parseScraperMessage(raw);
      if (!parsed.ok) {
        await this.deadLetter(raw, `некоректне повідомлення: ${parsed.error}`);
        return 0;
      }
      const { message } = parsed;
      if (isRunEvent(message)) await this.ingestion.handleRunEvent(message);
      else await this.ingestion.ingest(message);

      await this.redis.lrem(SCRAPER_RESULTS_PROCESSING, -1, raw);
      this.attempts = 0;
      if (!isRunEvent(message) && ++this.processed % 100 === 0) {
        this.logger.log(`Оброблено товарів: ${this.processed}`);
      }
      return 0;
    } catch (error) {
      if (!this.running) return 0;
      const reason = (error as Error).stack ?? String(error);
      if (raw === null) {
        this.logger.error(`Redis: ${reason}`);
        return 2000;
      }
      this.attempts++;
      if (this.attempts >= MAX_ATTEMPTS) {
        await this.deadLetter(raw, reason).catch(() => undefined);
        return 0;
      }
      const delay = Math.min(1000 * 2 ** this.attempts, MAX_BACKOFF_MS);
      this.logger.error(
        `Спроба ${this.attempts}/${MAX_ATTEMPTS}, повтор через ${delay / 1000} с: ${reason}`,
      );
      return delay;
    }
  }

  private async deadLetter(raw: string, reason: string) {
    this.logger.error(`→ ${SCRAPER_RESULTS_DEAD} (${reason}): ${raw}`);
    await this.redis
      .multi()
      .lpush(SCRAPER_RESULTS_DEAD, raw)
      .lrem(SCRAPER_RESULTS_PROCESSING, -1, raw)
      .exec();
    this.attempts = 0;
  }
}
