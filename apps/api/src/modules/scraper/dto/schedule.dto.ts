import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_INTERVAL_HOURS, MIN_INTERVAL_HOURS } from '../services/schedule';

export class ChainScheduleDto {
  @ApiProperty({ example: 'silpo' }) slug!: string;
  @ApiProperty({ example: 'Сільпо' }) name!: string;
  @ApiProperty({ description: 'Коли мережу буде поставлено в чергу' })
  nextRunAt!: string;
  @ApiProperty({ description: 'Запуск зараз у черзі або виконується' })
  active!: boolean;
}

export class ScheduleDto {
  @ApiProperty() enabled!: boolean;
  @ApiProperty({ example: 24 }) intervalHours!: number;
  @ApiProperty({
    description: 'Ручний запуск зараховується як плановий (таймер з нуля)',
  })
  manualResetsTimer!: boolean;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Найближчий плановий обхід; null — розклад вимкнено або немає мереж',
  })
  nextRunAt!: string | null;
  @ApiProperty({ description: 'Мереж зараз у черзі або в обході' })
  activeRuns!: number;
  @ApiProperty({ type: [ChainScheduleDto] }) chains!: ChainScheduleDto[];
}

export class UpdateScheduleDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;

  @ApiPropertyOptional({ example: 24 })
  @IsOptional()
  @IsInt()
  @Min(MIN_INTERVAL_HOURS)
  @Max(MAX_INTERVAL_HOURS)
  intervalHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  manualResetsTimer?: boolean;
}

export class RunAllResponseDto {
  @ApiProperty({ type: [String], description: 'Поставлені в чергу мережі' })
  queued!: string[];
  @ApiProperty({
    type: [String],
    description: 'Пропущені: уже в черзі чи обходяться',
  })
  skipped!: string[];
}
