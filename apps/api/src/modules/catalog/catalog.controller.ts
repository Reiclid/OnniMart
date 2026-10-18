import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import {
  BarcodeLookupDto,
  MatchingStatusDto,
  ProductDetailsDto,
  ProductPageDto,
  ProductsQueryDto,
  ReviewPageDto,
  RunMatchingResponseDto,
} from './dto/catalog.dto';
import { MatchingClient } from './matching/matching.client';
import { ModerationService } from './matching/moderation.service';

@ApiTags('catalog')
@Controller('api/v1')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('products')
  @ApiOperation({
    summary: 'Товари каталогу з цінами мереж',
    operationId: 'getProducts',
  })
  @ApiResponse({ status: 200, type: ProductPageDto })
  getProducts(@Query() query: ProductsQueryDto): Promise<ProductPageDto> {
    return this.catalog.getProducts(query);
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

  @Get('barcodes/:gtin')
  @ApiOperation({
    summary: 'Пошук товару за штрихкодом (сканер)',
    operationId: 'lookupBarcode',
  })
  @ApiResponse({ status: 200, type: BarcodeLookupDto })
  @ApiResponse({ status: 404, description: 'Штрихкоду немає в каталозі' })
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
