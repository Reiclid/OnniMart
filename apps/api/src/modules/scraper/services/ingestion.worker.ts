import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import {
  isRunEvent,
  parseScraperMessage,
  SCRAPER_RESULTS_QUEUE,
} from '@repo/contracts';
import { createRedis } from '../../../redis';
import { IngestionService } from './ingestion.service';

/**
 * Фоновий цикл: читає результати Rust-парсера з Redis і передає їх у IngestionService.
 */
@Injectable()
export class IngestionWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(IngestionWorker.name);
  // Окреме з'єднання: BRPOP блокує його, поки чекає на дані.
  private readonly redis = createRedis({ maxRetriesPerRequest: null });
  private running = false;
  private loop?: Promise<void>;

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
    let processed = 0;

    while (this.running) {
      try {
        const result = await this.redis.brpop(SCRAPER_RESULTS_QUEUE, 5);
        if (!result) continue;

        const [, raw] = result;
        const parsed = parseScraperMessage(raw);
        if (!parsed.ok) {
          this.logger.warn(`Некоректне повідомлення (${parsed.error}): ${raw}`);
          continue;
        }
        const { message } = parsed;
        if (isRunEvent(message)) {
          await this.ingestion.handleRunEvent(message);
          continue;
        }

        await this.ingestion.ingest(message);
        processed += 1;
        if (processed % 100 === 0) {
          this.logger.log(`Оброблено товарів: ${processed}`);
        }
      } catch (error) {
        if (!this.running) break;
        this.logger.error(
          `Помилка обробки з черги: ${(error as Error).message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
}
