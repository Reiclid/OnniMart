import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { assertEnv } from './config';
import { createLogger } from './logger';
import { createOpenApiDocument } from './swagger';
import { setupApp } from './setup';

async function bootstrap() {
  assertEnv('api');
  const app = await NestFactory.create(AppModule, {
    logger: createLogger(),
  });
  setupApp(app);

  // У продакшні документацію API не віддаємо (SWAGGER=true — увімкнути)
  if (process.env.NODE_ENV !== 'production' || process.env.SWAGGER === 'true') {
    SwaggerModule.setup('api/docs', app, createOpenApiDocument(app));
  }

  // За замовчуванням лише з цього компʼютера; HOST=0.0.0.0 — щоб відкрити в мережу
  await app.listen(process.env.PORT ?? 3001, process.env.HOST ?? 'localhost');
}
void bootstrap();
