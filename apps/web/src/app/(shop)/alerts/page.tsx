import Link from 'next/link';
import { getNotifications, getSubscriptions } from '@/api/generated/me/me';
import type { NotificationDto } from '@/api/generated/model';
import { ProductImage } from '@/components/ui';
import { formatMoney, formatShown } from '@/lib/format';
import { INTL_LOCALE } from '@/i18n';
import { getI18n } from '@/i18n/server';
import { currentMoney, requireUser } from '@/lib/session';
import { readAllNotifications, removeSubscription, setSubscriptionActive } from '../actions';

export const dynamic = 'force-dynamic';


export default async function AlertsPage() {
  await requireUser('/alerts');
  const [{ data: notifications }, { data: subscriptions }, { t, rich, locale }, money] = await Promise.all([
    getNotifications(),
    getSubscriptions(),
    getI18n(),
    currentMoney(),
  ]);
  const when = (iso: string) =>
    new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  const unread = notifications.filter((n) => !n.readAt).length;
  // Текст мовою покупця з даних сповіщення; старі записи — готовий англійський текст
  const noticeTitle = ({ params: p, title }: NotificationDto) =>
    p ? t('alerts.noticeTitle', { product: p.product, price: formatMoney(p.price, p.currency), chain: p.chain }) : title;
  const noticeBody = ({ params: p, type, body }: NotificationDto) =>
    !p
      ? body
      : type === 'TARGET_PRICE_REACHED' && p.target !== null
        ? t('alerts.noticeTarget', { target: formatMoney(p.target, p.targetCurrency ?? p.currency) })
        : t('alerts.noticePromo', { discount: p.discount ?? 0 });

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-display font-bold">{t('alerts.title')}</h1>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-title-sm font-semibold">{unread > 0 ? t('alerts.triggeredNew', { count: unread }) : t('alerts.triggered')}</h2>
          {unread > 0 && (
            <form action={readAllNotifications}>
              <button type="submit" className="text-body-sm font-semibold text-brand">{t('alerts.markAllRead')}</button>
            </form>
          )}
        </div>
        {notifications.length === 0 ? (
          <p className="text-body text-fg-muted">{t('alerts.emptyTriggered')}</p>
        ) : (
          notifications.map((n) => (
            <Link
              key={n.id}
              href={n.productId ? `/products/${n.productId}` : '/alerts'}
              className={`block rounded-lg border p-4 ${n.readAt ? 'border-line bg-surface' : 'border-danger bg-danger-subtle'}`}
            >
              <div className="text-body font-semibold">{noticeTitle(n)}</div>
              <div className="text-body-sm text-fg-muted">{noticeBody(n)} · {when(n.createdAt)}</div>
            </Link>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-title-sm font-semibold">{t('alerts.watching')}</h2>
        {subscriptions.length === 0 && (
          <p className="text-body text-fg-muted">
            {rich('alerts.emptyWatching', { action: <span key="action" className="font-semibold">{t('product.trackPrice')}</span> })}
          </p>
        )}
        {subscriptions.map((s) => (
          <div key={s.id} className={`flex items-center gap-4 rounded-lg border border-line bg-surface p-3 ${s.isActive ? '' : 'opacity-60'}`}>
            <ProductImage src={s.imageUrl} className="size-14 shrink-0 border border-line" />
            <Link href={`/products/${s.productId}`} className="min-w-0 flex-1 space-y-0.5">
              <div className="line-clamp-2 text-body font-semibold">{s.title}</div>
              <div className="text-body-sm text-fg-muted">
                {s.targetPrice !== null
                  ? t('alerts.target', { price: formatShown(s.targetPrice, s.currency ?? s.lowest?.currency ?? 'UAH', money).text })
                  : t('alerts.anyDiscount')}
                {s.lowest && ` · ${t('alerts.now', { price: formatShown(s.lowest.price, s.lowest.currency, money).text, chain: s.lowest.chainName })}`}
              </div>
            </Link>
            <form action={setSubscriptionActive}>
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="active" value={String(!s.isActive)} />
              <button type="submit" className="text-body-sm font-semibold text-brand">{t(s.isActive ? 'alerts.pause' : 'alerts.resume')}</button>
            </form>
            <form action={removeSubscription}>
              <input type="hidden" name="id" value={s.id} />
              <button type="submit" aria-label={t('alerts.stopTracking', { title: s.title })} className="text-body-sm font-semibold text-danger">{t('alerts.remove')}</button>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}
