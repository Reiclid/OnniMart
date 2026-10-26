import { getChains } from '@/api/generated/monitoring/monitoring';
import { ChoiceRow } from '@/components/ChoiceRow';
import { listStyles as s, PageHeader } from '@/components/ui';
import { INTL_LOCALE } from '@/i18n';
import { getI18n } from '@/i18n/server';
import { currentCountry, requireUser } from '@/lib/session';
import { saveChains } from '../../actions';

export const dynamic = 'force-dynamic';

/** Preferred chains (Figma 18): мережі за країнами, своя країна першою; кожна галочка зберігається одразу */
export default async function PreferredChainsPage() {
  const user = await requireUser('/settings/chains');
  const [{ data: chains }, { t, locale }, country] = await Promise.all([getChains({ status: ['ACTIVE'] }), getI18n(), currentCountry()]);
  const regions = new Intl.DisplayNames([INTL_LOCALE[locale]], { type: 'region' });
  const countries = [...new Set(chains.map((c) => c.countryCode))].sort((a, b) => Number(b === country) - Number(a === country));

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader back="/settings" backLabel={t('nav.back')} title={t('settings.preferredChains')} />
      <form action={saveChains} className="space-y-6">
        {countries.map((code, i) => (
          <section key={code} className="space-y-2">
            <h2 className={s.heading}>{regions.of(code) ?? code}</h2>
            <div className={s.card}>
              {chains
                .filter((c) => c.countryCode === code)
                .map((chain) => (
                  <ChoiceRow key={chain.id} type="checkbox" name="chainIds" value={chain.id} defaultChecked={user.chainIds.includes(chain.id)}>
                    {chain.name}
                  </ChoiceRow>
                ))}
            </div>
            {i === 0 && <p className={s.hint}>{t('settings.preferredHint')}</p>}
          </section>
        ))}
      </form>
    </div>
  );
}
