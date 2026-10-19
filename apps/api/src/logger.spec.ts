import { withFields } from './logger';

describe('withFields', () => {
  const format = process.env.LOG_FORMAT;
  afterEach(() => {
    process.env.LOG_FORMAT = format;
  });

  it('текст: поля через key=value, порожні пропускає', () => {
    process.env.LOG_FORMAT = 'text';
    expect(
      withFields('Запуск завершено', {
        run_id: 'r1',
        store: 'novus',
        error: null,
      }),
    ).toBe('Запуск завершено run_id=r1 store=novus');
  });

  it('JSON: обʼєкт з полями', () => {
    process.env.LOG_FORMAT = 'json';
    expect(withFields('Запуск завершено', { run_id: 'r1' })).toEqual({
      message: 'Запуск завершено',
      run_id: 'r1',
    });
  });
});
