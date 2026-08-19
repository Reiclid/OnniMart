import { Controller, Get, Post, Body } from '@nestjs/common';
import { ScraperService } from './scraper.service';

@Controller('api/v1/scraper')
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

  @Post('trigger')
  async trigger(@Body() body: { store: string }) {
    const data = await this.scraperService.triggerScrape(body.store || 'atb')
    return data;
  }
}
