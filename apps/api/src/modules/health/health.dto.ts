import { ApiProperty } from '@nestjs/swagger';

export class QueueDepthDto {
  @ApiProperty({ description: 'Завдань чекає на Rust-парсер' }) tasks!: number;
  @ApiProperty({ description: 'Результатів чекає на воркер' }) results!: number;
  @ApiProperty({ description: 'Повідомлень у dead-letter' }) dead!: number;
}

export class HealthDto {
  @ApiProperty({
    enum: ['ok', 'degraded', 'down'],
    description:
      'down — немає БД чи Redis (HTTP 503); degraded — не працює воркер',
  })
  status!: 'ok' | 'degraded' | 'down';
  @ApiProperty() database!: boolean;
  @ApiProperty() redis!: boolean;
  @ApiProperty({ description: 'Воркер подавав ознаку життя протягом хвилини' })
  worker!: boolean;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'run_id обходу, який зараз виконує парсер',
  })
  scraperRun!: string | null;
  @ApiProperty({ type: QueueDepthDto, nullable: true })
  queues!: QueueDepthDto | null;
}
