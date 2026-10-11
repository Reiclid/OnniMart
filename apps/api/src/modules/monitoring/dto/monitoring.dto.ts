import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StatsDto {
  @ApiProperty() chains!: number;
  @ApiProperty() enabledChains!: number;
  @ApiProperty({ description: 'Картки товарів у мережах' }) listings!: number;
  @ApiProperty({ description: 'Картки, зіставлені з каталогом' })
  matchedListings!: number;
  @ApiProperty({ description: 'Картки з активною акцією' })
  promoListings!: number;
  @ApiProperty({ description: 'Записи історії цін' }) priceSnapshots!: number;
  @ApiProperty({ description: 'Картки зі штрихкодом' })
  listingsWithBarcode!: number;
  @ApiProperty({ type: String, nullable: true }) lastRunAt!: string | null;
}

export class ScrapeRunDto {
  @ApiProperty() id!: string;
  @ApiProperty() chainSlug!: string;
  @ApiProperty() chainName!: string;
  @ApiProperty({ enum: ['QUEUED', 'RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED'] })
  status!: string;
  @ApiProperty() trigger!: string;
  @ApiProperty() startedAt!: string;
  @ApiProperty({ type: String, nullable: true }) finishedAt!: string | null;
  @ApiProperty() pagesFetched!: number;
  @ApiProperty() itemsSeen!: number;
  @ApiProperty() itemsChanged!: number;
  @ApiProperty({ type: String, nullable: true }) error!: string | null;
}

export class ChainSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty() website!: string;
  @ApiProperty() countryCode!: string;
  @ApiProperty() currency!: string;
  @ApiProperty() scrapeEnabled!: boolean;
  @ApiProperty() listingsCount!: number;
  @ApiProperty() promoCount!: number;
  @ApiProperty({ type: ScrapeRunDto, nullable: true })
  lastRun!: ScrapeRunDto | null;
}

export class ListingsQueryDto {
  @ApiPropertyOptional({ description: 'StoreChain.slug' }) chain?: string;
  @ApiPropertyOptional({ description: 'Пошук за назвою або штрихкодом' })
  q?: string;
  @ApiPropertyOptional({ description: 'Лише товари з акцією' })
  promo?: boolean;
  @ApiPropertyOptional({ description: 'Лише зіставлені з каталогом' })
  matched?: boolean;
  @ApiPropertyOptional({ default: 1 }) page?: number;
  @ApiPropertyOptional({ default: 50, maximum: 200 }) pageSize?: number;
}

export class ListingSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() chainSlug!: string;
  @ApiProperty() chainName!: string;
  @ApiProperty() currency!: string;
  @ApiProperty() externalId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) brand!: string | null;
  @ApiProperty({ type: String, nullable: true }) category!: string | null;
  @ApiProperty({ type: String, nullable: true }) url!: string | null;
  @ApiProperty({ type: String, nullable: true }) imageUrl!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: '"0,5 л", "6 × 0,33 л"',
  })
  quantityLabel!: string | null;
  @ApiProperty({ type: Number, nullable: true }) currentPrice!: number | null;
  @ApiProperty({ type: Number, nullable: true }) regularPrice!: number | null;
  @ApiProperty({ type: Number, nullable: true }) unitPrice!: number | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: '"кг", "л" або "шт"',
  })
  unitLabel!: string | null;
  @ApiProperty() isOnPromo!: boolean;
  @ApiProperty() inStock!: boolean;
  @ApiProperty({ enum: ['PENDING', 'AUTO_MATCHED', 'CONFIRMED', 'REJECTED'] })
  matchStatus!: string;
  @ApiProperty({ type: [String] }) barcodes!: string[];
  @ApiProperty() lastSeenAt!: string;
}

export class ListingPageDto {
  @ApiProperty({ type: [ListingSummaryDto] }) items!: ListingSummaryDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class PriceSnapshotDto {
  @ApiProperty() id!: string;
  @ApiProperty() price!: number;
  @ApiProperty({ type: Number, nullable: true }) regularPrice!: number | null;
  @ApiProperty({ type: Number, nullable: true }) unitPrice!: number | null;
  @ApiProperty({ type: String, nullable: true }) promoType!: string | null;
  @ApiProperty({ type: String, nullable: true }) promoLabel!: string | null;
  @ApiProperty({ type: String, nullable: true }) promoEndsAt!: string | null;
  @ApiProperty() inStock!: boolean;
  @ApiProperty() capturedAt!: string;
}

export class MatchedVariantDto {
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
  @ApiProperty() productName!: string;
}

export class ListingDetailsDto extends ListingSummaryDto {
  @ApiProperty() firstSeenAt!: string;
  @ApiProperty({ type: MatchedVariantDto, nullable: true })
  variant!: MatchedVariantDto | null;
  @ApiProperty({ type: [PriceSnapshotDto] }) history!: PriceSnapshotDto[];
  @ApiProperty({
    type: [ListingSummaryDto],
    description:
      'Картки з тим самим штрихкодом в інших мережах, дешевші першими',
  })
  sameBarcode!: ListingSummaryDto[];
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Сирі дані парсера',
  })
  rawData!: Record<string, unknown> | null;
}
