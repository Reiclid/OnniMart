import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('OnniMart API')
    .setDescription('API для моніторингу цін та скрейпінгу')
    .setVersion('1.0')
    .build();
  return SwaggerModule.createDocument(app, config);
}
