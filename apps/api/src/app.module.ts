import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminGuard } from './auth/admin.guard';
import { THROTTLER_OPTIONS } from './common/throttle';
import { AccountsModule } from './modules/accounts/accounts.module';
import { ActivityModule } from './modules/activity/activity.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { HealthModule } from './modules/health/health.module';
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { QualityModule } from './modules/quality/quality.module';
import { RatesModule } from './modules/rates/rates.module';
import { ScraperModule } from './modules/scraper/scraper.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ThrottlerModule.forRoot(THROTTLER_OPTIONS),
    PrismaModule,
    CatalogModule,
    ScraperModule,
    MonitoringModule,
    HealthModule,
    AccountsModule,
    ActivityModule,
    RecommendationsModule,
    RatesModule,
    QualityModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AdminGuard },
  ],
})
export class AppModule {}
