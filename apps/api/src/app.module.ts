import { Module } from '@nestjs/common';
import { CatalogModule } from './modules/catalog/catalog.module';
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { ScraperModule } from './modules/scraper/scraper.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, CatalogModule, ScraperModule, MonitoringModule],
})
export class AppModule {}
