'use client';

import type { Country } from '@/lib/country';

/**
 * Картки країн (Figma 15 Onboarding, 17 Country & currency): код у колі, назва, радіо.
 * `submitOnChange` — у налаштуваннях вибір зберігається одразу.
 */
export function CountryOptions({
  countries,
  defaultCountry,
  submitOnChange,
}: {
  countries: { code: Country; name: string }[];
  defaultCountry: Country;
  submitOnChange?: boolean;
}) {
  return (
    <div className="space-y-2">
      {countries.map(({ code, name }) => (
        <label
          key={code}
          className="press-card flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3.5 [--press-scale:0.99] has-checked:border-accent has-checked:bg-selected"
        >
          <input
            type="radio"
            name="country"
            value={code}
            defaultChecked={code === defaultCountry}
            onChange={submitOnChange ? (e) => e.currentTarget.form?.requestSubmit() : undefined}
            className="peer sr-only"
          />
          <span className="grid size-10 place-items-center rounded-full bg-page text-body-sm font-semibold peer-checked:bg-brand peer-checked:text-white">
            {code}
          </span>
          <span className="flex-1 text-body font-semibold">{name}</span>
          <span className="grid size-[22px] place-items-center rounded-full border-2 border-line-strong peer-checked:border-accent peer-checked:*:scale-100">
            <span className="size-2.5 scale-0 rounded-full bg-brand transition-[scale] duration-(--duration-spring-snappy) ease-spring-snappy" />
          </span>
        </label>
      ))}
    </div>
  );
}
