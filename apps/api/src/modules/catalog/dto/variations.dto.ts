import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { WORD_STATUSES } from '../matching/variation-words';

export class VariationWordDto {
  @ApiProperty({
    description: 'Нормалізоване слово, як у назвах для зіставлення',
  })
  word!: string;
  @ApiProperty({
    enum: WORD_STATUSES,
    description:
      'learned — вивчене з даних; added — додане вручну; removed — вимкнене вручну; candidate — замало доказів',
  })
  status!: string;
  @ApiProperty({ description: 'Чи впливає на зіставлення зараз' })
  active!: boolean;
  @ApiProperty({
    description:
      'Скільки разів слово — єдина відмінність двох карток однієї мережі',
  })
  contrast!: number;
  @ApiProperty({
    description: 'У скількох GTIN слово відрізняє назви того самого товару',
  })
  noise!: number;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'contrast / (contrast + noise); null — даних немає',
  })
  weight!: number | null;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ description: 'Активних карток з цим словом у назві' })
  listings!: number;
  @ApiProperty({ description: 'Товарів каталогу з такими картками' })
  products!: number;
  @ApiProperty({
    type: [String],
    description: 'До 3 товарів з цим словом (для перегляду)',
  })
  examples!: string[];
}

export class VariationCountsDto {
  @ApiProperty() learned!: number;
  @ApiProperty() added!: number;
  @ApiProperty() removed!: number;
  @ApiProperty() candidate!: number;
}

export class VariationPageDto {
  @ApiProperty({ type: [VariationWordDto] }) items!: VariationWordDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty({ type: VariationCountsDto }) counts!: VariationCountsDto;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Коли воркер востаннє вивчив словник; null — ще не вивчав',
  })
  builtAt!: string | null;
  @ApiProperty() minContrast!: number;
  @ApiProperty() minWeight!: number;
}

export class SetVariationDto {
  @ApiProperty({
    enum: ['ADD', 'REMOVE'],
    description: 'ADD — завжди варіація, REMOVE — ніколи',
  })
  @IsIn(['ADD', 'REMOVE'])
  action!: 'ADD' | 'REMOVE';
  @ApiPropertyOptional({ description: 'Чому (для інших модераторів)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
