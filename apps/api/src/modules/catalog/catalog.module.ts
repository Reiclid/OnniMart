import { Module } from '@nestjs/common';
import {
  CatalogController,
  MatchingController,
  VariationsController,
  RulesController,
  BrandsController,
} from './catalog.controller';
import { BrandsService } from './brands.service';
import { CatalogService } from './catalog.service';
import { PriceHistoryService } from './price-history.service';
import { ProductEditService } from './product-edit.service';
import { MatchingClient } from './matching/matching.client';
import { OpenFoodFactsClient } from './open-food-facts.client';
import { BarcodeReviewService } from './matching/barcode-review.service';
import { DecisionsService } from './matching/decisions.service';
import { ModerationService } from './matching/moderation.service';
import { VariationsService } from './matching/variations.service';
import { RulesService } from './matching/rules.service';

@Module({
  controllers: [
    CatalogController,
    MatchingController,
    VariationsController,
    RulesController,
    BrandsController,
  ],
  providers: [
    CatalogService,
    MatchingClient,
    OpenFoodFactsClient,
    ModerationService,
    BarcodeReviewService,
    DecisionsService,
    PriceHistoryService,
    ProductEditService,
    VariationsService,
    RulesService,
    BrandsService,
  ],
  exports: [CatalogService],
})
export class CatalogModule {}
