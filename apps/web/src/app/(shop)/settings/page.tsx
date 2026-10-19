import { getChains } from '@/api/generated/monitoring/monitoring';
import { buttonStyles } from '@/components/ui';
import { requireUser } from '@/lib/session';
import { deleteAccount, saveSettings } from '../actions';

export const dynamic = 'force-dynamic';

const card = 'divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface';
const row = 'flex items-center gap-3 px-4 py-3.5 text-body';
const heading = 'text-caption font-semibold uppercase text-fg-muted';

export default async function SettingsPage() {
  const user = await requireUser('/settings');
  const { data: chains } = await getChains({ status: ['ACTIVE'] });

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-display font-bold">Settings</h1>
      <form action={saveSettings} className="space-y-6">
        <section className="space-y-2">
          <h2 className={heading}>Notifications</h2>
          <div className={card}>
            <label className={row}>
              <span className="flex-1">Push notifications</span>
              <input type="checkbox" name="notifyPush" defaultChecked={user.notifyPush} className="size-5 accent-brand" />
            </label>
            <label className={row}>
              <span className="flex-1">Email</span>
              <input type="checkbox" name="notifyEmail" defaultChecked={user.notifyEmail} className="size-5 accent-brand" />
            </label>
            <label className={row}>
              <span className="flex-1">Only discounts from</span>
              <select name="minDiscount" defaultValue={user.minDiscount} className="bg-transparent text-body-sm text-fg-muted">
                {[0, 10, 20, 30, 50].map((v) => (
                  <option key={v} value={v}>{v === 0 ? 'Any discount' : `${v} %`}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className={heading}>Preferred chains</h2>
          <p className="text-body-sm text-fg-muted">New price alerts watch only these chains. None selected — all chains.</p>
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

        <button type="submit" className={`${buttonStyles.primary} w-full`}>Save settings</button>
      </form>

      <details className="space-y-3">
        <summary className="cursor-pointer text-body-sm font-semibold text-danger">Delete account</summary>
        <p className="text-body-sm text-fg-muted">Your price alerts and notifications are deleted too. This cannot be undone.</p>
        <form action={deleteAccount}>
          <button type="submit" className={`${buttonStyles.secondary} w-full text-danger`}>Yes, delete my account</button>
        </form>
      </details>
    </div>
  );
}
