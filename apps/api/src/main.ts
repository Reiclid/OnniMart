import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ScraperModule } from './modules/scraper/scraper.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const scraper = await NestFactory.create(ScraperModule);

  app.enableCors();
  scraper.enableCors();

  const config = new DocumentBuilder()
    .setTitle('OnniMart API')
    .setDescription('API для моніторингу цін та скрейпінгу')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
