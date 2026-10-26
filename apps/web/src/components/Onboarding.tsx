'use client';

import { useState, type ReactNode } from 'react';
import { finishOnboarding } from '@/app/(shop)/actions';
import { useT } from '@/i18n/client';
import type { Country } from '@/lib/country';
import { CountryOptions } from './CountryOptions';
import { buttonStyles } from './ui';

const STEPS = 3;

/**
 * Три кроки першого запуску (Figma 14–16): навіщо, країна, що купуєш. Усі поля в одній формі —
 * кроки лише ховаються, тож «Done» надсилає все разом; «Skip» на будь-якому кроці — без вибору.
 */
export function Onboarding({
  hero,
  countries,
  defaultCountry,
  categories,
}: {
  hero: ReactNode;
  countries: { code: Country; name: string }[];
  defaultCountry: Country;
  categories: { slug: string; name: string }[];
}) {
  const t = useT();
  const [step, setStep] = useState(1);
  const next = () => setStep((s) => s + 1);

  return (
    <form action={finishOnboarding} className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-[34px]">
      <div className="flex h-25 items-center justify-between">
        <div className="flex items-center gap-1.5" role="img" aria-label={t('onboarding.progress', { step, total: STEPS })}>
          {Array.from({ length: STEPS }, (_, i) => (
            <span
              key={i}
              className={`h-2 rounded-full transition-[width,background-color] duration-(--duration-spring-smooth) ease-spring-smooth ${
                i + 1 === step ? 'w-5 bg-brand' : 'w-2 bg-line-strong'
              }`}
            />
          ))}
        </div>
        <button type="submit" name="skip" value="1" className="press -mr-1 px-1 py-3 text-body font-semibold text-brand">
          {t('onboarding.skip')}
        </button>
      </div>

      {/* Крок проявляється знизу (starting-style спрацьовує, коли знімається hidden); поля не перемонтовуються */}
      <div className="flex flex-1 flex-col justify-center pb-8 *:transition-[opacity,translate] *:duration-(--duration-base) *:ease-enter *:starting:translate-y-3 *:starting:opacity-0">
        <section hidden={step !== 1} className="space-y-6">
          {hero}
          <h1 className="text-display font-bold whitespace-pre-line">{t('onboarding.welcome')}</h1>
        </section>

        <section hidden={step !== 2} className="space-y-6">
          <h1 className="text-display font-bold">{t('onboarding.country')}</h1>
          <CountryOptions countries={countries} defaultCountry={defaultCountry} />
        </section>

        <section hidden={step !== 3} className="space-y-6">
          <h1 className="text-display font-bold">{t('onboarding.interests')}</h1>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <label
                key={c.slug}
                className="press cursor-pointer rounded-full border border-line bg-surface px-3.5 py-2 text-body-sm font-semibold [--press-scale:0.96] has-checked:border-accent has-checked:bg-selected has-checked:text-brand"
              >
                <input type="checkbox" name="interest" value={c.slug} className="sr-only" />
                {c.name}
              </label>
            ))}
          </div>
        </section>
      </div>

      {step < STEPS ? (
        <button type="button" onClick={next} className={`${buttonStyles.primary} w-full`}>
          {t(step === 1 ? 'onboarding.getStarted' : 'onboarding.continue')}
        </button>
      ) : (
        <button type="submit" className={`${buttonStyles.primary} w-full`}>
          {t('onboarding.done')}
        </button>
      )}
    </form>
  );
}
