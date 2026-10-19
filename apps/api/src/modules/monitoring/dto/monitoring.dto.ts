import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

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
  @ApiProperty({
    description: 'Товарів, які не вдалося обробити (dead-letter)',
  })
  itemsFailed!: number;
  @ApiProperty({ type: String, nullable: true }) error!: string | null;
}

export const CHAIN_STATUSES = [
  'ACTIVE',
  'PAUSED',
  'CANDIDATE',
  'RULED_OUT',
] as const;
export type ChainStatus = (typeof CHAIN_STATUSES)[number];

export class ChainSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty() website!: string;
  @ApiProperty() countryCode!: string;
  @ApiProperty() currency!: string;
  @ApiProperty() scrapeEnabled!: boolean;
  @ApiProperty({
    enum: CHAIN_STATUSES,
    description:
      'ACTIVE — парсер працює; PAUSED — вимкнено; CANDIDATE — не перевірено; RULED_OUT — не парситься',
  })
  status!: ChainStatus;
  @ApiProperty({
    enum: ['FULL', 'PARTIAL', 'UNKNOWN'],
    description: 'Ціни онлайн: увесь асортимент, лише акції/магазин, невідомо',
  })
  onlinePrices!: string;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty() listingsCount!: number;
  @ApiProperty() promoCount!: number;
  @ApiProperty({ type: ScrapeRunDto, nullable: true })
  lastRun!: ScrapeRunDto | null;
}

export class ListingsQueryDto {
  @ApiPropertyOptional({ description: 'StoreChain.slug' })
  @IsOptional()
  @Matches(/^[a-z0-9-]{2,60}$/, { message: 'slug мережі: a-z, 0-9, дефіс' })
  chain?: string;
  @ApiPropertyOptional({ description: 'Пошук за назвою або штрихкодом' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
  @ApiPropertyOptional({ description: 'Лише товари з акцією' })
  @IsOptional()
  @IsBooleanString()
  promo?: boolean;
  @ApiPropertyOptional({ description: 'Лише зіставлені з каталогом' })
  @IsOptional()
  @IsBooleanString()
  matched?: boolean;
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page?: number;
  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
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
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Коли картка зникла з сайту мережі (немає в повному обході); null — актуальна',
  })
  delistedAt!: string | null;
  @ApiProperty({ enum: ['PENDING', 'AUTO_MATCHED', 'CONFIRMED', 'REJECTED'] })
  matchStatus!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['BARCODE', 'FUZZY', 'MANUAL', 'CREATED'],
  })
  matchMethod!: string | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Впевненість 0..1',
  })
  matchScore!: number | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Товар каталогу, з яким зіставлено картку',
  })
  productId!: string | null;
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
  @ApiProperty() productId!: string;
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
      'Той самий товар в інших мережах: те саме фасування каталогу або спільний штрихкод',
  })
  otherOffers!: ListingSummaryDto[];
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Сирі дані парсера',
  })
  rawData!: Record<string, unknown> | null;
}
