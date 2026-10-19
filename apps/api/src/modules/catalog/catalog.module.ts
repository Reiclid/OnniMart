import { Module } from '@nestjs/common';
import { CatalogController, MatchingController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { MatchingClient } from './matching/matching.client';
import { ModerationService } from './matching/moderation.service';

@Module({
  controllers: [CatalogController, MatchingController],
  providers: [CatalogService, MatchingClient, ModerationService],
  exports: [CatalogService],
})
export class CatalogModule {}
