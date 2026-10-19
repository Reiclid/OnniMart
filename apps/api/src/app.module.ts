import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AdminGuard } from './auth/admin.guard';
import { CatalogModule } from './modules/catalog/catalog.module';
import { HealthModule } from './modules/health/health.module';
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { ScraperModule } from './modules/scraper/scraper.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    CatalogModule,
    ScraperModule,
    MonitoringModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AdminGuard }],
})
export class AppModule {}
