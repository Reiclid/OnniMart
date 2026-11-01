import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { bearerToken, CurrentUser, UserGuard } from '../../auth/user.guard';
import { MutationLimit } from '../../common/throttle';
import { AccountsService } from './accounts.service';
import { AlertsService } from './alerts.service';
import {
  CreateSubscriptionDto,
  GoogleLoginDto,
  GoogleSessionDto,
  LoginDto,
  NotificationDto,
  RegisterDto,
  SessionDto,
  SubscriptionDto,
  UpdateMeDto,
  UpdateSubscriptionDto,
  UserDto,
} from './dto/accounts.dto';

@ApiTags('auth')
@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly accounts: AccountsService) {}

  @MutationLimit()
  @Post('register')
  @ApiOperation({
    summary: 'Реєстрація',
    operationId: 'register',
    description: '409 — email уже зареєстровано',
  })
  @ApiResponse({ status: 201, type: SessionDto })
  register(@Body() dto: RegisterDto): Promise<SessionDto> {
    return this.accounts.register(dto);
  }

  @MutationLimit()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Вхід за email і паролем',
    operationId: 'login',
    description: '401 — невірний email або пароль',
  })
  @ApiResponse({ status: 200, type: SessionDto })
  login(@Body() dto: LoginDto): Promise<SessionDto> {
    return this.accounts.login(dto);
  }

  @MutationLimit()
  @Post('google')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Вхід або реєстрація через Google (OIDC code + PKCE)',
    operationId: 'loginWithGoogle',
    description:
      '401 — Google не підтвердив вхід; 409 — email прив’язаний до іншого Google-акаунта; 503 — не налаштовано',
  })
  @ApiResponse({ status: 200, type: GoogleSessionDto })
  google(@Body() dto: GoogleLoginDto): Promise<GoogleSessionDto> {
    return this.accounts.google(dto);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Завершити сесію', operationId: 'logout' })
  logout(@Req() request: Request): Promise<void> {
    return this.accounts.logout(bearerToken(request));
  }
}

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(UserGuard)
@Controller('api/v1/me')
export class MeController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly alerts: AlertsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Профіль і налаштування', operationId: 'getMe' })
  @ApiResponse({ status: 200, type: UserDto })
  me(@CurrentUser() userId: string): Promise<UserDto> {
    return this.accounts.me(userId);
  }

  @MutationLimit()
  @Patch()
  @ApiOperation({
    summary: 'Змінити профіль і налаштування',
    operationId: 'updateMe',
  })
  @ApiResponse({ status: 200, type: UserDto })
  update(
    @CurrentUser() userId: string,
    @Body() dto: UpdateMeDto,
  ): Promise<UserDto> {
    return this.accounts.update(userId, dto);
  }

  @MutationLimit()
  @Delete()
  @HttpCode(204)
  @ApiOperation({
    summary: 'Видалити акаунт з підписками й сповіщеннями',
    operationId: 'deleteMe',
  })
  remove(@CurrentUser() userId: string): Promise<void> {
    return this.accounts.remove(userId);
  }

  @Get('subscriptions')
  @ApiOperation({
    summary: 'Підписки на ціну',
    operationId: 'getSubscriptions',
  })
  @ApiResponse({ status: 200, type: [SubscriptionDto] })
  subscriptions(@CurrentUser() userId: string): Promise<SubscriptionDto[]> {
    return this.alerts.list(userId);
  }

  @MutationLimit()
  @Post('subscriptions')
  @ApiOperation({
    summary: 'Стежити за ціною (повторно — оновити умови)',
    operationId: 'createSubscription',
  })
  @ApiResponse({ status: 201, type: SubscriptionDto })
  subscribe(
    @CurrentUser() userId: string,
    @Body() dto: CreateSubscriptionDto,
  ): Promise<SubscriptionDto> {
    return this.alerts.create(userId, dto);
  }

  @MutationLimit()
  @Patch('subscriptions/:id')
  @ApiOperation({
    summary: 'Змінити умови або вимкнути підписку',
    operationId: 'updateSubscription',
  })
  @ApiResponse({ status: 200, type: SubscriptionDto })
  updateSubscription(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubscriptionDto,
  ): Promise<SubscriptionDto> {
    return this.alerts.update(userId, id, dto);
  }

  @MutationLimit()
  @Delete('subscriptions/:id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Видалити підписку',
    operationId: 'deleteSubscription',
  })
  unsubscribe(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.alerts.remove(userId, id);
  }

  @Get('notifications')
  @ApiOperation({
    summary: 'Останні 50 сповіщень',
    operationId: 'getNotifications',
  })
  @ApiResponse({ status: 200, type: [NotificationDto] })
  notifications(@CurrentUser() userId: string): Promise<NotificationDto[]> {
    return this.alerts.notifications(userId);
  }

  @Post('notifications/read')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Позначити всі сповіщення прочитаними',
    operationId: 'markNotificationsRead',
  })
  markRead(@CurrentUser() userId: string): Promise<void> {
    return this.alerts.markRead(userId);
  }
}
