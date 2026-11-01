import { MutationLimit } from '../../common/throttle';
import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ScheduleService } from './services/schedule.service';
import { ScraperService } from './services/scraper.service';
import {
  RunAllResponseDto,
  ScheduleDto,
  UpdateScheduleDto,
} from './dto/schedule.dto';
import {
  TriggerScraperDto,
  TriggerScraperResponseDto,
} from './dto/trigger-scraper.dto';

@ApiTags('scraper')
@Controller('api/v1/scraper')
export class ScraperController {
  constructor(
    private readonly scraperService: ScraperService,
    private readonly schedule: ScheduleService,
  ) {}

  @Get('schedule')
  @ApiOperation({
    summary: 'Розклад обходів: налаштування й час наступного обходу',
    operationId: 'getSchedule',
  })
  @ApiResponse({ status: 200, type: ScheduleDto })
  getSchedule(): Promise<ScheduleDto> {
    return this.schedule.status();
  }

  @MutationLimit()
  @ApiBearerAuth()
  @ApiResponse({ status: 401, description: 'Потрібен токен адміністратора' })
  @Put('schedule')
  @ApiOperation({
    summary: 'Змінити розклад обходів',
    operationId: 'updateSchedule',
  })
  @ApiResponse({ status: 200, type: ScheduleDto })
  updateSchedule(@Body() dto: UpdateScheduleDto): Promise<ScheduleDto> {
    return this.schedule.update(dto);
  }

  @MutationLimit()
  @ApiBearerAuth()
  @ApiResponse({ status: 401, description: 'Потрібен токен адміністратора' })
  @Post('run-all')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Запустити повний обхід усіх увімкнених мереж зараз',
    operationId: 'runAllScrapes',
  })
  @ApiResponse({ status: 202, type: RunAllResponseDto })
  runAll(): Promise<RunAllResponseDto> {
    return this.schedule.runAll();
  }

  @MutationLimit()
  @ApiBearerAuth()
  @ApiResponse({ status: 401, description: 'Потрібен токен адміністратора' })
  @Post('trigger')
  @ApiOperation({
    summary: 'Запустити скрейпінг магазину',
    operationId: 'triggerScrape',
  })
  @ApiResponse({ status: 201, type: TriggerScraperResponseDto })
  async trigger(
    @Body() dto: TriggerScraperDto,
  ): Promise<TriggerScraperResponseDto> {
    return this.scraperService.triggerScrape(dto.store, dto.maxPages);
  }
}
