import type { ChainSummaryDto } from '@/api/generated/model';
import { Chip } from './ui';

/** Фільтр мереж над результатами; зберігає запит пошуку */
export function ChainChips({ chains, selected, q }: { chains: ChainSummaryDto[]; selected?: string; q?: string }) {
  const href = (chain?: string) => {
    const query = new URLSearchParams();
    if (q) query.set('q', q);
    if (chain) query.set('chain', chain);
    return `/products?${query.toString()}`;
  };
  return (
    <nav aria-label="Chains" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
      <Chip href={href()} selected={!selected}>
        All chains
      </Chip>
      {chains.map((chain) => (
        <Chip key={chain.slug} href={href(chain.slug)} selected={chain.slug === selected}>
          {chain.name}
        </Chip>
      ))}
    </nav>
  );
}
