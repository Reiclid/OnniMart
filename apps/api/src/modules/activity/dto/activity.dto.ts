import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { EVENT_TYPES, MAX_VIEWS } from '../activity';
import type { EventName } from '../activity';

export class RecordViewsDto {
  @ApiProperty({
    type: [String],
    description: `Від найстарішого до найновішого (один товар або список гостя після входу), до ${MAX_VIEWS}`,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_VIEWS)
  @IsUUID('all', { each: true })
  productIds!: string[];
}

export class FavouriteIdsDto {
  @ApiProperty({
    type: [String],
    description: 'Обране, найновіші першими — стан «серця» на картках',
  })
  productIds!: string[];
}

export class EventDto {
  @ApiProperty({ enum: EVENT_TYPES })
  @IsIn(EVENT_TYPES)
  type!: EventName;

  @ApiPropertyOptional() @IsOptional() @IsUUID() productId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() chainId?: string;

  @ApiPropertyOptional({ description: 'Пошуковий запит (search)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  query?: string;

  @ApiPropertyOptional({ description: 'Позиція в показаному списку, з 0' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  position?: number;

  @ApiPropertyOptional({ example: 'search', description: 'Який список' })
  @IsOptional()
  @Matches(/^[a-z0-9-]{1,40}$/)
  listId?: string;

  @ApiPropertyOptional({ example: 'UA' })
  @IsOptional()
  @Matches(/^[A-Z]{2}$/, { message: 'Код країни ISO: UA, DE…' })
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;
}

export class EventBatchDto {
  @ApiProperty({
    description: 'Сесія вебу (uuid), спільна для подій одного візиту',
  })
  @IsUUID()
  sessionId!: string;

  @ApiProperty({ type: [EventDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => EventDto)
  events!: EventDto[];
}

export class GuestEventBatchDto extends EventBatchDto {
  @ApiProperty({ description: 'Анонімний id гостя (cookie вебу)' })
  @IsUUID()
  anonId!: string;

  @ApiProperty({
    enum: [true],
    description: 'Гість погодився на збір подій (банер згоди)',
  })
  @Equals(true, { message: 'Події гостя — лише за згодою' })
  consent!: true;
}

export class RecordedDto {
  @ApiProperty({ description: 'Скільки подій записано (0 — немає згоди)' })
  recorded!: number;
}
