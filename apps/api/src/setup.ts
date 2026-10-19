import type { INestApplication } from '@nestjs/common';
import { createValidationPipe } from './validation';

/** Спільне для main.ts і HTTP-тестів: CORS, валідація, коректне завершення */
export function setupApp(app: INestApplication): void {
  // Лише веб-адмінка; інші сайти не можуть слати запити з браузера адміністратора
  app.enableCors({
    origin: (process.env.WEB_ORIGINS ?? 'http://localhost:3000').split(','),
    methods: ['GET', 'POST'],
  });
  app.enableShutdownHooks();
  app.useGlobalPipes(createValidationPipe());
}
