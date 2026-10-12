// Записує openapi.json без запуску сервера: Nest лише створює модулі,
// до PostgreSQL і Redis не підключається. Далі клієнт для web генерує orval:
//   bun run openapi && cd ../web && bun run generate:api
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { createOpenApiDocument } from '../src/swagger';

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  writeFileSync(
    'openapi.json',
    JSON.stringify(createOpenApiDocument(app), null, 2),
  );
  console.log('openapi.json оновлено');
  process.exit(0);
}

void main();
