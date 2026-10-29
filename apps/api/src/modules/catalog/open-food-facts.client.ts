import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { errorText } from '../../common/errors';
import { createRedis } from '../../redis';
import { offCode } from './food-facts';

const PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product/';
const USER_AGENT = 'OnniMartBot/0.1 (diploma project; reiclid@gmail.com)';
const TIMEOUT_MS = 4000;
/** Не частіше 1 запиту за секунду з усіх процесів API (правило для відкритих API) */
export const OFF_SLOT_KEY = 'off:slot';
const SLOT_MS = 1000;
/** Штрихкод, якого OFF не знає, — не питаємо тиждень */
export const offMissKey = (gtin: string) => `off:miss:${gtin}`;
const MISS_TTL_S = 7 * 24 * 60 * 60;

/**
 * API Open Food Facts для сканера. Публічний GET не повинен перетворювати нас на краулер OFF:
 * спільний ліміт 1 запит/с через Redis і кеш промахів. Зайнятий слот або збій — просто без даних OFF.
 */
@Injectable()
export class OpenFoodFactsClient implements OnModuleDestroy {
  private readonly logger = new Logger(OpenFoodFactsClient.name);
  private readonly redis = createRedis();

  onModuleDestroy() {
    this.redis.disconnect();
  }

  /** Сирий товар OFF; null — OFF його не знає, ліміт зайнятий або сталася помилка */
  async product(gtin: string): Promise<Record<string, unknown> | null> {
    try {
      if (await this.redis.exists(offMissKey(gtin))) return null;
      const slot = await this.redis.set(OFF_SLOT_KEY, '1', 'PX', SLOT_MS, 'NX');
      if (slot !== 'OK') return null;
      const response = await fetch(`${PRODUCT_URL}${offCode(gtin)}`, {
        headers: { 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      // 404 — товару немає; інші помилки (429, 5xx) не кешуємо: спробуємо наступного разу
      if (!response.ok && response.status !== 404) {
        this.logger.warn(`Open Food Facts ${gtin}: HTTP ${response.status}`);
        return null;
      }
      const body = response.ok
        ? ((await response.json()) as {
            status?: number;
            product?: Record<string, unknown>;
          })
        : {};
      if (body.status === 1 && body.product) return body.product;
      await this.redis.set(offMissKey(gtin), '1', 'EX', MISS_TTL_S);
      return null;
    } catch (error) {
      this.logger.warn(`Open Food Facts ${gtin}: ${errorText(error)}`);
      return null;
    }
  }
}
