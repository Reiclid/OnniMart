import { Module } from '@nestjs/common';
import { UserGuard } from '../../auth/user.guard';
import { DevicesController, PushKeyController } from './push.controller';
import { PushService } from './push.service';

/** Web Push: пристрої покупця й тестове сповіщення. Сповіщення про ціни шле воркер (AlertsChecker) */
@Module({
  controllers: [PushKeyController, DevicesController],
  providers: [PushService, UserGuard],
})
export class PushModule {}
