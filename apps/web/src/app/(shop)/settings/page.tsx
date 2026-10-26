import { getChains } from '@/api/generated/monitoring/monitoring';
import Link from 'next/link';
import { DeleteAccount } from '@/components/DeleteAccount';
import { Switch } from '@/components/Switch';
import { listStyles as s, PageHeader } from '@/components/ui';
import { INTL_LOCALE } from '@/i18n';
import { getI18n } from '@/i18n/server';
import { countryList } from '@/lib/country';
import { currentCountry, requireUser } from '@/lib/session';
import { saveNotifications } from '../actions';

export const dynamic = 'force-dynamic';

/** Settings (Figma 08): перемикачі зберігаються одразу, решта рядків веде на підекрани 17–20 */
export default async function SettingsPage() {
  const user = await requireUser('/settings');
  const [{ data: chains }, { t, locale }, country] = await Promise.all([getChains({ status: ['ACTIVE'] }), getI18n(), currentCountry()]);
  const preferred = chains.filter((c) => user.chainIds.includes(c.id)).map((c) => c.name);
  const link = (href: string, label: string, value?: string) => (
    <Link href={href} className={`${s.row} ${s.link}`}>
      <span className="flex-1">{label}</span>
      {value && <span className={s.value}>{value}</span>}
      <span aria-hidden className="text-fg-muted">›</span>
    </Link>
  );

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader back="/profile" backLabel={t('nav.back')} title={t('settings.title')} />

      <section className="space-y-2">
        <h2 className={s.heading}>{t('settings.notifications')}</h2>
        <div className={s.card}>
          <form action={saveNotifications} className="divide-y divide-line">
            <label className={s.row}>
              <span className="flex-1">{t('settings.push')}</span>
              <Switch name="notifyPush" defaultChecked={user.notifyPush} label={t('settings.push')} />
            </label>
            <label className={s.row}>
              <span className="flex-1">{t('settings.email')}</span>
              <Switch name="notifyEmail" defaultChecked={user.notifyEmail} label={t('settings.email')} />
            </label>
          </form>
          {link('/settings/discount', t('settings.minDiscount'), user.minDiscount ? `${user.minDiscount} %` : t('settings.anyDiscount'))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className={s.heading}>{t('settings.shopping')}</h2>
        <div className={s.card}>
          {link('/settings/country', t('settings.country'), countryList(INTL_LOCALE[locale]).find((c) => c.code === country)?.name)}
          {link('/settings/chains', t('settings.preferredChains'), preferred.length > 0 ? preferred.join(', ') : t('settings.allChains'))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className={s.heading}>{t('settings.account')}</h2>
        <div className={s.card}>
          {link('/settings/privacy', t('privacy.title'))}
          <DeleteAccount />
        </div>
      </section>
    </div>
  );
}
