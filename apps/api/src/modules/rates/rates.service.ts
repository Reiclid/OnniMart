import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createRedis } from '../../redis';
import {
  ExchangeRates,
  FX_RATES_KEY,
  parseStoredRates,
  usableRates,
} from './rates';

/** Курси з Redis (пише RatesUpdater у воркері); хвилину в пам'яті процесу; старші за тиждень — null */
@Injectable()
export class RatesService implements OnModuleDestroy {
  private readonly redis = createRedis();
  private cache: { value: ExchangeRates | null; until: number } | null = null;

  onModuleDestroy() {
    this.redis.disconnect();
  }

  async current(): Promise<ExchangeRates | null> {
    if (this.cache && Date.now() < this.cache.until) return this.cache.value;
    const value = usableRates(
      parseStoredRates(await this.redis.get(FX_RATES_KEY)),
      new Date(),
    );
    this.cache = { value, until: Date.now() + 60_000 };
    return value;
  }
}
