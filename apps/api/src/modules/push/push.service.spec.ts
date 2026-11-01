import { BadRequestException } from '@nestjs/common';
import webpush, { WebPushError } from 'web-push';
import { PushService } from './push.service';

const FCM = 'https://fcm.googleapis.com/fcm/send/abc';
const device = (fields: object) => ({
  id: 'd1',
  endpoint: FCM,
  p256dh: 'p'.repeat(87),
  auth: 'a'.repeat(22),
  ...fields,
});
const message = {
  title: 'Coca-Cola Zero 1 L',
  body: '39.90 ₴',
  url: '/products/p1',
};

describe('PushService', () => {
  const env = { ...process.env };
  let prisma: {
    pushDevice: Record<string, jest.Mock>;
    user: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let send: jest.SpyInstance;

  beforeEach(() => {
    // Справжня пара ключів не потрібна: setVapidDetails лише перевіряє формат
    const keys = webpush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    prisma = {
      pushDevice: {
        findMany: jest.fn(async () => [device({})]),
        deleteMany: jest.fn(async () => ({ count: 1 })),
        upsert: jest.fn(),
      },
      user: { update: jest.fn() },
      $transaction: jest.fn(),
    };
    send = jest.spyOn(webpush, 'sendNotification');
  });
  afterEach(() => {
    process.env = { ...env };
    send.mockRestore();
  });

  it('шле JSON на пристрій і рахує доставлені', async () => {
    send.mockResolvedValue({ statusCode: 201 });
    const service = new PushService(prisma as never);
    expect(await service.send('u1', message)).toBe(1);
    expect(send.mock.calls[0][0]).toEqual({
      endpoint: FCM,
      keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) },
    });
    expect(JSON.parse(send.mock.calls[0][1] as string)).toEqual(message);
  });

  it('push-сервіс каже 410 — пристрій видаляється', async () => {
    send.mockRejectedValue(new WebPushError('Gone', 410, {}, '', FCM));
    const service = new PushService(prisma as never);
    expect(await service.send('u1', message)).toBe(0);
    expect(prisma.pushDevice.deleteMany).toHaveBeenCalledWith({
      where: { id: 'd1' },
    });
  });

  it('збій сервісу (500) — пристрій лишається', async () => {
    send.mockRejectedValue(new WebPushError('Oops', 500, {}, '', FCM));
    const service = new PushService(prisma as never);
    expect(await service.send('u1', message)).toBe(0);
    expect(prisma.pushDevice.deleteMany).not.toHaveBeenCalled();
  });

  it('чужа адреса в базі не отримує запит', async () => {
    prisma.pushDevice.findMany.mockResolvedValue([
      device({ endpoint: 'https://localhost:6379/' }),
    ]);
    const service = new PushService(prisma as never);
    expect(await service.send('u1', message)).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('без VAPID-ключів push вимкнено', async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    const service = new PushService(prisma as never);
    expect(service.publicKey).toBeNull();
    expect(await service.send('u1', message)).toBe(0);
    expect(prisma.pushDevice.findMany).not.toHaveBeenCalled();
  });

  it('save приймає лише push-сервіси браузерів', async () => {
    const service = new PushService(prisma as never);
    await expect(
      service.save('u1', {
        endpoint: 'https://evil.example/hook',
        p256dh: 'p'.repeat(87),
        auth: 'a'.repeat(22),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
