import Link from 'next/link';
import { setConsent } from '@/app/(shop)/actions';
import { getT } from '@/i18n/server';
import { buttonStyles } from './ui';

/** Гість ще не відповів: чи можна впорядковувати Home і пошук за його переглядами (Figma 10) */
export async function ConsentBanner() {
  const t = await getT();
  return (
    <section
      aria-labelledby="consent-title"
      className="appear fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 space-y-3 rounded-lg border border-line bg-surface p-5 shadow-overlay [--appear-y:16px] md:inset-x-auto md:right-6 md:bottom-6 md:w-96"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="consent-title" className="text-body font-semibold">{t('consent.title')}</h2>
        <Link href="/settings/privacy" className="shrink-0 text-body-sm font-semibold text-brand">{t('consent.howWeUse')}</Link>
      </div>
      <p className="text-body-sm text-fg-muted">{t('consent.text')}</p>
      <form action={setConsent} className="grid grid-cols-2 gap-2">
        <button type="submit" name="consent" value="off" className={buttonStyles.secondary}>{t('consent.decline')}</button>
        <button type="submit" name="consent" value="on" className={buttonStyles.primary}>{t('consent.accept')}</button>
      </form>
    </section>
  );
}
