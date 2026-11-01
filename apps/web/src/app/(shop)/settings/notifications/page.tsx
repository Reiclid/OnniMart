import Link from 'next/link';
import { getDevices } from '@/api/generated/me/me';
import { getPushKey } from '@/api/generated/push/push';
import { PushControls } from '@/components/PushControls';
import { listStyles as s, PageHeader } from '@/components/ui';
import { getT } from '@/i18n/server';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Settings → Notifications (Figma 26): push цього телефона, поріг знижки, інші пристрої */
export default async function NotificationSettingsPage() {
  const user = await requireUser('/settings/notifications');
  const [t, publicKey, { data: devices }] = await Promise.all([
    getT(),
    getPushKey().then((r) => r.data.publicKey, () => null),
    getDevices(),
  ]);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader back="/settings" backLabel={t('nav.back')} title={t('notificationSettings.title')} />
      <PushControls
        publicKey={publicKey}
        devices={devices}
        middle={
          <section className="space-y-2">
            <h2 className={s.heading}>{t('notificationSettings.discounts')}</h2>
            <div className={s.card}>
              <Link href="/settings/discount" className={`${s.row} ${s.link}`}>
                <span className="flex-1">{t('notificationSettings.from')}</span>
                <span className={s.value}>{user.minDiscount ? `${user.minDiscount} %` : t('settings.anyDiscount')}</span>
                <span aria-hidden className="text-fg-muted">›</span>
              </Link>
            </div>
          </section>
        }
      />
    </div>
  );
}
