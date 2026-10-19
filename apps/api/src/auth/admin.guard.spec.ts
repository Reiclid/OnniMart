import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminGuard } from './admin.guard';

function context(method: string, authorization?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, headers: { authorization } }),
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
