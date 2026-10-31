import { MutationLimit } from '../../common/throttle';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { PriceHistoryService } from './price-history.service';
import {
  AddBarcodeDto,
  BarcodeLookupDto,
  BarcodeReviewPageDto,
  DecisionPageDto,
  PriceHistoryDto,
  MatchingStatusDto,
  ProductDetailsDto,
  ProductIdsQueryDto,
  ProductPageDto,
  ProductsQueryDto,
  ReviewPageDto,
  RunMatchingResponseDto,
  CategoryDto,
  ProductSummaryDto,
  UpdateProductDto,
  UpdateVariantDto,
} from './dto/catalog.dto';
import { ProductEditService } from './product-edit.service';
import { MatchingClient } from './matching/matching.client';
import { BarcodeReviewService } from './matching/barcode-review.service';
import { DecisionsService } from './matching/decisions.service';
import { ModerationService } from './matching/moderation.service';
import { VariationsService } from './matching/variations.service';
import { BrandsService } from './brands.service';
import {
  BrandDuplicateDto,
  BrandPageDto,
  MergeBrandDto,
  RenameBrandDto,
} from './dto/brands.dto';
import { SetVariationDto, VariationPageDto } from './dto/variations.dto';
import { RulesService } from './matching/rules.service';
import {
  MatchingRulesDto,
  RuleHitPageDto,
  SetMatchingRuleDto,
} from './dto/rules.dto';

@ApiTags('catalog')
@Controller('api/v1')
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly prices: PriceHistoryService,
    private readonly edits: ProductEditService,
  ) {}

  @MutationLimit()
  @ApiBearerAuth()
  @ApiResponse({ status: 401, description: 'Потрібен токен адміністратора' })
  @Patch('products/:id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Виправити характеристики товару (назва, бренд, категорія, фото…)',
    operationId: 'updateProduct',
  })
  @ApiResponse({ status: 204 })
  async updateProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateProductDto,
  ): Promise<void> {
    await this.edits.updateProduct(id, { ...body });
  }

  @MutationLimit()
  @ApiBearerAuth()
  @ApiResponse({ status: 401, description: 'Потрібен токен адміністратора' })
  @Patch('variants/:id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Виправити фасування: кількість, підпис, упаковку',
    operationId: 'updateVariant',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 409, description: 'Таке фасування в товару вже є' })
  async updateVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateVariantDto,
  ): Promise<void> {
    await this.edits.updateVariant(id, { ...body });
  }

  @MutationLimit()
  @ApiBearerAuth()
  @ApiResponse({ status: 401, description: 'Потрібен токен адміністратора' })
  @Post('variants/:id/barcodes')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Додати штрихкод фасуванню вручну',
    operationId: 'addVariantBarcode',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 409, description: 'Штрихкод належить іншому товару' })
  async addBarcode(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AddBarcodeDto,
  ): Promise<void> {
    await this.edits.addBarcode(id, body?.gtin);
  }

  @MutationLimit()
  @ApiBearerAuth()
  @ApiResponse({ status: 401, description: 'Потрібен токен адміністратора' })
  @Delete('variants/:id/barcodes/:gtin')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Прибрати помилковий штрихкод з фасування',
    operationId: 'removeVariantBarcode',
  })
  @ApiResponse({ status: 204 })
  async removeBarcode(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('gtin') gtin: string,
  ): Promise<void> {
    await this.edits.removeBarcode(id, gtin);
  }

  @Get('products')
  @ApiOperation({
    summary: 'Товари каталогу з цінами мереж',
    operationId: 'getProducts',
  })
  @ApiResponse({ status: 200, type: ProductPageDto })
  getProducts(@Query() query: ProductsQueryDto): Promise<ProductPageDto> {
    return this.catalog.getProducts(query);
  }

  @Get('products/by-ids')
  @ApiOperation({
    summary: 'Картки товарів у заданому порядку (нещодавно переглянуті гостя)',
    operationId: 'getProductsByIds',
  })
  @ApiResponse({ status: 200, type: [ProductSummaryDto] })
  getByIds(@Query() query: ProductIdsQueryDto): Promise<ProductSummaryDto[]> {
    return this.catalog.summaries(query.ids);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Категорії каталогу', operationId: 'getCategories' })
  @ApiResponse({ status: 200, type: [CategoryDto] })
  getCategories(): Promise<CategoryDto[]> {
    return this.catalog.getCategories();
  }

  @Get('products/:id')
  @ApiOperation({
    summary: 'Товар: фасування × мережі, лінійка смаків',
    operationId: 'getProduct',
  })
  @ApiResponse({ status: 200, type: ProductDetailsDto })
  getProduct(@Param('id') id: string): Promise<ProductDetailsDto> {
    return this.catalog.getProduct(id);
  }

  @Get('products/:id/similar')
  @ApiOperation({
    summary: 'Схожі товари (аналоги) з тієї самої категорії',
    operationId: 'getSimilarProducts',
  })
  @ApiResponse({ status: 200, type: [ProductSummaryDto] })
  getSimilar(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProductSummaryDto[]> {
    return this.catalog.getSimilar(id);
  }

  @Get('products/:id/prices')
  @ApiOperation({
    summary:
      'Історія цін фасування по мережах і статистика: 30-денний мінімум, розкид, «найнижча за N днів»',
    operationId: 'getPriceHistory',
  })
  @ApiQuery({ name: 'variantId', required: true, type: String })
  @ApiQuery({ name: 'days', required: false, enum: [30, 90, 365] })
  @ApiResponse({ status: 200, type: PriceHistoryDto })
  getPriceHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('variantId', ParseUUIDPipe) variantId: string,
    @Query('days') days?: number,
  ): Promise<PriceHistoryDto> {
    return this.prices.history(id, variantId, days);
  }

  @Get('barcodes/:gtin')
  @ApiOperation({
    summary: 'Пошук товару за штрихкодом (сканер)',
    operationId: 'lookupBarcode',
  })
  @ApiResponse({
    status: 200,
    type: BarcodeLookupDto,
    description:
      'Товар каталогу; якщо його немає — дані Open Food Facts і схожі товари з цінами. 400 — некоректний штрихкод',
  })
  lookupBarcode(@Param('gtin') gtin: string): Promise<BarcodeLookupDto> {
    return this.catalog.lookupBarcode(gtin);
  }
}

@ApiTags('matching')
@Controller('api/v1/matching')
export class MatchingController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly matching: MatchingClient,
    private readonly moderation: ModerationService,
    private readonly barcodes: BarcodeReviewService,
    private readonly decisions: DecisionsService,
  ) {}

  @Get('status')
  @ApiOperation({
    summary: 'Стан зіставлення: каталог, черга модерації, останній запуск',
    operationId: 'getMatchingStatus',
  })
  @ApiResponse({ status: 200, type: MatchingStatusDto })
  getStatus(): Promise<MatchingStatusDto> {
    return this.catalog.getMatchingStatus();
  }

  @MutationLimit()
  @ApiBearerAuth()
  @ApiResponse({ status: 401, description: 'Потрібен токен адміністратора' })
  @Post('run')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Запустити зіставлення незіставлених карток (у фоні)',
    operationId: 'runMatching',
  })
  @ApiResponse({ status: 202, type: RunMatchingResponseDto })
  async run(): Promise<RunMatchingResponseDto> {
    const { running } = await this.matching.state();
    await this.matching.request();
    return { started: !running };
  }

  @Get('review')
  @ApiOperation({
    summary: 'Черга модерації: картки з кандидатами 0,70–0,90',
    operationId: 'getReviewQueue',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiResponse({ status: 200, type: ReviewPageDto })
  getReview(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ): Promise<ReviewPageDto> {
    return this.catalog.getReviewQueue(page, pageSize);
  }

  @MutationLimit()
  @ApiBearerAuth()
  @ApiResponse({ status: 401, description: 'Потрібен токен адміністратора' })
  @Post('candidates/:id/accept')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Підтвердити кандидата: це той самий товар',
    operationId: 'acceptCandidate',
  })
  @ApiResponse({ status: 204 })
  async accept(@Param('id') id: string): Promise<void> {
    await this.moderation.acceptCandidate(id);
  }

  @MutationLimit()
  @ApiBearerAuth()
  @ApiResponse({ status: 401, description: 'Потрібен токен адміністратора' })
  @Post('listings/:id/reject')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Відхилити всіх кандидатів: картка стане окремим товаром',
    operationId: 'rejectCandidates',
  })
  @ApiResponse({ status: 204 })
  async reject(@Param('id') id: string): Promise<void> {
    await this.moderation.rejectCandidates(id);
  }

  @Get('decisions')
  @ApiOperation({
    summary:
      'Журнал рішень модераторів (зіставлення або штрихкоди OFF), найновіші першими',
    operationId: 'getDecisions',
  })
  @ApiQuery({ name: 'kind', required: false, enum: ['match', 'barcode'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiResponse({ status: 200, type: DecisionPageDto })
  getDecisions(
    @Query('kind') kind?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ): Promise<DecisionPageDto> {
    return this.decisions.list(
      kind === 'barcode' ? 'barcode' : 'match',
      page,
      pageSize,
    );
  }

  @MutationLimit()
  @ApiBearerAuth()
  @ApiResponse({ status: 401, description: 'Потрібен токен адміністратора' })
  @Post('decisions/:id/undo')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Скасувати рішення модератора: картка (або фасування для штрихкодів OFF) повертається в чергу',
    operationId: 'undoDecision',
  })
  @ApiQuery({ name: 'kind', required: false, enum: ['match', 'barcode'] })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 409, description: 'Рішення вже неактуальне' })
  async undoDecision(
    @Param('id') id: string,
    @Query('kind') kind?: string,
  ): Promise<void> {
    if (kind === 'barcode') await this.decisions.undoBarcode(id);
    else await this.decisions.undoMatch(id);
  }

  @Get('barcodes')
  @ApiOperation({
    summary:
      'Черга штрихкодів (PRD-27): фасування без штрихкоду мереж і сумнівні товари Open Food Facts',
    operationId: 'getBarcodeReviewQueue',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiResponse({ status: 200, type: BarcodeReviewPageDto })
  getBarcodeReview(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ): Promise<BarcodeReviewPageDto> {
    return this.barcodes.queue(page, pageSize);
  }

  @MutationLimit()
  @ApiBearerAuth()
  @ApiResponse({ status: 401, description: 'Потрібен токен адміністратора' })
  @Post('barcode-candidates/:id/accept')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Підтвердити GTIN з Open Food Facts для фасування',
    operationId: 'acceptBarcodeCandidate',
  })
  @ApiResponse({ status: 204 })
  async acceptBarcode(@Param('id') id: string): Promise<void> {
    await this.barcodes.accept(id);
  }

  @MutationLimit()
  @ApiBearerAuth()
  @ApiResponse({ status: 401, description: 'Потрібен токен адміністратора' })
  @Post('variants/:id/barcode-candidates/reject')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Відхилити всіх кандидатів OFF для фасування',
    operationId: 'rejectBarcodeCandidates',
  })
  @ApiResponse({ status: 204 })
  async rejectBarcodes(@Param('id') id: string): Promise<void> {
    await this.barcodes.reject(id);
  }

  @MutationLimit()
  @ApiBearerAuth()
  @ApiResponse({ status: 401, description: 'Потрібен токен адміністратора' })
  @Post('listings/:id/unlink')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Відвʼязати помилково зіставлену картку і зіставити заново',
    operationId: 'unlinkListing',
  })
  @ApiResponse({ status: 204 })
  async unlink(@Param('id') id: string): Promise<void> {
    await this.moderation.unlink(id);
  }
}

@ApiTags('matching')
@Controller('api/v1/matching/rules')
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  @Get()
  @ApiOperation({
    summary:
      'Правила зіставлення: увімкнені чи ні і скільки карток кожне зачепило за 30 днів',
    operationId: 'getMatchingRules',
  })
  @ApiResponse({ status: 200, type: MatchingRulesDto })
  list(): Promise<MatchingRulesDto> {
    return this.rules.list();
  }

  @Get(':key/hits')
  @ApiOperation({
    summary: 'Картки, на рішення про які вплинуло правило (нові спершу)',
    operationId: 'getMatchingRuleHits',
  })
  @ApiQuery({
    name: 'decision',
    required: false,
    enum: ['barcode', 'fuzzy', 'review', 'variant', 'product'],
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiResponse({ status: 200, type: RuleHitPageDto })
  @ApiResponse({ status: 404, description: 'Невідоме правило' })
  hits(
    @Param('key') key: string,
    @Query('decision') decision?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ): Promise<RuleHitPageDto> {
    return this.rules.hits(key, { decision, page, pageSize });
  }

  @MutationLimit()
  @ApiBearerAuth()
  @ApiResponse({ status: 401, description: 'Потрібен токен адміністратора' })
  @Put(':key')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Увімкнути або вимкнути правило (діє з наступного пакета)',
    operationId: 'setMatchingRule',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'Невідоме правило' })
  async set(
    @Param('key') key: string,
    @Body() body: SetMatchingRuleDto,
  ): Promise<void> {
    await this.rules.set(key, body.enabled);
  }
}

@ApiTags('matching')
@Controller('api/v1/variations')
export class VariationsController {
  constructor(private readonly variations: VariationsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Слова варіацій (PRD-30): вивчені, кандидати й ручні рішення, зі статистикою карток і товарів',
    operationId: 'getVariations',
  })
  @ApiQuery({
    name: 'filter',
    required: false,
    enum: ['active', 'all', 'learned', 'added', 'removed', 'candidate'],
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: ['products', 'contrast', 'weight', 'word'],
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiResponse({ status: 200, type: VariationPageDto })
  list(
    @Query('filter') filter?: string,
    @Query('sort') sort?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ): Promise<VariationPageDto> {
    return this.variations.list({ filter, sort, search, page, pageSize });
  }

  @MutationLimit()
  @ApiBearerAuth()
  @ApiResponse({ status: 401, description: 'Потрібен токен адміністратора' })
  @Put(':word')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Ручне рішення про слово: ADD — завжди варіація, REMOVE — ніколи (діє з наступного пакета)',
    operationId: 'setVariation',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 400, description: 'Не одне слово або число' })
  async set(
    @Param('word') word: string,
    @Body() body: SetVariationDto,
  ): Promise<void> {
    await this.variations.set(word, body);
  }

  @MutationLimit()
  @ApiBearerAuth()
  @ApiResponse({ status: 401, description: 'Потрібен токен адміністратора' })
  @Delete(':word')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Скасувати ручне рішення: слово знову вирішують дані',
    operationId: 'resetVariation',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'Ручного рішення немає' })
  async reset(@Param('word') word: string): Promise<void> {
    await this.variations.remove(word);
  }
}

@ApiTags('catalog')
@Controller('api/v1/brands')
export class BrandsController {
  constructor(private readonly brands: BrandsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Словник брендів: товари, картки, мережі й обʼєднані дублікати кожного бренду',
    operationId: 'getBrands',
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sort', required: false, enum: ['products', 'name'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiResponse({ status: 200, type: BrandPageDto })
  list(
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ): Promise<BrandPageDto> {
    return this.brands.list({ search, sort, page, pageSize });
  }

  @Get('duplicates')
  @ApiOperation({
    summary:
      'Можливі дублікати брендів (схожі назви); злиття вирішує модератор',
    operationId: 'getBrandDuplicates',
  })
  @ApiResponse({ status: 200, type: [BrandDuplicateDto] })
  duplicates(): Promise<BrandDuplicateDto[]> {
    return this.brands.duplicates();
  }

  @MutationLimit()
  @ApiBearerAuth()
  @ApiResponse({ status: 401, description: 'Потрібен токен адміністратора' })
  @Patch(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Перейменувати бренд (назва для показу; ключ не змінюється)',
    operationId: 'renameBrand',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'Бренд не знайдено' })
  async rename(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RenameBrandDto,
  ): Promise<void> {
    await this.brands.rename(id, body.name);
  }

  @MutationLimit()
  @ApiBearerAuth()
  @ApiResponse({ status: 401, description: 'Потрібен токен адміністратора' })
  @Post(':id/merge')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Злити бренд-дублікат в основний: товари й лінійки переходять, ключ дубліката стає аліасом (не скасовується)',
    operationId: 'mergeBrand',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'Бренд не знайдено' })
  async merge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MergeBrandDto,
  ): Promise<void> {
    await this.brands.merge(id, body.into);
  }
}
