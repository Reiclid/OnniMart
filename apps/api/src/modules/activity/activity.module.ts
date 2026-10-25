import { Module } from '@nestjs/common';
import { UserGuard } from '../../auth/user.guard';
import { CatalogModule } from '../catalog/catalog.module';
import { EventsController, MeActivityController } from './activity.controller';
import { ActivityService } from './activity.service';

/** HTTP: історія переглядів і події. Видалення подій старших за 180 днів — у воркері (ScrapeScheduler.maintain) */
@Module({
  imports: [CatalogModule],
  controllers: [MeActivityController, EventsController],
  providers: [ActivityService, UserGuard],
})
export class ActivityModule {}
