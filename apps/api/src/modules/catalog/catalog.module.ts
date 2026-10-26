import { Module } from '@nestjs/common';
import { CatalogController, MatchingController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { PriceHistoryService } from './price-history.service';
import { MatchingClient } from './matching/matching.client';
import { BarcodeReviewService } from './matching/barcode-review.service';
import { DecisionsService } from './matching/decisions.service';
import { ModerationService } from './matching/moderation.service';

@Module({
  controllers: [CatalogController, MatchingController],
  providers: [
    CatalogService,
    MatchingClient,
    ModerationService,
    BarcodeReviewService,
    DecisionsService,
    PriceHistoryService,
  ],
  exports: [CatalogService],
})
export class CatalogModule {}
