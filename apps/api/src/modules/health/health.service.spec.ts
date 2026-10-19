import { PrismaService } from '../../prisma/prisma.service';
import { HealthService } from './health.service';

function setup(database: boolean, redis: object | null) {
  const prisma = {
    $queryRaw: jest.fn(() =>
      database ? Promise.resolve([1]) : Promise.reject(new Error('down')),
    ),
  };
  const service = new HealthService(prisma as unknown as PrismaService);
  const fail = () => Promise.reject(new Error('ECONNREFUSED'));
  Object.assign(service, {
    redis: redis ?? { llen: fail, get: fail },
  });
  return service;
}

const redis = (worker: string | null) => ({
  llen: (key: string) => Promise.resolve(key.endsWith('dead') ? 2 : 0),
  get: (key: string) =>
    Promise.resolve(key === 'worker:heartbeat' ? worker : 'run-1'),
});

describe('HealthService', () => {
  it('усе працює → ok', async () => {
    await expect(
      setup(true, redis('2026-10-19T10:00:00Z')).check(),
    ).resolves.toMatchObject({
      status: 'ok',
      worker: true,
      scraperRun: 'run-1',
      queues: { tasks: 0, results: 0, dead: 2 },
    });
  });

  it('воркер мовчить → degraded', async () => {
    await expect(setup(true, redis(null)).check()).resolves.toMatchObject({
      status: 'degraded',
      worker: false,
    });
  });

  it('немає БД або Redis → down', async () => {
    await expect(setup(false, redis('x')).check()).resolves.toMatchObject({
      status: 'down',
      database: false,
    });
    await expect(setup(true, null).check()).resolves.toMatchObject({
      status: 'down',
      redis: false,
      queues: null,
    });
  });
});
