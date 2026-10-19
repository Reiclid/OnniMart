import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { assertEnv } from './config';
import { createLogger } from './logger';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  assertEnv('worker');
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: createLogger(),
  });
  // Щоб цикли читання з Redis коректно зупинялись
  app.enableShutdownHooks();
}
void bootstrap();
