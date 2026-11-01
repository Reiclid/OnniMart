import { Module } from '@nestjs/common';
import { ScraperController } from './scraper.controller';
import { ScheduleService } from './services/schedule.service';
import { ScraperService } from './services/scraper.service';

/** HTTP-частина: запуск парсингу й розклад. Прийом результатів і планувальник — у воркері (src/worker.module.ts) */
@Module({
  controllers: [ScraperController],
  providers: [ScraperService, ScheduleService],
  exports: [ScraperService, ScheduleService],
})
export class ScraperModule {}
