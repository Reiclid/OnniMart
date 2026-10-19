/**
 * Перевірка змінних оточення при старті: помилка в конфігурації має зупиняти процес
 * одразу й зрозуміло, а не проявлятися на першому запиті до БД чи Redis.
 */
export function checkEnv(
  env: NodeJS.ProcessEnv,
  process: 'api' | 'worker',
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!/^postgres(ql)?:\/\//.test(env.DATABASE_URL ?? '')) {
    errors.push(
      'DATABASE_URL: потрібен postgresql://… (див. apps/api/.env.example)',
    );
  }
  if (!/^rediss?:\/\//.test(env.REDIS_URL ?? '')) {
    errors.push('REDIS_URL: потрібен redis://:<пароль>@host:6379');
  } else if (!/^rediss?:\/\/[^/]*@/.test(env.REDIS_URL!)) {
    warnings.push('REDIS_URL без пароля — Redis у docker-compose його вимагає');
  }
  if (env.PORT !== undefined && !/^\d+$/.test(env.PORT)) {
    errors.push(`PORT: очікується число, а не "${env.PORT}"`);
  }
  for (const flag of ['SCRAPE_SCHEDULE', 'SWAGGER'] as const) {
    if (env[flag] !== undefined && !['true', 'false'].includes(env[flag])) {
      errors.push(`${flag}: true або false, а не "${env[flag]}"`);
    }
  }
  const hours = env.SCRAPE_INTERVAL_HOURS;
  if (hours !== undefined && !(Number(hours) > 0)) {
    errors.push(`SCRAPE_INTERVAL_HOURS: додатне число, а не "${hours}"`);
  }
  if (process === 'api' && !env.ADMIN_TOKEN) {
    warnings.push('ADMIN_TOKEN не задано — зміни через API вимкнено');
  }
  return { errors, warnings };
}

/** Друкує попередження; при помилках — пояснення й завершення процесу */
export function assertEnv(process: 'api' | 'worker'): void {
  const { errors, warnings } = checkEnv(globalThis.process.env, process);
  for (const warning of warnings) console.warn(`[config] ${warning}`);
  if (errors.length === 0) return;
  console.error(`[config] Некоректна конфігурація (${process}):`);
  for (const error of errors) console.error(`  - ${error}`);
  globalThis.process.exit(1);
}
