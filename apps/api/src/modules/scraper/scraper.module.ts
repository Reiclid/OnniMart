import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { ScraperController } from './scraper.controller';
import { IngestionService } from './services/ingestion.service';
import { IngestionWorker } from './services/ingestion.worker';
import { ScrapeScheduler } from './services/scrape-scheduler';
import { ScraperService } from './services/scraper.service';

@Module({
  imports: [CatalogModule],
  controllers: [ScraperController],
  providers: [
    ScraperService,
    IngestionService,
    IngestionWorker,
    ScrapeScheduler,
  ],
})
export class ScraperModule {}
