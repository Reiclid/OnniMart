import { Module } from '@nestjs/common';
import { ScraperController } from './scraper.controller';
import { ScraperService } from './services/scraper.service';

/** HTTP-частина: запуск парсингу. Прийом результатів і планувальник — у воркері (src/worker.module.ts) */
@Module({
  controllers: [ScraperController],
  providers: [ScraperService],
  exports: [ScraperService],
})
export class ScraperModule {}
