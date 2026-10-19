import { Module } from '@nestjs/common';
import { MatchingRequestsWorker } from './modules/catalog/matching/matching-requests.worker';
import { MatchingService } from './modules/catalog/matching/matching.service';
import { ScraperModule } from './modules/scraper/scraper.module';
import { IngestionService } from './modules/scraper/services/ingestion.service';
import { IngestionWorker } from './modules/scraper/services/ingestion.worker';
import { ScrapeScheduler } from './modules/scraper/services/scrape-scheduler';
import { PrismaModule } from './prisma/prisma.module';
import { WorkerLock } from './worker-lock';

/**
 * Фоновий процес (src/worker.ts): прийом результатів парсера, планувальник обходів
 * і пакетне зіставлення. Працює в одному екземплярі — це гарантує WorkerLock.
 */
@Module({
  imports: [PrismaModule, ScraperModule],
  providers: [
    WorkerLock,
    IngestionService,
    IngestionWorker,
    ScrapeScheduler,
    MatchingService,
    MatchingRequestsWorker,
  ],
})
export class WorkerModule {}
