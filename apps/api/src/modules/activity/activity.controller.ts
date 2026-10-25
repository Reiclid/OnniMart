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
import { ProductSummaryDto } from '../catalog/dto/catalog.dto';
import { ActivityService } from './activity.service';
import {
  EventBatchDto,
  GuestEventBatchDto,
  RecordedDto,
  RecordViewsDto,
} from './dto/activity.dto';

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(UserGuard)
@Controller('api/v1/me')
export class MeActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get('views')
  @ApiOperation({
    summary: 'Нещодавно переглянуті (найновіші першими, до 50)',
    operationId: 'getViews',
  })
  @ApiResponse({ status: 200, type: [ProductSummaryDto] })
  views(@CurrentUser() userId: string): Promise<ProductSummaryDto[]> {
    return this.activity.views(userId);
  }

  @Post('views')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Записати перегляди (відкритий товар або історію гостя після входу)',
    operationId: 'recordViews',
  })
  recordViews(
    @CurrentUser() userId: string,
    @Body() dto: RecordViewsDto,
  ): Promise<void> {
    return this.activity.recordViews(userId, dto.productIds);
  }

  @Delete('views')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Очистити історію переглядів',
    operationId: 'clearViews',
  })
  clearViews(@CurrentUser() userId: string): Promise<void> {
    return this.activity.clearViews(userId);
  }

  @Post('events')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Події для рекомендацій (пишуться лише за згодою в профілі)',
    operationId: 'trackMyEvents',
  })
  @ApiResponse({ status: 202, type: RecordedDto })
  async track(
    @CurrentUser() userId: string,
    @Body() dto: EventBatchDto,
  ): Promise<RecordedDto> {
    return { recorded: await this.activity.track({ userId }, dto) };
  }
}

/** Події гостя: веб шле їх серверною дією (токен адміністратора), лише коли в cookie є згода */
@ApiTags('events')
@ApiBearerAuth()
@Controller('api/v1/events')
export class EventsController {
  constructor(private readonly activity: ActivityService) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({ summary: 'Події гостя', operationId: 'trackGuestEvents' })
  @ApiResponse({ status: 202, type: RecordedDto })
  async track(@Body() dto: GuestEventBatchDto): Promise<RecordedDto> {
    const { anonId, consent: _consent, ...batch } = dto;
    return { recorded: await this.activity.track({ anonId }, batch) };
  }

  @Delete('guests/:anonId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Гість відкликав згоду: видалити його події',
    operationId: 'forgetGuest',
  })
  forget(@Param('anonId', ParseUUIDPipe) anonId: string): Promise<void> {
    return this.activity.forgetGuest(anonId);
  }
}
