import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';
import {
  MAX_INTERVAL_HOURS,
  MIN_INTERVAL_HOURS,
  START_TIME,
  UTC_OFFSETS,
} from '../services/schedule';

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
    example: '03:00',
    description:
      'Обходи рівно о цій годині з кроком періоду; null — інтервал від останнього запуску',
  })
  startTime!: string | null;
  @ApiProperty({ example: 2, description: 'Пояс часу, годин від UTC' })
  utcOffset!: number;
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

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '03:00',
    description: 'null — без часу, інтервал від останнього запуску',
  })
  @IsOptional()
  @Matches(START_TIME, { message: 'Час у форматі ГГ:ХХ' })
  startTime?: string | null;

  @ApiPropertyOptional({ enum: UTC_OFFSETS })
  @IsOptional()
  @IsIn(UTC_OFFSETS)
  utcOffset?: number;
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
