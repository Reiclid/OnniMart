import { ApiProperty } from '@nestjs/swagger';

export class QualityItemDto {
  @ApiProperty() listingId!: string;
  @ApiProperty({ type: String, nullable: true }) productId!: string | null;
  @ApiProperty() chain!: string;
  @ApiProperty() name!: string;
  @ApiProperty({
    description:
      'Значення, через яке позначено: ціна за одиницю, розмір, відношення, знижка %',
  })
  value!: number;
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'З чим порівнювали: медіана групи, ціна в інших мережах, закреслена ціна',
  })
  reference!: number | null;
  @ApiProperty({ type: String, nullable: true }) group!: string | null;
}

export class QualityBoxDto {
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
  @ApiProperty() n!: number;
  @ApiProperty() p5!: number;
  @ApiProperty() q1!: number;
  @ApiProperty() median!: number;
  @ApiProperty() q3!: number;
  @ApiProperty() p95!: number;
  @ApiProperty({ type: [QualityItemDto] }) flagged!: QualityItemDto[];
}

export class QualityBinDto {
  @ApiProperty() from!: number;
  @ApiProperty() to!: number;
  @ApiProperty() count!: number;
}

export class UnitPriceSectionDto {
  @ApiProperty({ type: [QualityBoxDto] }) groups!: QualityBoxDto[];
  @ApiProperty({ type: [QualityItemDto] }) flagged!: QualityItemDto[];
  @ApiProperty() total!: number;
}

export class PackSizeSectionDto {
  @ApiProperty({ type: [QualityBoxDto] }) chains!: QualityBoxDto[];
  @ApiProperty({ type: [QualityItemDto] }) flagged!: QualityItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty({ description: 'Межа, г / мл' }) limit!: number;
}

export class VariantRatioSectionDto {
  @ApiProperty({ type: [QualityBinDto] }) bins!: QualityBinDto[];
  @ApiProperty({ type: [QualityItemDto] }) flagged!: QualityItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty({ description: 'Карток, які було з чим порівняти' })
  compared!: number;
  @ApiProperty() limit!: number;
}

export class DiscountSectionDto {
  @ApiProperty({ type: [QualityBoxDto] }) chains!: QualityBoxDto[];
  @ApiProperty() total!: number;
  @ApiProperty({ description: 'Межа, %' }) limit!: number;
}

export class ScatterGroupDto {
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
  @ApiProperty() outliers!: number;
}

export class ScatterPointDto {
  @ApiProperty() listingId!: string;
  @ApiProperty() chain!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'Розмір упаковки, г / мл / шт' }) size!: number;
  @ApiProperty({ description: 'Ціна за кг / л / шт' }) unit!: number;
  @ApiProperty() outlier!: boolean;
}

export class FitDto {
  @ApiProperty() slope!: number;
  @ApiProperty() intercept!: number;
}

export class ScatterSectionDto {
  @ApiProperty({ type: [ScatterGroupDto] }) groups!: ScatterGroupDto[];
  @ApiProperty({ type: String, nullable: true }) group!: string | null;
  @ApiProperty({ type: FitDto, nullable: true }) fit!: FitDto | null;
  @ApiProperty({ type: [ScatterPointDto] }) points!: ScatterPointDto[];
}

export class CompletenessDto {
  @ApiProperty() chain!: string;
  @ApiProperty() listings!: number;
  @ApiProperty({ description: '%' }) noUnitPrice!: number;
  @ApiProperty({ description: '%' }) noQuantity!: number;
  @ApiProperty({ description: '%' }) noCategory!: number;
  @ApiProperty({ description: '%, без фасування в каталозі' })
  unmatched!: number;
}

export class PriceJumpDto {
  @ApiProperty() listingId!: string;
  @ApiProperty({ type: String, nullable: true }) productId!: string | null;
  @ApiProperty() chain!: string;
  @ApiProperty() name!: string;
  @ApiProperty() prev!: number;
  @ApiProperty() price!: number;
  @ApiProperty() at!: string;
}

export class DuplicateListingDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class DuplicateDto {
  @ApiProperty() variantId!: string;
  @ApiProperty() productId!: string;
  @ApiProperty() product!: string;
  @ApiProperty() chain!: string;
  @ApiProperty({ type: [DuplicateListingDto] })
  listings!: DuplicateListingDto[];
}

export class QualityChainDto {
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty() country!: string;
}

export class ChainFreshnessDto {
  @ApiProperty() chain!: string;
  @ApiProperty() name!: string;
  @ApiProperty() country!: string;
  @ApiProperty() active!: number;
  @ApiProperty() older2d!: number;
  @ApiProperty() older7d!: number;
  @ApiProperty() stale!: number;
  @ApiProperty({ type: String, nullable: true }) lastRunAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) lastRunStatus!: string | null;
  @ApiProperty({ type: String, nullable: true }) lastFullAt!: string | null;
  @ApiProperty({ type: Number, nullable: true }) lastFullSeen!: number | null;
  @ApiProperty({
    type: [String],
    description: 'Що не так; порожньо — усе гаразд',
  })
  problems!: string[];
}

export class QualityReportDto {
  @ApiProperty() generatedAt!: string;
  @ApiProperty({ description: 'Активних карток у наявності з ціною' })
  analysed!: number;
  @ApiProperty({ type: [QualityChainDto] }) chains!: QualityChainDto[];
  @ApiProperty({ type: UnitPriceSectionDto }) unitPrice!: UnitPriceSectionDto;
  @ApiProperty({ type: PackSizeSectionDto }) packSize!: PackSizeSectionDto;
  @ApiProperty({ type: VariantRatioSectionDto })
  variantRatio!: VariantRatioSectionDto;
  @ApiProperty({ type: DiscountSectionDto }) discount!: DiscountSectionDto;
  @ApiProperty({ type: ScatterSectionDto }) scatter!: ScatterSectionDto;
  @ApiProperty({ type: [CompletenessDto] }) completeness!: CompletenessDto[];
  @ApiProperty({ type: [PriceJumpDto] }) jumps!: PriceJumpDto[];
  @ApiProperty({ type: [DuplicateDto] }) duplicates!: DuplicateDto[];
  @ApiProperty({ type: [ChainFreshnessDto] }) freshness!: ChainFreshnessDto[];
}
