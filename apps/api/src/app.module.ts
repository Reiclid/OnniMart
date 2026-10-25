import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminGuard } from './auth/admin.guard';
import { AccountsModule } from './modules/accounts/accounts.module';
import { ActivityModule } from './modules/activity/activity.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { HealthModule } from './modules/health/health.module';
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { ScraperModule } from './modules/scraper/scraper.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    // Не більше 120 запитів за хвилину з однієї адреси (зміни — окремо, див. MUTATION_LIMIT)
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    CatalogModule,
    ScraperModule,
    MonitoringModule,
    HealthModule,
    AccountsModule,
    ActivityModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AdminGuard },
  ],
})
export class AppModule {}
