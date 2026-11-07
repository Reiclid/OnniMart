import { errorText } from '../../../common/errors';
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
  ScrapedProductMessage,
  WORKER_HEARTBEAT_KEY,
} from '@repo/contracts';
import Redis from 'ioredis';
import { createRedis } from '../../../redis';
import { IngestionService } from './ingestion.service';

/** Після стількох невдалих спроб повідомлення йде в scraper:results:dead */
export const MAX_ATTEMPTS = 10;
/** Скільки повідомлень воркер бере з черги за один крок */
export const BATCH_SIZE = 100;
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
  /** Невдалі спроби повідомлення, що не проходить */
  private attempts = 0;
  private lastHeartbeat = 0;
  /** Повідомлення, на якому крок зупинився (його і лічимо спробами) */
  private failing: string | null = null;

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

  /**
   * Обробляє пакет повідомлень; повертає паузу перед наступним кроком, мс.
   * Пакет — усе, що лишилось у processing після збою, або до BATCH_SIZE нових
   * повідомлень. Порядок черги зберігається; повідомлення, що не пройшло перевірку,
   * йде в dead-letter окремо й не зачіпає решту пакета.
   */
  async step(): Promise<number> {
    let batch: string[];
    try {
      // Ознака життя воркера для health-check: не частіше ніж раз на 20 с
      if (Date.now() - this.lastHeartbeat > 20_000) {
        await this.redis.set(
          WORKER_HEARTBEAT_KEY,
          new Date().toISOString(),
          'EX',
          60,
        );
        this.lastHeartbeat = Date.now();
      }
      batch = await this.nextBatch();
    } catch (error) {
      if (!this.running) return 0;
      this.logger.error(`Redis: ${errorText(error)}`);
      return 2000;
    }
    if (batch.length === 0) return 0;

    this.failing = null;
    try {
      // Послідовні товари йдуть одним пакетом; подія запуску — рубіж: товари до неї
      // мають бути записані, перш ніж вона підсумує запуск
      let products: Parsed[] = [];
      for (const raw of batch) {
        this.failing = null;
        const parsed = parseScraperMessage(raw);
        if (!parsed.ok) {
          await this.deadLetter(
            raw,
            `некоректне повідомлення: ${parsed.error}`,
          );
        } else if (isRunEvent(parsed.message)) {
          await this.ingestProducts(products);
          products = [];
          this.failing = raw;
          await this.ingestion.handleRunEvent(parsed.message);
          await this.ack([raw]);
        } else {
          products.push({ raw, message: parsed.message });
        }
      }
      await this.ingestProducts(products);
      this.attempts = 0;
      return 0;
    } catch (error) {
      if (!this.running) return 0;
      const reason = errorText(error);
      this.attempts++;
      // Без винного повідомлення (збій Redis) в dead-letter нічого не йде: лише пауза
      if (this.attempts >= MAX_ATTEMPTS && this.failing) {
        await this.deadLetter(this.failing, reason).catch(() => undefined);
        return 0;
      }
      const delay = Math.min(1000 * 2 ** this.attempts, MAX_BACKOFF_MS);
      this.logger.error(
        `Спроба ${this.attempts}/${MAX_ATTEMPTS}, повтор через ${delay / 1000} с: ${reason}`,
      );
      return delay;
    }
  }

  /**
   * Незавершене (processing, найстаріше першим) або нове: BLMOVE чекає на перше
   * повідомлення, решту пакета забирає один pipeline з LMOVE. Повідомлення лишаються
   * в processing, доки їх не записано в БД.
   */
  private async nextBatch(): Promise<string[]> {
    const pending = await this.redis.lrange(
      SCRAPER_RESULTS_PROCESSING,
      -BATCH_SIZE,
      -1,
    );
    if (pending.length > 0) return pending.reverse();

    const first = await this.redis.blmove(
      SCRAPER_RESULTS_QUEUE,
      SCRAPER_RESULTS_PROCESSING,
      'RIGHT',
      'LEFT',
      5,
    );
    if (!first) return [];
    const pipeline = this.redis.pipeline();
    for (let i = 1; i < BATCH_SIZE; i++) {
      pipeline.lmove(
        SCRAPER_RESULTS_QUEUE,
        SCRAPER_RESULTS_PROCESSING,
        'RIGHT',
        'LEFT',
      );
    }
    const rest = (await pipeline.exec()) ?? [];
    const batch = [first];
    for (const [error, raw] of rest) {
      if (error) throw error;
      if (typeof raw === 'string') batch.push(raw);
    }
    return batch;
  }

  /** Товари пакета: спершу одним пакетом, при збої — по одному, щоб знайти винного */
  private async ingestProducts(products: Parsed[]) {
    if (products.length === 0) return;
    try {
      await this.ingestion.ingestBatch(products.map((p) => p.message));
    } catch (error) {
      this.logger.warn(
        `Збій пакета з ${products.length} товарів, обробляємо по одному: ${errorText(error)}`,
      );
      for (const { raw, message } of products) {
        this.failing = raw;
        await this.ingestion.ingest(message);
        await this.ack([raw]);
      }
      return;
    }
    // Збій Redis тут не повторює запис пакета по одному: БД уже відпрацювала
    await this.ack(products.map((p) => p.raw));
  }

  /** Оброблені повідомлення зникають з processing */
  private async ack(raws: string[]) {
    const tx = this.redis.multi();
    for (const raw of raws) tx.lrem(SCRAPER_RESULTS_PROCESSING, -1, raw);
    await tx.exec();
    const before = this.processed;
    this.processed += raws.length;
    if (Math.floor(this.processed / 100) > Math.floor(before / 100)) {
      this.logger.log(`Оброблено повідомлень: ${this.processed}`);
    }
  }

  private async deadLetter(raw: string, reason: string) {
    this.logger.error(`→ ${SCRAPER_RESULTS_DEAD} (${reason}): ${raw}`);
    await this.ingestion.countFailed(runIdOf(raw)).catch(() => undefined);
    await this.redis
      .multi()
      .lpush(SCRAPER_RESULTS_DEAD, raw)
      .lrem(SCRAPER_RESULTS_PROCESSING, -1, raw)
      .exec();
    this.attempts = 0;
  }
}

interface Parsed {
  raw: string;
  message: ScrapedProductMessage;
}

/** run_id з повідомлення, навіть некоректного (щоб зарахувати збій у журнал запуску) */
function runIdOf(raw: string): string | null {
  try {
    const value = JSON.parse(raw) as { run_id?: unknown };
    return typeof value.run_id === 'string' ? value.run_id : null;
  } catch {
    return null;
  }
}
