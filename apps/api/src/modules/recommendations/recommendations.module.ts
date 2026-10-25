import { Module } from '@nestjs/common';
import { UserGuard } from '../../auth/user.guard';
import { ActivityModule } from '../activity/activity.module';
import { CatalogModule } from '../catalog/catalog.module';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';

/** HTTP: "Для вас" і персональний пошук (ранжувальник v0, @repo/ranking) */
@Module({
  imports: [CatalogModule, ActivityModule],
  controllers: [RecommendationsController],
  providers: [RecommendationsService, UserGuard],
})
export class RecommendationsModule {}
