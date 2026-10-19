import { checkEnv } from './config';

const VALID = {
  DATABASE_URL: 'postgresql://postgres:pw@localhost:5432/onnimart',
  REDIS_URL: 'redis://:pw@localhost:6379',
  ADMIN_TOKEN: 'token',
};

describe('checkEnv', () => {
  it('коректна конфігурація — без помилок і попереджень', () => {
    expect(checkEnv(VALID, 'api')).toEqual({ errors: [], warnings: [] });
  });

  it.each([
    ['немає DATABASE_URL', { DATABASE_URL: undefined }],
    ['REDIS_URL не redis://', { REDIS_URL: 'localhost:6379' }],
    ['PORT не число', { PORT: '30o1' }],
    ['SCRAPE_SCHEDULE з помилкою', { SCRAPE_SCHEDULE: 'True' }],
    ['SCRAPE_INTERVAL_HOURS ≤ 0', { SCRAPE_INTERVAL_HOURS: '0' }],
    ['LOG_FORMAT невідомий', { LOG_FORMAT: 'xml' }],
    ['MEILI_URL не URL', { MEILI_URL: 'localhost:7700' }],
  ])('%s → помилка', (_case, override) => {
    expect(checkEnv({ ...VALID, ...override }, 'worker').errors).toHaveLength(
      1,
    );
  });

  it('попереджає про Redis без пароля і API без ADMIN_TOKEN', () => {
    const { errors, warnings } = checkEnv(
      { ...VALID, REDIS_URL: 'redis://localhost:6379', ADMIN_TOKEN: undefined },
      'api',
    );
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(2);
  });
});
