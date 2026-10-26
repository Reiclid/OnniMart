import type { ListingSummaryDto, ProductDetailsDto } from '@/api/generated/model';
import { productView } from './offers';

const offer = (chainName: string, currency: string, currentPrice: number, unitPrice: number | null, lastSeenAt = '2026-10-19T10:00:00Z') =>
  ({ id: `${chainName}-${currentPrice}`, chainName, currency, currentPrice, unitPrice, unitLabel: 'л', lastSeenAt }) as ListingSummaryDto;

// Як віддає API: фасування від найпоширенішого, ₴ перед €, від найдешевшої за одиницю
const product = {
  id: 'p',
  variants: [
    { id: 'v125', label: '1,25 л', barcodes: [], offers: [offer('EKO', 'UAH', 61.9, 49.52, '2026-10-19T12:00:00Z'), offer('Silpo', 'UAH', 64.49, 51.59), offer('ALDI', 'EUR', 1.59, 1.27)] },
    { id: 'v175', label: '1,75 л', barcodes: [], offers: [offer('EKO', 'UAH', 69.9, 39.94)] },
  ],
} as unknown as ProductDetailsDto;

describe('productView', () => {
  it('за замовчуванням — перше фасування, найдешевша мережа першою, усі мережі одним списком', () => {
    const view = productView(product);
    expect(view.variant?.id).toBe('v125');
    expect(view.cheapest?.chainName).toBe('EKO');
    expect(view.offers.map((o) => o.chainName)).toEqual(['EKO', 'Silpo', 'ALDI']);
    expect(view.updatedAt).toBe('2026-10-19T12:00:00Z');
  });

  it('найвигідніше фасування — з найнижчою ціною за одиницю', () => {
    expect(productView(product).sizes.map((s) => [s.label, s.best])).toEqual([
      ['1,25 л', false],
      ['1,75 л', true],
    ]);
  });

  it('країна покупця: її мережі першими, найдешевша — серед них', () => {
    const view = productView(product, undefined, 'EUR');
    expect(view.cheapest?.chainName).toBe('ALDI');
    expect(view.offers.map((o) => o.chainName)).toEqual(['ALDI', 'EKO', 'Silpo']);
  });

  it('обране фасування з ?v=, невідоме — перше', () => {
    expect(productView(product, 'v175').cheapest?.currentPrice).toBe(69.9);
    expect(productView(product, 'nope').variant?.id).toBe('v125');
  });
});
