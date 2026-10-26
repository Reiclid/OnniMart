import { ChoiceRow } from '@/components/ChoiceRow';
import { listStyles as s, PageHeader } from '@/components/ui';
import { getT } from '@/i18n/server';
import { requireUser } from '@/lib/session';
import { saveDiscount } from '../../actions';

export const dynamic = 'force-dynamic';

const DISCOUNTS = [0, 10, 20, 30, 50];

/** Only discounts from (Figma 19): одна відповідь, зберігається одразу */
export default async function DiscountPage() {
  const [user, t] = await Promise.all([requireUser('/settings/discount'), getT()]);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader back="/settings" backLabel={t('nav.back')} title={t('settings.minDiscount')} />
      <section className="space-y-2">
        <h2 className={s.heading}>{t('profile.priceAlerts')}</h2>
        <form action={saveDiscount} className={s.card}>
          {DISCOUNTS.map((v) => (
            <ChoiceRow key={v} type="radio" name="minDiscount" value={String(v)} defaultChecked={user.minDiscount === v}>
              {v === 0 ? t('settings.anyDiscount') : `${v} %`}
            </ChoiceRow>
          ))}
        </form>
        <p className={s.hint}>{t('settings.discountHint')}</p>
      </section>
    </div>
  );
}
