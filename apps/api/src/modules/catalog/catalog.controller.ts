import { MutationLimit } from '../../common/throttle';
import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
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
  BarcodeLookupDto,
  BarcodeReviewPageDto,
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
} from './dto/catalog.dto';
import { MatchingClient } from './matching/matching.client';
import { BarcodeReviewService } from './matching/barcode-review.service';
import { ModerationService } from './matching/moderation.service';

@ApiTags('catalog')
@Controller('api/v1')
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly prices: PriceHistoryService,
  ) {}

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
