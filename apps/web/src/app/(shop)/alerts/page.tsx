import Link from 'next/link';
import { getProductsByIds } from '@/api/generated/catalog/catalog';
import { getNotifications, getSubscriptions } from '@/api/generated/me/me';
import type { NotificationDto, SubscriptionDto } from '@/api/generated/model';
import { Switch } from '@/components/Switch';
import { ProductImage } from '@/components/ui';
import { INTL_LOCALE } from '@/i18n';
import { getI18n } from '@/i18n/server';
import { formatMoney, formatShown, relativeTime, targetProgress } from '@/lib/format';
import { currentMoney, requireUser } from '@/lib/session';
import { readAllNotifications, removeSubscription, setSubscriptionActive } from '../actions';

export const dynamic = 'force-dynamic';

const card = 'flex items-start gap-3 rounded-lg border border-line bg-surface p-3.5';
const thumb = 'size-14 shrink-0 border border-line p-1';

/** Сповіщення (Figma: 05 Alerts — redesign): що спрацювало, далі підписки з прогресом до цілі */
export default async function AlertsPage() {
  await requireUser('/alerts');
  const [{ data: notifications }, { data: subscriptions }, { t, rich, locale }, money] = await Promise.all([
    getNotifications(),
    getSubscriptions(),
    getI18n(),
    currentMoney(),
  ]);
  // Фото для сповіщень — з карток товарів (у самому сповіщенні його немає)
  const ids = [...new Set(notifications.map((n) => n.productId).filter((id): id is string => !!id))].slice(0, 50);
  const photos = new Map(
    ids.length ? (await getProductsByIds({ ids }).catch(() => ({ data: [] }))).data.map((p) => [p.id, p.imageUrl]) : [],
  );
  const now = Date.now();
  const ago = (iso: string) => new Intl.RelativeTimeFormat(INTL_LOCALE[locale], { numeric: 'auto' }).format(...relativeTime(iso, now));
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-display font-bold">{t('alerts.title')}</h1>
        {unread > 0 && (
          <form action={readAllNotifications}>
            <button type="submit" className="text-body-sm font-semibold text-brand">{t('alerts.markAllRead')}</button>
          </form>
        )}
      </div>

      <h2 className="flex items-center gap-2 pt-2 text-body-sm font-semibold text-fg-muted">
        {t('alerts.priceDrops')}
        {unread > 0 && (
          <span className="rounded-full bg-danger px-2 py-0.5 text-caption text-white tabular-nums">{t('alerts.newCount', { count: unread })}</span>
        )}
      </h2>
      {notifications.length === 0 ? (
        <p className="text-body text-fg-muted">{t('alerts.emptyTriggered')}</p>
      ) : (
        notifications.map((n) => (
          <Link key={n.id} href={n.productId ? `/products/${n.productId}` : '/alerts'} className={`${card} press-card hover:border-line-strong`}>
            <ProductImage src={(n.productId && photos.get(n.productId)) || null} className={thumb} />
            <Notice n={n} meta={ago(n.createdAt)} />
            {!n.readAt && <span aria-label={t('alerts.unread')} className="mt-1.5 size-2.5 shrink-0 rounded-full bg-brand" />}
          </Link>
        ))
      )}

      <h2 className="pt-4 text-body-sm font-semibold text-fg-muted">{t('alerts.watching', { count: subscriptions.length })}</h2>
      {subscriptions.length === 0 && (
        <p className="text-body text-fg-muted">
          {rich('alerts.emptyWatching', { action: <span key="action" className="font-semibold">{t('product.trackPrice')}</span> })}
        </p>
      )}
      {subscriptions.map((s) => (
        <div key={s.id} className={`${card} ${s.isActive ? '' : 'opacity-60'}`}>
          <ProductImage src={s.imageUrl} className={thumb} />
          <Link href={`/products/${s.productId}`} className="min-w-0 flex-1 space-y-1.5">
            <div className="line-clamp-2 text-body font-medium">{s.title}</div>
            <span className={`inline-block rounded-sm px-2 py-0.5 text-caption font-semibold ${s.isActive ? 'bg-selected text-brand' : 'bg-page text-fg-muted'}`}>
              {!s.isActive
                ? t('alerts.paused')
                : s.targetPrice !== null
                  ? t('alerts.target', { price: formatShown(s.targetPrice, s.currency ?? s.lowest?.currency ?? 'UAH', money).text })
                  : t('alerts.anyDiscount')}
            </span>
            {s.lowest && (
              <div className="text-body-sm text-fg-muted tabular-nums">
                {t(s.isActive ? 'alerts.nowAt' : 'alerts.lastAt', { price: formatShown(s.lowest.price, s.lowest.currency, money).text, chain: s.lowest.chainName })}
              </div>
            )}
            <Progress s={s} />
          </Link>
          <div className="flex flex-col items-end gap-3">
            <form action={setSubscriptionActive}>
              <input type="hidden" name="id" value={s.id} />
              <Switch name="active" defaultChecked={s.isActive} label={t('alerts.active', { title: s.title })} />
            </form>
            <form action={removeSubscription}>
              <input type="hidden" name="id" value={s.id} />
              <button type="submit" aria-label={t('alerts.stopTracking', { title: s.title })} className="text-caption font-semibold text-fg-muted hover:text-danger">
                {t('alerts.remove')}
              </button>
            </form>
          </div>
        </div>
      ))}
      {subscriptions.length > 0 && <p className="pt-2 text-center text-body-sm text-fg-muted">{rich('alerts.emptyWatching', { action: <span key="action" className="font-semibold">{t('product.trackPrice')}</span> })}</p>}
    </div>
  );

  /** Ціна, стара ціна й знижка; під ними — мережа, ціль і коли. Старі записи — готовий текст */
  function Notice({ n, meta }: { n: NotificationDto; meta: string }) {
    const p = n.params;
    if (!p) {
      return (
        <div className="min-w-0 flex-1">
          <div className="text-body font-medium">{n.title}</div>
          <div className="text-body-sm text-fg-muted">{n.body} · {meta}</div>
        </div>
      );
    }
    const target = n.type === 'TARGET_PRICE_REACHED' && p.target !== null;
    const old = !target && p.discount ? p.price / (1 - p.discount / 100) : null;
    return (
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="line-clamp-2 text-body font-medium">{p.product}</div>
        <div className="flex flex-wrap items-baseline gap-x-1.5 tabular-nums">
          <span className={`text-title-sm font-bold ${target ? 'text-brand' : 'text-danger'}`}>{formatMoney(p.price, p.currency)}</span>
          {old && <span className="text-body-sm text-fg-muted line-through">{formatMoney(old, p.currency)}</span>}
          {old && <span className="text-body-sm font-semibold text-danger">−{p.discount}%</span>}
        </div>
        <div className="text-body-sm text-fg-muted">
          {target && `${t('alerts.noticeTarget', { target: formatMoney(p.target!, p.targetCurrency ?? p.currency) })} · `}
          {p.chain} · {meta}
        </div>
      </div>
    );
  }

  /** Смужка "скільки до цілі" — лише коли ціль і поточна ціна в одній валюті */
  function Progress({ s }: { s: SubscriptionDto }) {
    if (!s.isActive || s.targetPrice === null || !s.lowest || (s.currency ?? s.lowest.currency) !== s.lowest.currency) return null;
    const { progress, left } = targetProgress(s.targetPrice, s.lowest.price);
    return (
      <div className="space-y-1">
        <div className="h-1 overflow-hidden rounded-full bg-page">
          <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <div className="text-caption text-fg-muted tabular-nums">
          {left > 0 ? t('alerts.toGo', { price: formatShown(left, s.lowest.currency, money).text }) : t('alerts.reached')}
        </div>
      </div>
    );
  }
}
