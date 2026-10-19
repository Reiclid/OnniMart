import { Throttle } from '@nestjs/throttler';

/** Зміни (запуск парсингу, модерація): не більше 10 за хвилину з однієї адреси */
export const MutationLimit = () =>
  Throttle({ default: { limit: 10, ttl: 60_000 } });
