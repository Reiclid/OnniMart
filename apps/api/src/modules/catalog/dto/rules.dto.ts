import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { MATCH_RULES } from '@repo/matching';

const RULE_KEYS = MATCH_RULES.map((r) => r.key);
const DECISIONS = ['barcode', 'fuzzy', 'review', 'variant', 'product'];

export class RuleDecisionCountDto {
  @ApiProperty({
    enum: DECISIONS,
    description:
      'barcode — за штрихкодом, fuzzy — за назвою, review — модератору, variant — нове фасування, product — новий товар',
  })
  decision!: string;
  @ApiProperty() count!: number;
}

export class MatchingRuleDto {
  @ApiProperty({ enum: RULE_KEYS }) key!: string;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty() enabled!: boolean;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Коли перемикач востаннє змінювали; null — ніколи (типово увімкнене)',
  })
  updatedAt!: string | null;
  @ApiProperty({ description: 'Карток, на які правило вплинуло за період' })
  hits!: number;
  @ApiProperty({ description: 'Із них в останньому пакеті зіставлення' })
  lastBatch!: number;
  @ApiProperty({ type: [RuleDecisionCountDto] })
  byDecision!: RuleDecisionCountDto[];
}

export class MatchingRulesDto {
  @ApiProperty({ type: [MatchingRuleDto] }) items!: MatchingRuleDto[];
  @ApiProperty({ description: 'Період статистики, днів' }) days!: number;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Початок останнього пакета зіставлення',
  })
  lastBatchAt!: string | null;
}

export class RuleHitDto {
  @ApiProperty() listingId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() chain!: string;
  @ApiProperty({ enum: DECISIONS }) decision!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Товар, з яким картка зараз зіставлена',
  })
  productId!: string | null;
  @ApiProperty({ type: String, nullable: true }) product!: string | null;
  @ApiProperty() at!: string;
}

export class RuleHitPageDto {
  @ApiProperty({ type: [RuleHitDto] }) items!: RuleHitDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class SetMatchingRuleDto {
  @ApiProperty({ description: 'false — правило вимкнене з наступного пакета' })
  @IsBoolean()
  enabled!: boolean;
}
