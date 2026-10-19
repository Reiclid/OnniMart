import { formatQuantity, Measure } from '@repo/matching';
import { Prisma } from '../generated/prisma/client';
import { ListingSummaryDto } from '../modules/monitoring/dto/monitoring.dto';
import { toNumber } from './query';

/** Картка мережі → DTO для каталогу й моніторингу */

const UNIT_LABELS: Record<Measure, string> = {
  MASS: 'кг',
  VOLUME: 'л',
  COUNT: 'шт',
};

export const listingInclude = {
  chain: { select: { slug: true, name: true, currency: true } },
  variant: { select: { productId: true } },
} satisfies Prisma.ListingInclude;

export type ListingWithChain = Prisma.ListingGetPayload<{
  include: typeof listingInclude;
}>;

export function toListingDto(listing: ListingWithChain): ListingSummaryDto {
  const measure = listing.measure;
  const netQuantity = toNumber(listing.netQuantity);
  return {
    id: listing.id,
    chainSlug: listing.chain.slug,
    chainName: listing.chain.name,
    currency: listing.chain.currency,
    externalId: listing.externalId,
    name: listing.rawName,
    brand: listing.rawBrand,
    category: listing.rawCategory,
    url: listing.url,
    imageUrl: listing.imageUrl,
    quantityLabel:
      measure && netQuantity
        ? formatQuantity({
            measure,
            netQuantity,
            packCount: listing.packCount ?? 1,
            isWeighted: listing.isWeighted,
          })
        : null,
    currentPrice: toNumber(listing.currentPrice),
    regularPrice: toNumber(listing.regularPrice),
    unitPrice: toNumber(listing.unitPrice),
    unitLabel: measure
      ? listing.isWeighted
        ? 'кг'
        : UNIT_LABELS[measure]
      : null,
    isOnPromo: listing.isOnPromo,
    inStock: listing.inStock,
    delistedAt: listing.delistedAt?.toISOString() ?? null,
    matchStatus: listing.matchStatus,
    matchMethod: listing.matchMethod,
    matchScore: listing.matchScore,
    productId: listing.variant?.productId ?? null,
    barcodes: listing.barcodes,
    lastSeenAt: listing.lastSeenAt.toISOString(),
  };
}
