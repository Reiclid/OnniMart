import { Module } from '@nestjs/common';
import { ScraperController } from './scraper.controller';
import { ScraperService } from './services/scraper.service';

@Module({
  imports: [],
  controllers: [ScraperController],
  providers: [ScraperService],
})
export class ScraperModule {}
