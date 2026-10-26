import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createRedis } from '../../redis';
import { ExchangeRates, FX_RATES_KEY, parseStoredRates } from './rates';

/** Курси з Redis (пише RatesUpdater у воркері); хвилину в пам'яті процесу */
@Injectable()
export class RatesService implements OnModuleDestroy {
  private readonly redis = createRedis();
  private cache: { value: ExchangeRates | null; until: number } | null = null;

  onModuleDestroy() {
    this.redis.disconnect();
  }

  async current(): Promise<ExchangeRates | null> {
    if (this.cache && Date.now() < this.cache.until) return this.cache.value;
    const value = parseStoredRates(await this.redis.get(FX_RATES_KEY));
    this.cache = { value, until: Date.now() + 60_000 };
    return value;
  }
}
