import Link from 'next/link';
import { getFavouriteIds, getSubscriptions, getViews } from '@/api/generated/me/me';
import { INTL_LOCALE } from '@/i18n';
import { getI18n } from '@/i18n/server';
import { countryList } from '@/lib/country';
import { currencySymbol } from '@/lib/format';
import { currentCountry, currentCurrency, requireUser } from '@/lib/session';
import { signOut } from '../actions';

export const dynamic = 'force-dynamic';

const row = 'flex items-center gap-2 px-4 py-3.5 text-body transition-colors duration-(--duration-fast) hover:bg-page active:bg-page';

export default async function ProfilePage() {
  const user = await requireUser('/profile');
  const [{ data: subscriptions }, favourites, viewed, { t, locale }, country] = await Promise.all([
    getSubscriptions(),
    getFavouriteIds().then((r) => r.data.productIds.length).catch(() => 0),
    getViews().then((r) => r.data.length).catch(() => 0),
    getI18n(),
    currentCountry(),
  ]);
  const countryName = countryList(INTL_LOCALE[locale]).find((c) => c.code === country)?.name;
  const { currency } = await currentCurrency(country);
  const active = subscriptions.filter((s) => s.isActive).length;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-display font-bold">{t('profile.title')}</h1>
      <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4">
        <span className="grid size-14 place-items-center rounded-full bg-brand text-title font-bold text-white" aria-hidden>
          {(user.name ?? user.email).charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          {user.name && <div className="text-body font-semibold">{user.name}</div>}
          <div className="truncate text-body-sm text-fg-muted">{user.email}</div>
        </div>
      </div>

      <nav className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        <Link href="/alerts" className={row}>
          <span className="flex-1">{t('profile.priceAlerts')}</span>
          <span className="text-body-sm text-fg-muted tabular-nums">{t('profile.active', { count: active })}</span>›
        </Link>
        <Link href="/profile/favourites" className={row}>
          <span className="flex-1">{t('favourites.title')}</span>
          <span className="text-body-sm text-fg-muted tabular-nums">{t('favourites.items', { count: favourites })}</span>›
        </Link>
        <Link href="/profile/viewed" className={row}>
          <span className="flex-1">{t('viewed.title')}</span>
          <span className="text-body-sm text-fg-muted tabular-nums">{t('viewed.items', { count: viewed })}</span>›
        </Link>
        <Link href="/settings/country" className={row}>
          <span className="flex-1">{t('profile.countryCurrency')}</span>
          <span className="text-body-sm text-fg-muted">{countryName} · {currencySymbol(currency)}</span>›
        </Link>
        <Link href="/settings" className={row}>
          <span className="flex-1">{t('profile.settings')}</span>›
        </Link>
      </nav>

      <form action={signOut}>
        <button type="submit" className={`${row} w-full rounded-lg border border-line bg-surface`}>
          {t('profile.signOut')}
        </button>
      </form>
    </div>
  );
}
