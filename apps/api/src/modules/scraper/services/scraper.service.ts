import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class ScraperService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScraperService.name);

  private redisClient: Redis;

  private redisSubscriber: Redis;

  private isListening = false;

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.redisClient = new Redis(redisUrl);
    this.redisSubscriber = new Redis(redisUrl);
  }

  async onModuleInit() {
    this.startIngestionWorker();
  }

  async onModuleDestroy() {
    this.isListening = false;
    await this.redisClient.quit();
    await this.redisSubscriber.quit();
  }

  async triggerScrape(store: string) {
    const task = {
      store,
      createdAt: new Date().toISOString(),
    };

    await this.redisClient.lpush('scraper:tasks', JSON.stringify(task));

    this.logger.log(`Задача на Скрейпінг магазину [${store}] додана в чергу.`);

    return {
      status: 'queued',
      message: `Завдання для ${store} успішно поставлено в чергу`,
    };
  }

  private async startIngestionWorker() {
    this.isListening = true;
    this.logger.log('IngestionWorker запущено, очікування данних від RUST...');

    while (this.isListening) {
      try {
        const result = await this.redisSubscriber.brpop('scraper:results', 5);

        if (result) {
          const [_queueName, rawData] = result;
          const productData = JSON.parse(rawData);

          await this.processIncomingProduct(productData);
        }
      } catch (error: any) {
        this.logger.error(`Помилка обробки з черги: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  private async processIncomingProduct(product: any) {
    this.logger.log(
      `Отримано товар від Rust: ${product.name} - ${product.price} грн`,
    );
  }
}
