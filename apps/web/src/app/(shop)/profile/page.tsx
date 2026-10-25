import Link from 'next/link';
import { getSubscriptions } from '@/api/generated/me/me';
import { getT } from '@/i18n/server';
import { requireUser } from '@/lib/session';
import { signOut } from '../actions';

export const dynamic = 'force-dynamic';

const row = 'flex items-center gap-2 px-4 py-3.5 text-body hover:bg-page';

export default async function ProfilePage() {
  const user = await requireUser('/profile');
  const [{ data: subscriptions }, t] = await Promise.all([getSubscriptions(), getT()]);
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
          <span className="text-body-sm text-fg-muted">{t('profile.active', { count: active })}</span>›
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
