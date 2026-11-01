import { Module } from '@nestjs/common';
import { AlertsChecker } from './modules/accounts/alerts.checker';
import { MatchingRequestsWorker } from './modules/catalog/matching/matching-requests.worker';
import { MatchingService } from './modules/catalog/matching/matching.service';
import { SearchIndexer } from './modules/catalog/search/search.indexer';
import { PushService } from './modules/push/push.service';
import { RatesService } from './modules/rates/rates.service';
import { RatesUpdater } from './modules/rates/rates.updater';
import { ScraperModule } from './modules/scraper/scraper.module';
import { IngestionService } from './modules/scraper/services/ingestion.service';
import { IngestionWorker } from './modules/scraper/services/ingestion.worker';
import { ScrapeScheduler } from './modules/scraper/services/scrape-scheduler';
import { PrismaModule } from './prisma/prisma.module';
import { WorkerLock } from './worker-lock';

/**
 * Фоновий процес (src/worker.ts): прийом результатів парсера, планувальник обходів
 * пакетне зіставлення й курси валют. Працює в одному екземплярі — це гарантує WorkerLock.
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
    AlertsChecker,
    PushService,
    SearchIndexer,
    RatesUpdater,
    RatesService,
  ],
})
export class WorkerModule {}
