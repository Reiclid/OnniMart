import { Module } from '@nestjs/common';
import { UserGuard } from '../../auth/user.guard';
import { AccountsService } from './accounts.service';
import { AuthController, MeController } from './accounts.controller';
import { RatesModule } from '../rates/rates.module';
import { AlertsService } from './alerts.service';

/** HTTP-частина облікових записів. Перевірка підписок (AlertsChecker) — у воркері */
@Module({
  imports: [RatesModule],
  controllers: [AuthController, MeController],
  providers: [AccountsService, AlertsService, UserGuard],
})
export class AccountsModule {}
