import { Module } from '@nestjs/common';
import { UserGuard } from '../../auth/user.guard';
import { AccountsService } from './accounts.service';
import { AuthController, MeController } from './accounts.controller';
import { AlertsService } from './alerts.service';

/** HTTP-частина облікових записів. Перевірка підписок (AlertsChecker) — у воркері */
@Module({
  controllers: [AuthController, MeController],
  providers: [AccountsService, AlertsService, UserGuard],
})
export class AccountsModule {}
