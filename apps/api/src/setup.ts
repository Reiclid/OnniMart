import { randomUUID } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { withFields } from './logger';
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
  app.use(logRequests);
}

const http = new Logger('HTTP');

/** Кожен запит — один рядок логу з requestId (його ж повертаємо в x-request-id) */
function logRequests(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers['x-request-id'];
  const requestId =
    typeof header === 'string' && /^[\w-]{1,64}$/.test(header)
      ? header
      : randomUUID();
  res.setHeader('x-request-id', requestId);
  const started = performance.now();
  res.on('finish', () => {
    const fields = {
      requestId,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      ms: Math.round(performance.now() - started),
    };
    const message = withFields('HTTP-запит', fields);
    if (res.statusCode >= 500) http.error(message);
    else if (res.statusCode >= 400) http.warn(message);
    else http.log(message);
  });
  next();
}
