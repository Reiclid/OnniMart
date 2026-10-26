import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ExchangeRatesDto } from './rates.dto';
import { RatesService } from './rates.service';

@ApiTags('rates')
@Controller('api/v1/rates')
export class RatesController {
  constructor(private readonly rates: RatesService) {}

  @Get()
  @ApiOperation({
    summary:
      'Курси валют за 1 EUR (ЄЦБ + EUR/UAH від НБУ) для перерахунку цін при показі',
    operationId: 'getExchangeRates',
  })
  @ApiResponse({ status: 200, type: ExchangeRatesDto })
  @ApiResponse({ status: 503, description: 'Воркер ще не завантажив курси' })
  async get(): Promise<ExchangeRatesDto> {
    const rates = await this.rates.current();
    if (!rates)
      throw new ServiceUnavailableException('Курси валют ще не завантажено');
    return rates;
  }
}
