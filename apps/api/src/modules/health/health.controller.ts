import { Controller, Get, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { HealthDto } from './health.dto';
import { HealthService } from './health.service';

// Health-check опитують системи моніторингу — без обмеження частоти
@SkipThrottle()
@ApiTags('health')
@Controller('api/v1/health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Стан системи: БД, Redis, воркер, парсер, черги',
    operationId: 'getHealth',
  })
  @ApiResponse({ status: 200, type: HealthDto })
  @ApiResponse({
    status: 503,
    type: HealthDto,
    description: 'Немає БД чи Redis',
  })
  async get(@Res({ passthrough: true }) res: Response): Promise<HealthDto> {
    const health = await this.health.check();
    if (health.status === 'down') res.status(503);
    return health;
  }
}
