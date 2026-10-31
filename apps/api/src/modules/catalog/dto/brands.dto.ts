import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength } from 'class-validator';

export class BrandDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'Ключ бренду в зіставленні (brandKey)' })
  slug!: string;
  @ApiProperty() products!: number;
  @ApiProperty({ description: 'Активних карток мереж у товарах бренду' })
  listings!: number;
  @ApiProperty({ type: [String] }) chains!: string[];
  @ApiProperty({ type: [String] }) countries!: string[];
  @ApiProperty({
    type: [String],
    description: 'Ключі обʼєднаних з ним брендів-дублікатів',
  })
  aliases!: string[];
}

export class BrandPageDto {
  @ApiProperty({ type: [BrandDto] }) items!: BrandDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class BrandRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() products!: number;
}

export class BrandDuplicateDto {
  @ApiProperty({
    type: BrandRefDto,
    description: 'Менший бренд — пропонується злити його в target',
  })
  source!: BrandRefDto;
  @ApiProperty({ type: BrandRefDto }) target!: BrandRefDto;
  @ApiProperty({ description: 'Схожість назв pg_trgm, 0..1' })
  similarity!: number;
}

export class RenameBrandDto {
  @ApiProperty({ description: 'Назва для показу; ключ не змінюється' })
  @IsString()
  @MaxLength(100)
  name!: string;
}

export class MergeBrandDto {
  @ApiProperty({ description: 'id основного бренду, у який зливається цей' })
  @IsUUID()
  into!: string;
}
