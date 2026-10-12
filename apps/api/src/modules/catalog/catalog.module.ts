import { Module } from '@nestjs/common';
import { CatalogController, MatchingController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { MatchingService } from './matching/matching.service';

@Module({
  controllers: [CatalogController, MatchingController],
  providers: [CatalogService, MatchingService],
  exports: [MatchingService],
})
export class CatalogModule {}
