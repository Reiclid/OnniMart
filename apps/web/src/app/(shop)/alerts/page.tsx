import Link from 'next/link';
import { getNotifications, getSubscriptions } from '@/api/generated/me/me';
import { ProductImage } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { requireUser } from '@/lib/session';
import { readAllNotifications, removeSubscription, setSubscriptionActive } from '../actions';

export const dynamic = 'force-dynamic';

const when = (iso: string) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

export default async function AlertsPage() {
  await requireUser('/alerts');
  const [{ data: notifications }, { data: subscriptions }] = await Promise.all([getNotifications(), getSubscriptions()]);
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-display font-bold">Alerts</h1>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-title-sm font-semibold">Triggered{unread > 0 && ` · ${unread} new`}</h2>
          {unread > 0 && (
            <form action={readAllNotifications}>
              <button type="submit" className="text-body-sm font-semibold text-brand">Mark all as read</button>
            </form>
          )}
        </div>
        {notifications.length === 0 ? (
          <p className="text-body text-fg-muted">Nothing yet. We check prices every 10 minutes.</p>
        ) : (
          notifications.map((n) => (
            <Link
              key={n.id}
              href={n.productId ? `/products/${n.productId}` : '/alerts'}
              className={`block rounded-lg border p-4 ${n.readAt ? 'border-line bg-surface' : 'border-danger bg-danger-subtle'}`}
            >
              <div className="text-body font-semibold">{n.title}</div>
              <div className="text-body-sm text-fg-muted">{n.body} · {when(n.createdAt)}</div>
            </Link>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-title-sm font-semibold">Watching</h2>
        {subscriptions.length === 0 && (
          <p className="text-body text-fg-muted">
            Open a product and tap <span className="font-semibold">Track price</span>.
          </p>
        )}
        {subscriptions.map((s) => (
          <div key={s.id} className={`flex items-center gap-4 rounded-lg border border-line bg-surface p-3 ${s.isActive ? '' : 'opacity-60'}`}>
            <ProductImage src={s.imageUrl} className="size-14 shrink-0 border border-line" />
            <Link href={`/products/${s.productId}`} className="min-w-0 flex-1 space-y-0.5">
              <div className="line-clamp-2 text-body font-semibold">{s.title}</div>
              <div className="text-body-sm text-fg-muted">
                {s.targetPrice !== null ? `Target ≤ ${formatMoney(s.targetPrice, s.lowest?.currency ?? 'UAH')}` : 'Any discount'}
                {s.lowest && ` · now ${formatMoney(s.lowest.price, s.lowest.currency)} at ${s.lowest.chainName}`}
              </div>
            </Link>
            <form action={setSubscriptionActive}>
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="active" value={String(!s.isActive)} />
              <button type="submit" className="text-body-sm font-semibold text-brand">{s.isActive ? 'Pause' : 'Resume'}</button>
            </form>
            <form action={removeSubscription}>
              <input type="hidden" name="id" value={s.id} />
              <button type="submit" aria-label={`Stop tracking ${s.title}`} className="text-body-sm font-semibold text-danger">Remove</button>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}
