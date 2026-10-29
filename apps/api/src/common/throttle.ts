import type { ExecutionContext } from '@nestjs/common';
import { Throttle, type ThrottlerModuleOptions } from '@nestjs/throttler';
import type { Request } from 'express';
import { isAdminToken } from '../auth/admin.guard';

/** Зміни (запуск парсингу, модерація): не більше 10 за хвилину з однієї адреси */
export const MutationLimit = () =>
  Throttle({ default: { limit: 10, ttl: 60_000 } });

/**
 * Веб ходить в API зі свого сервера, тож req.ip — адреса Next.js, спільна для всіх покупців.
 * Адресу покупця він передає в CLIENT_HEADER, а PROXY_HEADER (ADMIN_TOKEN) доводить, що це він.
 */
export const CLIENT_HEADER = 'x-onnimart-client';
export const PROXY_HEADER = 'x-onnimart-proxy';

/** Хто робить запит: покупець за адресою від вебу, інакше — адреса з'єднання */
export function clientTracker(req: Request): string {
  const client = req.headers[CLIENT_HEADER];
  const proxy = req.headers[PROXY_HEADER];
  if (
    typeof client === 'string' &&
    client &&
    typeof proxy === 'string' &&
    isAdminToken(proxy)
  )
    return `client:${client}`;
  return req.ip ?? '';
}

const LOGIN_PATH = '/api/v1/auth/login';

/** Email входу — щоб підбір пароля з багатьох адрес теж упирався в ліміт */
function loginEmail(req: Request): string {
  const email: unknown = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export const THROTTLER_OPTIONS: ThrottlerModuleOptions = {
  throttlers: [
    // Не більше 120 запитів за хвилину від одного клієнта (зміни — MutationLimit)
    { name: 'default', ttl: 60_000, limit: 120 },
    // Вхід в один акаунт — не більше 10 спроб за 15 хв, з будь-яких адрес
    {
      name: 'login',
      ttl: 15 * 60_000,
      limit: 10,
      skipIf: (context: ExecutionContext) =>
        context.switchToHttp().getRequest<Request>().path !== LOGIN_PATH,
      getTracker: (req) => `login:${loginEmail(req as Request)}`,
    },
  ],
  getTracker: (req) => clientTracker(req as Request),
};
