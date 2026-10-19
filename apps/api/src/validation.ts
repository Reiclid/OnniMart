import { ValidationPipe } from '@nestjs/common';

/**
 * Межа довіри HTTP: тіла й query-параметри з DTO перевіряються декораторами
 * class-validator; невідомі поля відкидаються, некоректні — 400 замість 500 з БД.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
}
