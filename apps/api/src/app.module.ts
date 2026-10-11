import { Module } from '@nestjs/common';
import { ScraperModule } from './modules/scraper/scraper.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, ScraperModule],
})
export class AppModule {}
