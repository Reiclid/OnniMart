import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { QualityReportDto } from './quality.dto';
import { QualityService } from './quality.service';

@ApiTags('quality')
@Controller('api/v1/quality')
export class QualityController {
  constructor(private readonly quality: QualityService) {}

  @Get()
  @ApiOperation({
    summary:
      'Якість даних (PRD-32): агрегати для графіків і позначені картки (викиди ціни, крихітні фасування, ціна інших мереж, знижки, стрибки, дублікати)',
    operationId: 'getQualityReport',
  })
  @ApiQuery({ name: 'country', required: false, type: String })
  @ApiQuery({ name: 'chain', required: false, type: String })
  @ApiQuery({
    name: 'group',
    required: false,
    type: String,
    description:
      'Група log–log: "категорія|країна|одиниця"; без неї — група з найбільшою кількістю викидів',
  })
  @ApiResponse({ status: 200, type: QualityReportDto })
  report(
    @Query('country') country?: string,
    @Query('chain') chain?: string,
    @Query('group') group?: string,
  ): Promise<QualityReportDto> {
    return this.quality.report({ country, chain, group });
  }
}
