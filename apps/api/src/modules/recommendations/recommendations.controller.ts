import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentSession, CurrentUser, UserGuard } from '../../auth/user.guard';
import {
  ProductPageDto,
  ProductSummaryDto,
  ProductsQueryDto,
} from '../catalog/dto/catalog.dto';
import { RecommendationsService } from './recommendations.service';

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(UserGuard)
@Controller('api/v1/me')
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Get('recommendations')
  @ApiOperation({
    summary:
      'For you: ранжувальник v0 за профілем (категорії, поняття, бренди, мережі), до 12',
    operationId: 'getRecommendations',
  })
  @ApiResponse({ status: 200, type: [ProductSummaryDto] })
  forYou(
    @CurrentUser() userId: string,
    @CurrentSession() sessionId: string,
  ): Promise<ProductSummaryDto[]> {
    return this.recommendations.forYou(userId, sessionId);
  }

  @Get('products')
  @ApiOperation({
    summary:
      'Каталог і пошук для користувача: перші 300 результатів переставлені за профілем',
    operationId: 'getMyProducts',
  })
  @ApiResponse({ status: 200, type: ProductPageDto })
  products(
    @CurrentUser() userId: string,
    @CurrentSession() sessionId: string,
    @Query() query: ProductsQueryDto,
  ): Promise<ProductPageDto> {
    return this.recommendations.search(userId, sessionId, query);
  }
}
