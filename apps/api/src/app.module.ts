import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScraperModule } from './modules/scraper/scraper.module';

@Module({
  imports: [ScraperModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
