import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();
  // Потрібно, щоб IngestionWorker коректно зупиняв цикл читання з Redis
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('OnniMart API')
    .setDescription('API для моніторингу цін та скрейпінгу')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
