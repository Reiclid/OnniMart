import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CATEGORIES, formatQuantity } from '@repo/matching';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MatchingClient } from './matching/matching.client';
import { gtinOf, productPatch, variantPatch } from './product-edit';

/** Звідки штрихкод, доданий модератором вручну */
export const ADMIN_SOURCE = 'admin';

/**
 * Ручні правки характеристик товару й фасувань в адмінці. Після кожної — пакет зіставлення:
 * він перебудовує ключі зіставлення, пошуковий індекс і product_stats.
 */
@Injectable()
export class ProductEditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingClient,
  ) {}

  async updateProduct(id: string, body: Record<string, unknown>) {
    const patch = productPatch(body);
    await this.ensureProduct(id);
    await this.prisma.$transaction(async (tx) => {
      const data: Prisma.ProductUncheckedUpdateInput = {
        name: patch.name,
        variantLabel: patch.variantLabel,
        description: patch.description,
        imageUrl: patch.imageUrl,
      };
      if (patch.brand !== undefined) {
        // Назва обʼєднаного дубліката веде до основного бренду, а не створює дубліката знову
        const alias =
          patch.brand &&
          (await tx.brandAlias.findUnique({
            where: { alias: patch.brand.slug },
            select: { brandId: true },
          }));
        data.brandId = alias
          ? alias.brandId
          : patch.brand
            ? (
                await tx.brand.upsert({
                  where: { slug: patch.brand.slug },
                  create: patch.brand,
                  update: {},
                })
              ).id
            : null;
      }
      if (patch.category !== undefined) {
        const category = CATEGORIES.find((c) => c.slug === patch.category);
        // null — категорію знову визначає зіставлення за картками мереж
        data.categoryLocked = Boolean(category);
        data.categoryId = category
          ? (
              await tx.category.upsert({
                where: { slug: category.slug },
                create: { ...category },
                update: {},
              })
            ).id
          : null;
      }
      await tx.product.update({ where: { id }, data });
      // Ключі з назви товару залежать від назви й бренду — syncKeys створить нові
      if (patch.name !== undefined || patch.brand !== undefined) {
        await tx.matchKey.deleteMany({
          where: { listingId: null, variant: { productId: id } },
        });
      }
    });
    await this.matching.request();
  }

  async updateVariant(id: string, body: Record<string, unknown>) {
    const patch = variantPatch(body);
    await this.ensureVariant(id);
    const { quantity } = patch;
    try {
      await this.prisma.$transaction([
        this.prisma.productVariant.update({
          where: { id },
          data: {
            ...(quantity && {
              measure: quantity.measure,
              netQuantity: quantity.netQuantity,
              packCount: quantity.packCount,
              isWeighted: quantity.isWeighted,
            }),
            label:
              patch.label ?? (quantity ? formatQuantity(quantity) : undefined),
            packaging: patch.packaging,
          },
        }),
        // Усі ключі фасування (і його карток) містять кількість — syncKeys перебудує
        ...(quantity
          ? [this.prisma.matchKey.deleteMany({ where: { variantId: id } })]
          : []),
      ]);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Таке фасування в цього товару вже є — відвʼяжіть картки й зіставте їх з ним',
        );
      }
      throw error;
    }
    if (quantity) await this.matching.request();
  }

  async addBarcode(variantId: string, code: unknown): Promise<void> {
    const gtin = gtinOf(code);
    await this.ensureVariant(variantId);
    const owner = await this.prisma.barcode.findUnique({
      where: { gtin },
      select: {
        variantId: true,
        variant: {
          select: { label: true, product: { select: { name: true } } },
        },
      },
    });
    if (owner?.variantId === variantId) return;
    if (owner) {
      throw new ConflictException(
        `Штрихкод ${gtin} уже належить товару «${owner.variant.product.name}» (${owner.variant.label})`,
      );
    }
    try {
      await this.prisma.barcode.create({
        data: { gtin, variantId, source: ADMIN_SOURCE },
      });
    } catch (error) {
      // Хтось додав той самий штрихкод між перевіркою й записом — та сама відповідь, що й вище
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        return this.addBarcode(variantId, code);
      throw error;
    }
    // Незіставлені картки з цим штрихкодом приєднаються в наступному пакеті
    await this.matching.request();
  }

  async removeBarcode(variantId: string, code: string) {
    const gtin = gtinOf(code);
    const { count } = await this.prisma.barcode.deleteMany({
      where: { gtin, variantId },
    });
    if (count === 0) {
      throw new NotFoundException(`Штрихкод ${gtin} у фасування не знайдено`);
    }
  }

  private async ensureProduct(id: string) {
    const found = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found) throw new NotFoundException(`Товар ${id} не знайдено`);
  }

  private async ensureVariant(id: string) {
    const found = await this.prisma.productVariant.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found) throw new NotFoundException(`Фасування ${id} не знайдено`);
  }
}
