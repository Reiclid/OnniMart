import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ListingSummaryDto } from '../../monitoring/dto/monitoring.dto';

export class PriceRangeDto {
  @ApiProperty() currency!: string;
  @ApiProperty() min!: number;
  @ApiProperty() max!: number;
}

export class ProductsQueryDto {
  @ApiPropertyOptional({
    description: 'Пошук за назвою, брендом або штрихкодом',
  })
  q?: string;
  @ApiPropertyOptional({
    description: 'Лише товари, що продаються щонайменше у 2 мережах',
  })
  multiChain?: boolean;
  @ApiPropertyOptional({
    description: 'StoreChain.slug — лише товари цієї мережі',
  })
  chain?: string;
  @ApiPropertyOptional({ default: 1 }) page?: number;
  @ApiPropertyOptional({ default: 50, maximum: 200 }) pageSize?: number;
}

export class ProductSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) brand!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: '"Zero", "банан · 3,9%"',
  })
  variantLabel!: string | null;
  @ApiProperty({ type: String, nullable: true }) imageUrl!: string | null;
  @ApiProperty({ description: 'Скільки фасувань' }) variantsCount!: number;
  @ApiProperty({ description: 'У скількох мережах продається' })
  chainsCount!: number;
  @ApiProperty({ description: 'Скільки карток мереж зіставлено' })
  listingsCount!: number;
  @ApiProperty({ type: [String] }) chains!: string[];
  @ApiProperty({ type: [PriceRangeDto] }) prices!: PriceRangeDto[];
  @ApiProperty({ description: 'Є акція хоча б в одній мережі' })
  onPromo!: boolean;
}

export class ProductPageDto {
  @ApiProperty({ type: [ProductSummaryDto] }) items!: ProductSummaryDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class ProductVariantDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: '"0,5 л", "6 × 0,33 л"' }) label!: string;
  @ApiProperty({ type: [String] }) barcodes!: string[];
  @ApiProperty({
    type: [ListingSummaryDto],
    description: 'Пропозиції мереж, від найдешевшої за одиницю',
  })
  offers!: ListingSummaryDto[];
}

export class LineProductDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) variantLabel!: string | null;
}

export class ProductLineDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({
    type: [LineProductDto],
    description: 'Інші смаки / різновиди лінійки',
  })
  products!: LineProductDto[];
}

export class ProductDetailsDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) brand!: string | null;
  @ApiProperty({ type: String, nullable: true }) variantLabel!: string | null;
  @ApiProperty({ type: String, nullable: true }) imageUrl!: string | null;
  @ApiProperty({ type: ProductLineDto, nullable: true })
  line!: ProductLineDto | null;
  @ApiProperty({ type: [ProductVariantDto] }) variants!: ProductVariantDto[];
}

export class BarcodeLookupDto {
  @ApiProperty() gtin!: string;
  @ApiProperty() productId!: string;
  @ApiProperty() variantId!: string;
}

// ---------- Зіставлення та модерація ----------

export class MatchReportDto {
  @ApiProperty() startedAt!: string;
  @ApiProperty() finishedAt!: string;
  @ApiProperty() processed!: number;
  @ApiProperty() byBarcode!: number;
  @ApiProperty() fuzzy!: number;
  @ApiProperty() review!: number;
  @ApiProperty() newVariants!: number;
  @ApiProperty() newProducts!: number;
}

export class MatchMethodCountDto {
  @ApiProperty({ enum: ['BARCODE', 'FUZZY', 'MANUAL', 'CREATED'] })
  method!: string;
  @ApiProperty() count!: number;
}

export class MatchingStatusDto {
  @ApiProperty() running!: boolean;
  @ApiProperty({ type: MatchReportDto, nullable: true })
  lastReport!: MatchReportDto | null;
  @ApiProperty({ description: 'Товарів у каталозі' }) products!: number;
  @ApiProperty({
    description: 'Фасувань, що продаються щонайменше у 2 мережах',
  })
  multiChainVariants!: number;
  @ApiProperty({ description: 'Карток, ще не зіставлених і не на модерації' })
  unmatched!: number;
  @ApiProperty({ description: 'Карток у черзі модерації' }) inReview!: number;
  @ApiProperty({ type: [MatchMethodCountDto] })
  byMethod!: MatchMethodCountDto[];
}

export class RunMatchingResponseDto {
  @ApiProperty({
    description: 'false — зіставлення вже йде, його повторять після завершення',
  })
  started!: boolean;
}

export class CandidateOfferDto {
  @ApiProperty() chainName!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: Number, nullable: true }) price!: number | null;
  @ApiProperty() currency!: string;
}

export class MatchCandidateDto {
  @ApiProperty() id!: string;
  @ApiProperty() score!: number;
  @ApiProperty({ type: Number, nullable: true, description: 'Схожість назв' })
  nameScore!: number | null;
  @ApiProperty({ description: 'Штрихкоди картки й фасування різні' })
  barcodeMismatch!: boolean;
  @ApiProperty() variantId!: string;
  @ApiProperty() variantLabel!: string;
  @ApiProperty() productId!: string;
  @ApiProperty() productName!: string;
  @ApiProperty({ type: String, nullable: true }) brand!: string | null;
  @ApiProperty({ type: String, nullable: true }) imageUrl!: string | null;
  @ApiProperty({ type: [CandidateOfferDto] }) offers!: CandidateOfferDto[];
}

export class ReviewItemDto {
  @ApiProperty({ type: ListingSummaryDto }) listing!: ListingSummaryDto;
  @ApiProperty({ type: [MatchCandidateDto] }) candidates!: MatchCandidateDto[];
}

export class ReviewPageDto {
  @ApiProperty({ type: [ReviewItemDto] }) items!: ReviewItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}
