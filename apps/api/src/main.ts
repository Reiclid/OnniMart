import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { createOpenApiDocument } from './swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();
  app.enableShutdownHooks();

  SwaggerModule.setup('api/docs', app, createOpenApiDocument(app));

  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
