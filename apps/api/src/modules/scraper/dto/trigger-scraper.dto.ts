import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

export class TriggerScraperDto {
  @ApiProperty({ example: 'silpo', description: 'StoreChain.slug мережі' })
  @Matches(/^[a-z0-9-]{2,60}$/, { message: 'slug мережі: a-z, 0-9, дефіс' })
  store!: string;

  @ApiPropertyOptional({
    example: 2,
    description: 'Не більше N сторінок на категорію (для тестового запуску)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
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
