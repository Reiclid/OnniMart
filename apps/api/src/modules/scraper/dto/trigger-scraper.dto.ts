import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TriggerScraperDto {
  @ApiProperty({ example: 'silpo', description: 'StoreChain.slug мережі' })
  store!: string;

  @ApiPropertyOptional({
    example: 2,
    description: 'Не більше N сторінок на категорію (для тестового запуску)',
  })
  maxPages?: number;
}

export class TriggerScraperResponseDto {
  @ApiProperty({ example: 'queued' })
  status!: string;

  @ApiProperty({ example: 'Завдання поставлено в чергу' })
  message!: string;

  @ApiProperty({ description: 'ScrapeRun.id — за ним видно перебіг запуску' })
  runId!: string;
}
