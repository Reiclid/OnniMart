import { ChoiceRow } from '@/components/ChoiceRow';
import { listStyles as s, PageHeader } from '@/components/ui';
import { INTL_LOCALE } from '@/i18n';
import { getI18n } from '@/i18n/server';
import { COUNTRIES, POPULAR_CURRENCIES } from '@/lib/country';
import { currencySymbol } from '@/lib/format';
import { currentCountry, currentCurrency, exchangeRates } from '@/lib/session';
import { setCurrency } from '../../actions';

export const dynamic = 'force-dynamic';

/** Currency (Figma 21): валюта показу окремо від країни; «Automatic» — валюта країни. Зберігається одразу */
export default async function CurrencyPage() {
  const [{ t, locale }, country, rates] = await Promise.all([getI18n(), currentCountry(), exchangeRates()]);
  const { currency, auto } = await currentCurrency(country);
  const names = new Intl.DisplayNames([INTL_LOCALE[locale]], { type: 'currency' });
  // Без курсів перерахувати не вийде — лишаються валюти наших країн
  const known = rates ? Object.keys(rates.perEur) : Object.values(COUNTRIES).map((c) => c.currency);
  // "₴", "zł"; спільний вузький символ ("$", "¥") — однозначний: "A$", "CA$"
  const narrow = known.map((c) => currencySymbol(c));
  const label = (code: string) => {
    const symbol = currencySymbol(code);
    return `${names.of(code) ?? code} · ${narrow.filter((n) => n === symbol).length > 1 ? currencySymbol(code, 'symbol') : symbol}`;
  };
  const popular = POPULAR_CURRENCIES.filter((c) => known.includes(c));
  const rest = known.filter((c) => !popular.includes(c)).sort((a, b) => label(a).localeCompare(label(b), INTL_LOCALE[locale]));
  const rows = (codes: string[]) =>
    codes.map((code) => (
      <ChoiceRow key={code} type="radio" name="currency" value={code} defaultChecked={!auto && code === currency}>
        {label(code)}
      </ChoiceRow>
    ));

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader back="/settings/country" backLabel={t('nav.back')} title={t('currencySettings.title')} />
      <form action={setCurrency} className="space-y-6">
        <section className="space-y-2">
          <h2 className={s.heading}>{t('currencySettings.display')}</h2>
          <div className={s.card}>
            <ChoiceRow type="radio" name="currency" value="auto" defaultChecked={auto}>
              <span className="flex items-center justify-between gap-3">
                {t('currencySettings.auto')}
                <span className={s.value}>{t('currencySettings.byCountry', { symbol: currencySymbol(COUNTRIES[country].currency) })}</span>
              </span>
            </ChoiceRow>
          </div>
        </section>
        <section className="space-y-2">
          <h2 className={s.heading}>{t('currencySettings.popular')}</h2>
          <div className={s.card}>{rows(popular)}</div>
        </section>
        {rest.length > 0 && (
          <section className="space-y-2">
            <h2 className={s.heading}>{t('currencySettings.all')}</h2>
            <div className={s.card}>{rows(rest)}</div>
            <p className={s.hint}>{t('currencySettings.hint')}</p>
          </section>
        )}
      </form>
    </div>
  );
}
