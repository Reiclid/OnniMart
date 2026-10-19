import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminGuard } from './admin.guard';

function context(
  method: string,
  authorization?: string,
  path = '/api/v1/scraper/trigger',
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, path, headers: { authorization } }),
    }),
  } as unknown as ExecutionContext;
}

describe('AdminGuard', () => {
  const guard = new AdminGuard();
  const original = process.env.ADMIN_TOKEN;
  afterEach(() => {
    process.env.ADMIN_TOKEN = original;
  });

  it('читання дозволене без токена', () => {
    process.env.ADMIN_TOKEN = 'secret';
    expect(guard.canActivate(context('GET'))).toBe(true);
  });

  it('вхід і /me — без токена адміністратора (їх захищає UserGuard)', () => {
    process.env.ADMIN_TOKEN = 'secret';
    for (const path of [
      '/api/v1/auth/login',
      '/api/v1/me',
      '/api/v1/me/subscriptions',
    ])
      expect(guard.canActivate(context('POST', undefined, path))).toBe(true);
    expect(() =>
      guard.canActivate(context('POST', undefined, '/api/v1/meta')),
    ).toThrow(UnauthorizedException);
  });

  it('зміна з правильним токеном дозволена', () => {
    process.env.ADMIN_TOKEN = 'secret';
    expect(guard.canActivate(context('POST', 'Bearer secret'))).toBe(true);
  });

  it.each([undefined, 'Bearer wrong', 'secret', 'Bearer secre'])(
    'зміна без правильного токена (%s) → 401',
    (header) => {
      process.env.ADMIN_TOKEN = 'secret';
      expect(() => guard.canActivate(context('POST', header))).toThrow(
        UnauthorizedException,
      );
    },
  );

  it('ADMIN_TOKEN не задано → зміни вимкнено (503), а не відкрито', () => {
    delete process.env.ADMIN_TOKEN;
    expect(() => guard.canActivate(context('POST', 'Bearer '))).toThrow(
      ServiceUnavailableException,
    );
  });
});
