import Link from 'next/link';
import { Switch } from '@/components/Switch';
import { PageHeader } from '@/components/ui';
import { getT } from '@/i18n/server';
import { currentUser, guestConsent, recentlyViewed } from '@/lib/session';
import { clearHistory, setConsent } from '../../actions';

export const dynamic = 'force-dynamic';

const card = 'divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface';
const row = 'flex w-full items-center gap-3 px-4 py-3.5 text-left text-body';
const heading = 'text-caption font-semibold uppercase text-fg-muted';

/** Privacy & data (Figma 12): згода на рекомендації й історія переглядів; відкривається і гостю (з банера) */
export default async function PrivacyPage() {
  const [user, t] = await Promise.all([currentUser(), getT()]);
  const [consent, viewed] = await Promise.all([user ? null : guestConsent(), recentlyViewed(user).catch(() => [])]);
  const on = user ? user.telemetryConsent : !!consent && consent !== 'declined';

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader back={user ? '/settings' : '/'} backLabel={t('nav.back')} title={t('privacy.title')} />

      <section className="space-y-2">
        <h2 className={heading}>{t('privacy.recommendations')}</h2>
        <form action={setConsent} className={card}>
          <label className={row}>
            <span className="flex-1">{t('privacy.personalised')}</span>
            <Switch name="consent" defaultChecked={on} label={t('privacy.personalised')} />
          </label>
        </form>
        <p className="text-body-sm text-fg-muted">{t('privacy.personalisedHint')}</p>
      </section>

      <section className="space-y-2">
        <h2 className={heading}>{t('privacy.history')}</h2>
        <div className={card}>
          <Link href="/profile/viewed" className={`${row} hover:bg-page`}>
            <span className="flex-1">{t('viewed.title')}</span>
            <span className="text-body-sm text-fg-muted tabular-nums">{t('viewed.items', { count: viewed.length })}</span>›
          </Link>
          {viewed.length > 0 && (
            <form action={clearHistory}>
              <button type="submit" className={`${row} text-danger hover:bg-page`}>{t('privacy.clearHistory')}</button>
            </form>
          )}
        </div>
        <p className="text-body-sm text-fg-muted">{t('privacy.historyHint')}</p>
      </section>
    </div>
  );
}
