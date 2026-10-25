import { getChains } from '@/api/generated/monitoring/monitoring';
import { buttonStyles } from '@/components/ui';
import { getT } from '@/i18n/server';
import { requireUser } from '@/lib/session';
import { deleteAccount, saveSettings } from '../actions';

export const dynamic = 'force-dynamic';

const card = 'divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface';
const row = 'flex items-center gap-3 px-4 py-3.5 text-body';
const heading = 'text-caption font-semibold uppercase text-fg-muted';

export default async function SettingsPage() {
  const user = await requireUser('/settings');
  const [{ data: chains }, t] = await Promise.all([getChains({ status: ['ACTIVE'] }), getT()]);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-display font-bold">{t('settings.title')}</h1>
      <form action={saveSettings} className="space-y-6">
        <section className="space-y-2">
          <h2 className={heading}>{t('settings.notifications')}</h2>
          <div className={card}>
            <label className={row}>
              <span className="flex-1">{t('settings.push')}</span>
              <input type="checkbox" name="notifyPush" defaultChecked={user.notifyPush} className="size-5 accent-brand" />
            </label>
            <label className={row}>
              <span className="flex-1">{t('settings.email')}</span>
              <input type="checkbox" name="notifyEmail" defaultChecked={user.notifyEmail} className="size-5 accent-brand" />
            </label>
            <label className={row}>
              <span className="flex-1">{t('settings.minDiscount')}</span>
              <select name="minDiscount" defaultValue={user.minDiscount} className="bg-transparent text-body-sm text-fg-muted">
                {[0, 10, 20, 30, 50].map((v) => (
                  <option key={v} value={v}>{v === 0 ? t('settings.anyDiscount') : `${v} %`}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className={heading}>{t('settings.preferredChains')}</h2>
          <p className="text-body-sm text-fg-muted">{t('settings.preferredHint')}</p>
          <div className={card}>
            {chains.map((chain) => (
              <label key={chain.id} className={row}>
                <span className="flex-1">{chain.name}</span>
                <span className="text-caption text-fg-muted">{chain.countryCode}</span>
                <input type="checkbox" name="chainIds" value={chain.id} defaultChecked={user.chainIds.includes(chain.id)} className="size-5 accent-brand" />
              </label>
            ))}
          </div>
        </section>

        <button type="submit" className={`${buttonStyles.primary} w-full`}>{t('settings.save')}</button>
      </form>

      <details className="space-y-3">
        <summary className="cursor-pointer text-body-sm font-semibold text-danger">{t('settings.deleteAccount')}</summary>
        <p className="text-body-sm text-fg-muted">{t('settings.deleteWarning')}</p>
        <form action={deleteAccount}>
          <button type="submit" className={`${buttonStyles.secondary} w-full text-danger`}>{t('settings.deleteConfirm')}</button>
        </form>
      </details>
    </div>
  );
}
