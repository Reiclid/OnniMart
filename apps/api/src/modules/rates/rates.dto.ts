import { ApiProperty } from '@nestjs/swagger';

export class ExchangeRatesDto {
  @ApiProperty({ description: 'Дата курсів ЄЦБ (YYYY-MM-DD)' }) date!: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    description:
      'Одиниць валюти за 1 EUR: { EUR: 1, UAH: 50.58, USD: 1.12, … }',
  })
  perEur!: Record<string, number>;
  @ApiProperty({ description: 'Коли воркер отримав курси' }) fetchedAt!: string;
}
