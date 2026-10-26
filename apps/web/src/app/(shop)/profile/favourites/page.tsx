import { getFavourites } from '@/api/generated/me/me';
import { productCard } from '@/components/ProductCard';
import { ProductMasonry } from '@/components/ProductMasonry';
import { PageHeader } from '@/components/ui';
import { getT } from '@/i18n/server';
import { currentCountry, currentMoney, localized, requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** PRD-01 обране: «я це купую», один дотик з профілю */
export default async function FavouritesPage() {
  await requireUser('/profile/favourites');
  const [{ data }, t, money, country] = await Promise.all([getFavourites(), getT(), currentMoney(), currentCountry()]);
  const favourites = localized(data, country);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader back="/profile" backLabel={t('nav.back')} title={t('favourites.title')} />
      <p className="text-body-sm text-fg-muted">{t('favourites.hint')}</p>
      {favourites.length === 0 ? (
        <p className="py-8 text-center text-body text-fg-muted">{t('favourites.empty')}</p>
      ) : (
        <ProductMasonry items={favourites.map((p) => ({ card: productCard(p, t, money) }))} />
      )}
    </div>
  );
}
