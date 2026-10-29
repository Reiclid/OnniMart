import {
  Body,
  Controller,
  HttpCode,
  type INestApplication,
  Module,
  Post,
} from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  CLIENT_HEADER,
  clientTracker,
  MutationLimit,
  PROXY_HEADER,
  THROTTLER_OPTIONS,
} from './throttle';

const request = (headers: Record<string, string>, ip = '127.0.0.1') =>
  ({ headers, ip }) as unknown as Request;

describe('clientTracker', () => {
  const original = process.env.ADMIN_TOKEN;
  beforeEach(() => {
    process.env.ADMIN_TOKEN = 'secret';
  });
  afterEach(() => {
    process.env.ADMIN_TOKEN = original;
  });

  it('покупці за вебом рахуються окремо, а не як одна адреса сервера Next.js', () => {
    const a = request({ [CLIENT_HEADER]: '1.2.3.4', [PROXY_HEADER]: 'secret' });
    const b = request({ [CLIENT_HEADER]: '5.6.7.8', [PROXY_HEADER]: 'secret' });
    expect(clientTracker(a)).toBe('client:1.2.3.4');
    expect(clientTracker(b)).toBe('client:5.6.7.8');
  });

  it('адресі без токена вебу не віримо — інакше ліміт обходиться підробленим заголовком', () => {
    expect(clientTracker(request({ [CLIENT_HEADER]: '1.2.3.4' }))).toBe(
      '127.0.0.1',
    );
    expect(
      clientTracker(
        request({ [CLIENT_HEADER]: '1.2.3.4', [PROXY_HEADER]: 'wrong' }),
      ),
    ).toBe('127.0.0.1');
  });

  it('без ADMIN_TOKEN — завжди адреса з’єднання', () => {
    delete process.env.ADMIN_TOKEN;
    expect(
      clientTracker(
        request({ [CLIENT_HEADER]: '1.2.3.4', [PROXY_HEADER]: '' }),
      ),
    ).toBe('127.0.0.1');
  });
});

@Controller('api/v1/auth')
class LoginStub {
  @MutationLimit()
  @Post('login')
  @HttpCode(200)
  login(@Body() _body: unknown) {
    return {};
  }
}

@Module({
  imports: [ThrottlerModule.forRoot(THROTTLER_OPTIONS)],
  controllers: [LoginStub],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class StubModule {}

describe('THROTTLER_OPTIONS на справжньому Nest', () => {
  let app: INestApplication;
  let url: string;
  const original = process.env.ADMIN_TOKEN;

  beforeAll(async () => {
    process.env.ADMIN_TOKEN = 'secret';
    app = await NestFactory.create(StubModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    url = `${await app.getUrl()}/api/v1/auth/login`;
  });
  afterAll(async () => {
    process.env.ADMIN_TOKEN = original;
    await app.close();
  });

  const login = (client: string, email: string) =>
    fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [CLIENT_HEADER]: client,
        [PROXY_HEADER]: 'secret',
      },
      body: JSON.stringify({ email, password: 'x' }),
    }).then((r) => r.status);

  it('ліміт змін — на покупця: чужі спроби не блокують інших', async () => {
    for (let i = 0; i < 10; i++)
      expect(await login('1.1.1.1', `user${i}@a.com`)).toBe(200);
    expect(await login('1.1.1.1', 'other@a.com')).toBe(429);
    expect(await login('2.2.2.2', 'other@a.com')).toBe(200);
  });

  it('вхід в один акаунт обмежений і з різних адрес', async () => {
    for (let i = 0; i < 10; i++)
      expect(await login(`10.0.0.${i}`, ' Victim@A.com')).toBe(200);
    expect(await login('10.0.1.1', 'victim@a.com')).toBe(429);
    expect(await login('10.0.1.2', 'someone@a.com')).toBe(200);
  });
});
