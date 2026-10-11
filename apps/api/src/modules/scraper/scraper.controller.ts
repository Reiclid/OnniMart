import { Controller, Post, Body } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ScraperService } from './services/scraper.service';
import {
  TriggerScraperDto,
  TriggerScraperResponseDto,
} from './dto/trigger-scraper.dto';

@ApiTags('scraper')
@Controller('api/v1/scraper')
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

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
