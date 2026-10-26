import Link from 'next/link';
import { CountryOptions } from '@/components/CountryOptions';
import { listStyles as s, PageHeader } from '@/components/ui';
import { INTL_LOCALE } from '@/i18n';
import { getI18n } from '@/i18n/server';
import { convertPrice, countryList } from '@/lib/country';
import { currencySymbol, formatMoney } from '@/lib/format';
import { currentCountry, currentCurrency, currentUser, exchangeRates } from '@/lib/session';
import { setCountry } from '../../actions';

export const dynamic = 'force-dynamic';

/** Country & currency (Figma 17): вибір країни зберігається одразу; валюта показу — окремий екран (Figma 21) */
export default async function CountrySettingsPage() {
  const [user, { t, locale }, country, rates] = await Promise.all([currentUser(), getI18n(), currentCountry(), exchangeRates()]);
  const intl = INTL_LOCALE[locale];
  const { currency, auto } = await currentCurrency(country);
  const symbol = currencySymbol(currency);
  // Курс пари наших країн: 1 € у гривнях
  const uah = rates && convertPrice(1, 'EUR', 'UAH', rates.perEur);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader back={user ? '/settings' : '/'} backLabel={t('nav.back')} title={t('countrySettings.title')} />

      <section className="space-y-2">
        <h2 className={s.heading}>{t('countrySettings.country')}</h2>
        <form action={setCountry}>
          <CountryOptions countries={countryList(intl)} defaultCountry={country} submitOnChange />
        </form>
        <p className={s.hint}>{t('countrySettings.countryHint')}</p>
      </section>

      <section className="space-y-2">
        <h2 className={s.heading}>{t('countrySettings.currency')}</h2>
        <div className={s.card}>
          <Link href="/settings/currency" className={`${s.row} ${s.link}`}>
            <span className="flex-1">{t('countrySettings.pricesIn')}</span>
            <span className={s.value}>
              {auto ? t('currencySettings.auto') : new Intl.DisplayNames([intl], { type: 'currency' }).of(currency)} · {symbol}
            </span>
            <span aria-hidden className="text-fg-muted">›</span>
          </Link>
        </div>
        <p className={s.hint}>
          {t('countrySettings.currencyHint', { currency: symbol })}
          {uah && rates && (
            <>
              {' '}
              <span className="tabular-nums">
                {t('countrySettings.rate', {
                  rate: `${formatMoney(1, 'EUR')} = ${formatMoney(uah, 'UAH')}`,
                  date: new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'short' }).format(new Date(rates.date)),
                })}
              </span>
            </>
          )}
        </p>
      </section>
    </div>
  );
}
