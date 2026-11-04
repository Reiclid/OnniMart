import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBooleanString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ListingSummaryDto } from '../../monitoring/dto/monitoring.dto';

export class PriceRangeDto {
  @ApiProperty() currency!: string;
  @ApiProperty() min!: number;
  @ApiProperty() max!: number;
  @ApiProperty({ description: 'Мережа з найнижчою ціною' }) minChain!: string;
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Звичайна ціна найдешевшої пропозиції, якщо вона зараз на акції',
  })
  minRegular!: number | null;
}

export class ProductIdsQueryDto {
  @ApiProperty({
    description:
      'Id товарів через кому, до 50 (історія переглядів гостя з localStorage)',
    example: 'b9a0…,c1d2…',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  ids!: string[];
}

export class ProductsQueryDto {
  @ApiPropertyOptional({
    description: 'Пошук за назвою, брендом або штрихкодом',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
  @ApiPropertyOptional({
    description: 'Лише товари, що продаються щонайменше у 2 мережах',
  })
  @IsOptional()
  @IsBooleanString()
  multiChain?: boolean;
  @ApiPropertyOptional({
    description: 'StoreChain.slug — лише товари цієї мережі',
  })
  @IsOptional()
  @Matches(/^[a-z0-9-]{2,60}$/, { message: 'slug мережі: a-z, 0-9, дефіс' })
  chain?: string;
  @ApiPropertyOptional({
    description:
      'ISO-код країни (UA, DE): без q — лише товари її мереж; з q (пошук) — вони першими, далі решта країн',
  })
  @IsOptional()
  @Matches(/^[A-Z]{2}$/, { message: 'код країни: дві великі латинські літери' })
  country?: string;
  @ApiPropertyOptional({ description: 'Category.slug: drinks, dairy-eggs…' })
  @IsOptional()
  @Matches(/^[a-z0-9-]{2,40}$/, { message: 'slug категорії: a-z, 0-9, дефіс' })
  category?: string;
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

export class ProductSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) brand!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Category.slug (підказки пошуку: «milk in Dairy & eggs»)',
  })
  category!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: '"Zero", "банан · 3,9%"',
  })
  variantLabel!: string | null;
  @ApiProperty({ type: String, nullable: true }) imageUrl!: string | null;
  @ApiProperty({
    type: [String],
    description:
      'Основне фото й запасні з інших карток (до 4), якщо воно не завантажиться',
  })
  images!: string[];
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
  @ApiProperty({ type: String, nullable: true, description: '"ПЕТ", "скло"' })
  packaging!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Фото фасування за замовчуванням (з його карток)',
  })
  imageUrl!: string | null;
  @ApiProperty({
    type: [String],
    description: 'Фото цього фасування без повторів (до 12): спершу основне',
  })
  images!: string[];
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

export class CategoryRefDto {
  @ApiProperty({ example: 'drinks' }) slug!: string;
  @ApiProperty({ example: 'Drinks' }) name!: string;
}

export class CategoryDto extends CategoryRefDto {
  @ApiProperty({ description: 'Товарів у категорії' }) productsCount!: number;
}

export class ProductDetailsDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) brand!: string | null;
  @ApiProperty({ type: String, nullable: true }) variantLabel!: string | null;
  @ApiProperty({ type: String, nullable: true }) imageUrl!: string | null;
  @ApiProperty({
    type: [String],
    description:
      'Фото всіх мереж без повторів (до 12): спершу фото товару, далі фасувань',
  })
  images!: string[];
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: CategoryRefDto, nullable: true })
  category!: CategoryRefDto | null;
  @ApiProperty({
    description: 'Категорію задав модератор, зіставлення її не змінює',
  })
  categoryLocked!: boolean;
  @ApiProperty({ type: ProductLineDto, nullable: true })
  line!: ProductLineDto | null;
  @ApiProperty({ type: [ProductVariantDto] }) variants!: ProductVariantDto[];
}

/** Правки модератора: відсутнє поле не змінюється, null або "" — очищує */
export class UpdateProductDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  name?: string;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 80 })
  @IsOptional()
  @IsString()
  brand?: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Смак / різновид у лінійці: "Zero", "Cherry"',
  })
  @IsOptional()
  @IsString()
  variantLabel?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @IsOptional()
  @IsString()
  description?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'http(s)' })
  @IsOptional()
  @IsString()
  imageUrl?: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Category.slug; null — категорію знову визначає зіставлення',
  })
  @IsOptional()
  @IsString()
  category?: string | null;
}

export class UpdateVariantDto {
  @ApiPropertyOptional({
    description: 'Фасування текстом: "0,5 л", "6 × 330 мл", "200 г", "на вагу"',
  })
  @IsOptional()
  @IsString()
  quantity?: string;
  @ApiPropertyOptional({
    description: 'Підпис; без нього при зміні фасування — автоматичний',
  })
  @IsOptional()
  @IsString()
  label?: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  packaging?: string | null;
}

export class AddBarcodeDto {
  @ApiProperty({
    example: '4820000000000',
    description: 'EAN-8/13, UPC-A, GTIN-14',
  })
  @IsString()
  gtin!: string;
}

/** Що знає Open Food Facts про штрихкод (коли товару ще немає в цінах) */
export class BarcodeFactsDto {
  @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @ApiProperty({ type: [String] }) brands!: string[];
  @ApiProperty({ type: String, nullable: true, description: '"1.5l"' })
  quantity!: string | null;
  @ApiProperty({ type: String, nullable: true }) imageUrl!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'a…e' })
  nutriscore!: string | null;
}

export class BarcodeLookupDto {
  @ApiProperty({ description: '14 цифр' }) gtin!: string;
  @ApiProperty({
    type: ProductSummaryDto,
    nullable: true,
    description: 'Товар каталогу з цим штрихкодом',
  })
  product!: ProductSummaryDto | null;
  @ApiProperty({ type: String, nullable: true }) variantId!: string | null;
  @ApiProperty({
    type: BarcodeFactsDto,
    nullable: true,
    description: 'Open Food Facts, якщо товар відомий там',
  })
  facts!: BarcodeFactsDto | null;
  @ApiProperty({
    type: [ProductSummaryDto],
    description: 'Схожі товари з цінами, коли штрихкоду в каталозі немає',
  })
  suggestions!: ProductSummaryDto[];
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
  @ApiProperty({ description: 'Картку тим часом зіставив хтось інший' })
  skipped!: number;
  @ApiProperty({ description: 'Помилки окремих карток' }) failed!: number;
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

/** PRD-27: кандидат OFF для фасування без штрихкоду мереж */
export class BarcodeCandidateDto {
  @ApiProperty() id!: string;
  @ApiProperty() gtin!: string;
  @ApiProperty({ description: 'Схожість 0..1' }) score!: number;
  @ApiProperty({ description: 'Як в OFF: «бренди · назва»' }) offName!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Мале фото з OFF, якщо є',
  })
  imageUrl!: string | null;
}

export class BarcodeReviewListingDto {
  @ApiProperty() chainName!: string;
  @ApiProperty() name!: string;
}

export class BarcodeReviewItemDto {
  @ApiProperty() variantId!: string;
  @ApiProperty() variantLabel!: string;
  @ApiProperty() productId!: string;
  @ApiProperty() productName!: string;
  @ApiProperty({ type: String, nullable: true }) brand!: string | null;
  @ApiProperty({ type: String, nullable: true }) imageUrl!: string | null;
  @ApiProperty({
    type: [String],
    description: 'Штрихкоди, які фасування вже має (у т. ч. щойно прийняті)',
  })
  barcodes!: string[];
  @ApiProperty({ type: [BarcodeReviewListingDto] })
  listings!: BarcodeReviewListingDto[];
  @ApiProperty({ type: [BarcodeCandidateDto] })
  candidates!: BarcodeCandidateDto[];
}

export class BarcodeReviewPageDto {
  @ApiProperty({ type: [BarcodeReviewItemDto] }) items!: BarcodeReviewItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

/** PRD-02: точка графіка ціни */
export class PricePointDto {
  @ApiProperty() at!: string;
  @ApiProperty() price!: number;
  @ApiProperty({
    description:
      'Справжнє спостереження (зміна ціни або останній огляд), а не край вікна',
  })
  observed!: boolean;
}

export class PriceSeriesDto {
  @ApiProperty() listingId!: string;
  @ApiProperty() chainName!: string;
  @ApiProperty() currency!: string;
  @ApiProperty({
    type: [PricePointDto],
    description:
      'Ціна на початок вікна, кожна зміна і ціна на останній огляд картки',
  })
  points!: PricePointDto[];
}

export class PriceStatsDto {
  @ApiProperty() currency!: string;
  @ApiProperty({ description: 'Найнижча поточна ціна серед мереж' })
  current!: number;
  @ApiProperty({ description: 'Найнижча ціна за 30 днів (Omnibus)' })
  low30!: number;
  @ApiProperty({ description: 'Середня поточна ціна серед мереж' })
  average!: number;
  @ApiProperty({
    description: '(найдорожча − найдешевша) / найдешевша серед мереж',
  })
  spread!: number;
  @ApiProperty({
    description:
      'Поточна найнижча ціна — найнижча вже стільки днів (або стільки днів історії, коли lowerSeen = false)',
  })
  lowestForDays!: number;
  @ApiProperty() lowerSeen!: boolean;
}

export class PriceHistoryDto {
  @ApiProperty() variantId!: string;
  @ApiProperty({ enum: [30, 90, 365] }) days!: number;
  @ApiProperty({ type: [PriceSeriesDto] }) series!: PriceSeriesDto[];
  @ApiProperty({ type: [PriceStatsDto] }) stats!: PriceStatsDto[];
}

/** Журнал рішень модераторів: картка мережі (для штрихкодів OFF — null) */
export class DecisionListingDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() chainName!: string;
  @ApiProperty({ type: String, nullable: true }) imageUrl!: string | null;
  @ApiProperty({ type: Number, nullable: true }) price!: number | null;
  @ApiProperty() currency!: string;
}

export class DecisionProductDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) brand!: string | null;
  @ApiProperty() variantLabel!: string;
  @ApiProperty({ type: String, nullable: true }) imageUrl!: string | null;
}

export class DecisionDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['match', 'barcode'] }) kind!: string;
  @ApiProperty({ enum: ['ACCEPTED', 'REJECTED'] }) status!: string;
  @ApiProperty({
    description: 'Відвʼязано на сторінці товару (а не відхилено в черзі)',
  })
  unlinked!: boolean;
  @ApiProperty() decidedAt!: string;
  @ApiProperty() score!: number;
  @ApiProperty({ type: DecisionListingDto, nullable: true })
  listing!: DecisionListingDto | null;
  @ApiProperty({
    type: DecisionProductDto,
    nullable: true,
    description: 'null — товар уже видалено',
  })
  product!: DecisionProductDto | null;
  @ApiProperty({ type: String, nullable: true }) gtin!: string | null;
  @ApiProperty({ type: String, nullable: true }) offName!: string | null;
}

export class DecisionPageDto {
  @ApiProperty({ type: [DecisionDto] }) items!: DecisionDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}
