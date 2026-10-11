import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ChainSummaryDto,
  ListingDetailsDto,
  ListingPageDto,
  ListingsQueryDto,
  ScrapeRunDto,
  StatsDto,
} from './dto/monitoring.dto';
import { MonitoringService } from './monitoring.service';

@ApiTags('monitoring')
@Controller('api/v1')
export class MonitoringController {
  constructor(private readonly monitoring: MonitoringService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Загальна статистика', operationId: 'getStats' })
  @ApiResponse({ status: 200, type: StatsDto })
  getStats(): Promise<StatsDto> {
    return this.monitoring.getStats();
  }

  @Get('chains')
  @ApiOperation({
    summary: 'Мережі з кількістю товарів і останнім запуском',
    operationId: 'getChains',
  })
  @ApiResponse({ status: 200, type: [ChainSummaryDto] })
  getChains(): Promise<ChainSummaryDto[]> {
    return this.monitoring.getChains();
  }

  @Get('scrape-runs')
  @ApiOperation({
    summary: 'Останні запуски парсера',
    operationId: 'getScrapeRuns',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, type: [ScrapeRunDto] })
  getScrapeRuns(@Query('limit') limit?: string): Promise<ScrapeRunDto[]> {
    const parsed = Number(limit);
    return this.monitoring.getScrapeRuns(
      Number.isInteger(parsed) ? parsed : undefined,
    );
  }

  @Get('listings')
  @ApiOperation({ summary: 'Картки товарів мереж', operationId: 'getListings' })
  @ApiResponse({ status: 200, type: ListingPageDto })
  getListings(@Query() query: ListingsQueryDto): Promise<ListingPageDto> {
    return this.monitoring.getListings(query);
  }

  @Get('listings/:id')
  @ApiOperation({
    summary: 'Картка товару з історією цін',
    operationId: 'getListing',
  })
  @ApiResponse({ status: 200, type: ListingDetailsDto })
  getListing(@Param('id') id: string): Promise<ListingDetailsDto> {
    return this.monitoring.getListing(id);
  }
}
