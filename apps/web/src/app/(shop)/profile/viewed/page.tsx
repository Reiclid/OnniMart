import { productCard } from '@/components/ProductCard';
import { ProductMasonry } from '@/components/ProductMasonry';
import { PageHeader } from '@/components/ui';
import { getT } from '@/i18n/server';
import { currentMoney, currentUser, recentlyViewed } from '@/lib/session';
import { clearHistory } from '../../actions';

export const dynamic = 'force-dynamic';

/** Нещодавно переглянуті (Figma 11): покупця — з акаунта, гостя — з цього пристрою */
export default async function RecentlyViewedPage() {
  const [user, t, money] = await Promise.all([currentUser(), getT(), currentMoney()]);
  const viewed = await recentlyViewed(user);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        back={user ? '/profile' : '/'}
        backLabel={t('nav.back')}
        title={t('viewed.title')}
        action={
          viewed.length > 0 && (
            <form action={clearHistory}>
              <button type="submit" className="press px-1 text-body font-semibold text-brand">{t('viewed.clear')}</button>
            </form>
          )
        }
      />
      <p className="text-body-sm text-fg-muted">{t('viewed.hint')}</p>
      {viewed.length === 0 ? (
        <p className="py-8 text-center text-body text-fg-muted">{t('viewed.empty')}</p>
      ) : (
        <ProductMasonry items={viewed.map((p) => ({ card: productCard(p, t, money) }))} />
      )}
    </div>
  );
}
