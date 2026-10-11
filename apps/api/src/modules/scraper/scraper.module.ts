import { Module } from '@nestjs/common';
import { ScraperController } from './scraper.controller';
import { IngestionService } from './services/ingestion.service';
import { IngestionWorker } from './services/ingestion.worker';
import { ScraperService } from './services/scraper.service';

@Module({
  controllers: [ScraperController],
  providers: [ScraperService, IngestionService, IngestionWorker],
})
export class ScraperModule {}
