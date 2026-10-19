import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { createOpenApiDocument } from './swagger';
import { createValidationPipe } from './validation';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Лише веб-адмінка; інші сайти не можуть слати запити з браузера адміністратора
  app.enableCors({
    origin: (process.env.WEB_ORIGINS ?? 'http://localhost:3000').split(','),
    methods: ['GET', 'POST'],
  });
  app.enableShutdownHooks();
  app.useGlobalPipes(createValidationPipe());

  SwaggerModule.setup('api/docs', app, createOpenApiDocument(app));

  // За замовчуванням лише з цього компʼютера; HOST=0.0.0.0 — щоб відкрити в мережу
  await app.listen(process.env.PORT ?? 3001, process.env.HOST ?? 'localhost');
}
void bootstrap();
