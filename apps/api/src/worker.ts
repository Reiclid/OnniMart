import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { assertEnv } from './config';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  assertEnv('worker');
  const app = await NestFactory.createApplicationContext(WorkerModule);
  // Щоб цикли читання з Redis коректно зупинялись
  app.enableShutdownHooks();
}
void bootstrap();
