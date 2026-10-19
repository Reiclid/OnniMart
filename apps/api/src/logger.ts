import { ConsoleLogger } from '@nestjs/common';

const json = () => process.env.LOG_FORMAT === 'json';

/** Логер процесу: текст для людини або JSON-рядки (LOG_FORMAT=json) для збору логів */
export function createLogger(): ConsoleLogger {
  return new ConsoleLogger({ json: json() });
}

/**
 * Повідомлення з полями для звʼязування подій (run_id, store, requestId…):
 * у JSON — обʼєкт (фільтр `.message.run_id`), у тексті — "текст run_id=… store=…".
 */
export function withFields(
  message: string,
  fields: Record<string, string | number | boolean | null | undefined>,
): string | Record<string, unknown> {
  if (json()) return { message, ...fields };
  const pairs = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${String(value)}`);
  return [message, ...pairs].join(' ');
}
