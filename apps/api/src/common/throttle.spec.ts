import type { Request } from 'express';
import { CLIENT_HEADER, clientTracker, PROXY_HEADER } from './throttle';

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
