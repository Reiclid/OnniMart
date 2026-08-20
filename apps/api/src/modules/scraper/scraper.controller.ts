import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ScraperService } from './scraper.service';
import { TriggerScraperDto, TriggerScraperResponseDto } from './dto/trigger-scraper.dto';

@Controller('api/v1/scraper')
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

  @Post('trigger')
  @ApiOperation({ summary: 'Запустити скрейпінг магазину' })
  @ApiResponse({ status: 200, type: TriggerScraperResponseDto })
  async trigger(@Body() dto: TriggerScraperDto): Promise<TriggerScraperResponseDto> {
    const data = await this.scraperService.triggerScrape(dto.store)
    return data;
  }
}
