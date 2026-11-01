import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, UserGuard } from '../../auth/user.guard';
import { MutationLimit } from '../../common/throttle';
import {
  DeviceDto,
  PushKeyDto,
  PushSentDto,
  SaveDeviceDto,
  TestPushDto,
} from './dto/push.dto';
import { PushService } from './push.service';

@ApiTags('push')
@Controller('api/v1/push')
export class PushKeyController {
  constructor(private readonly push: PushService) {}

  @Get('key')
  @ApiOperation({
    summary: 'Публічний VAPID-ключ для підписки браузера',
    operationId: 'getPushKey',
  })
  @ApiResponse({ status: 200, type: PushKeyDto })
  key(): PushKeyDto {
    return { publicKey: this.push.publicKey };
  }
}

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(UserGuard)
@Controller('api/v1/me/devices')
export class DevicesController {
  constructor(private readonly push: PushService) {}

  @Get()
  @ApiOperation({
    summary: 'Браузери з увімкненим push',
    operationId: 'getDevices',
  })
  @ApiResponse({ status: 200, type: [DeviceDto] })
  list(@CurrentUser() userId: string): Promise<DeviceDto[]> {
    return this.push.devices(userId);
  }

  @MutationLimit()
  @Post()
  @ApiOperation({
    summary: 'Увімкнути push у цьому браузері (PushSubscription)',
    operationId: 'saveDevice',
    description: '400 — адреса не належить відомому push-сервісу',
  })
  @ApiResponse({ status: 201, type: DeviceDto })
  save(
    @CurrentUser() userId: string,
    @Body() dto: SaveDeviceDto,
  ): Promise<DeviceDto> {
    return this.push.save(userId, dto);
  }

  @MutationLimit()
  @Post('test')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Тестове сповіщення на свої пристрої',
    operationId: 'testPush',
  })
  @ApiResponse({ status: 200, type: PushSentDto })
  async test(
    @CurrentUser() userId: string,
    @Body() dto: TestPushDto,
  ): Promise<PushSentDto> {
    const sent = await this.push.send(
      userId,
      { title: dto.title, body: dto.body, url: '/settings/notifications' },
      dto.endpoint,
    );
    return { sent };
  }

  @MutationLimit()
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Вимкнути push на пристрої',
    operationId: 'deleteDevice',
  })
  remove(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.push.remove(userId, id);
  }
}
