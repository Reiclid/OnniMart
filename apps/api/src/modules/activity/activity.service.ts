import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import type { ProductSummaryDto } from '../catalog/dto/catalog.dto';
import { eventType, MAX_VIEWS, orderedViews } from './activity';
import type { EventBatchDto } from './dto/activity.dto';

/** Кому належать події: акаунт або гість */
export type EventOwner = { userId: string } | { anonId: string };

/** PRD-04 "Нещодавно переглянуті" і журнал подій для рекомендацій (лише за згодою) */
@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  /** Один запит: невідомі товари пропускаються, далі лишаються останні MAX_VIEWS */
  async recordViews(userId: string, productIds: string[]): Promise<void> {
    const rows = orderedViews(productIds, new Date()).map(
      (v) => Prisma.sql`(${v.productId}, ${v.viewedAt}::timestamp)`,
    );
    await this.prisma.$transaction([
      this.prisma.$executeRaw`
        INSERT INTO product_views ("userId", "productId", "viewedAt")
        SELECT ${userId}, p.id, v.at
        FROM (VALUES ${Prisma.join(rows)}) AS v(id, at)
        JOIN products p ON p.id = v.id
        ON CONFLICT ("userId", "productId") DO UPDATE SET "viewedAt" = EXCLUDED."viewedAt"`,
      this.prisma.$executeRaw`
        DELETE FROM product_views
        WHERE "userId" = ${userId} AND "productId" NOT IN (
          SELECT "productId" FROM product_views WHERE "userId" = ${userId}
          ORDER BY "viewedAt" DESC LIMIT ${MAX_VIEWS})`,
    ]);
  }

  async views(userId: string): Promise<ProductSummaryDto[]> {
    const views = await this.prisma.productView.findMany({
      where: { userId },
      orderBy: { viewedAt: 'desc' },
      take: MAX_VIEWS,
      select: { productId: true },
    });
    return this.catalog.summaries(views.map((v) => v.productId));
  }

  async clearViews(userId: string): Promise<void> {
    await this.prisma.productView.deleteMany({ where: { userId } });
  }

  /** Події акаунта пишуться лише після згоди в профілі; гість підтверджує її в тілі запиту */
  async track(owner: EventOwner, batch: EventBatchDto): Promise<number> {
    if ('userId' in owner) {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: owner.userId },
        select: { telemetryConsentAt: true },
      });
      if (!user.telemetryConsentAt) return 0;
    }
    const { count } = await this.prisma.event.createMany({
      data: batch.events.map(({ type, ...event }) => ({
        ...owner,
        ...event,
        sessionId: batch.sessionId,
        type: eventType(type),
      })),
    });
    return count;
  }

  /** Гість відкликав згоду — стерти все, що записано під його id */
  async forgetGuest(anonId: string): Promise<void> {
    await this.prisma.event.deleteMany({ where: { anonId } });
  }
}
