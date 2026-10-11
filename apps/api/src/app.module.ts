import { Module } from '@nestjs/common';
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { ScraperModule } from './modules/scraper/scraper.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, ScraperModule, MonitoringModule],
})
export class AppModule {}
