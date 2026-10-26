import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { errorText } from '../../common/errors';
import { createRedis } from '../../redis';
import {
  ECB_URL,
  FX_RATES_KEY,
  mergeRates,
  NBU_URL,
  parseEcb,
  parseNbuEur,
  parseStoredRates,
  ratesStale,
} from './rates';

const USER_AGENT = 'OnniMartBot/0.1 (diploma project; reiclid@gmail.com)';

const get = async (url: string) => {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
};

/** Як часто перевіряти, чи не застаріли курси */
const CHECK_EVERY_MS = 10 * 60 * 1000;

/** Воркер: курси ЄЦБ + НБУ в Redis, не частіше ніж раз на 6 год */
@Injectable()
export class RatesUpdater implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RatesUpdater.name);
  private readonly redis = createRedis();
  private timer?: NodeJS.Timeout;

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.refresh(), CHECK_EVERY_MS);
    void this.refresh();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.redis.disconnect();
  }

  async refresh(now = new Date()): Promise<void> {
    try {
      const current = parseStoredRates(await this.redis.get(FX_RATES_KEY));
      if (!ratesStale(current, now)) return;
      const [ecb, uah] = await Promise.all([
        get(ECB_URL).then(async (r) => parseEcb(await r.text())),
        get(NBU_URL).then(async (r) => parseNbuEur(await r.json())),
      ]);
      if (!ecb || !uah) throw new Error('несподіваний формат відповіді');
      await this.redis.set(
        FX_RATES_KEY,
        JSON.stringify(mergeRates(ecb, uah, now)),
      );
      if (ecb.date !== current?.date)
        this.logger.log(`Курси валют на ${ecb.date}: 1 EUR = ${uah} UAH`);
    } catch (error) {
      // Старі курси лишаються в Redis; наступна спроба — за 10 хв
      this.logger.error(`Курси валют: ${errorText(error)}`);
    }
  }
}
