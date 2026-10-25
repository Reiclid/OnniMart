'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createT, DEFAULT_LOCALE, translateRich, type Locale, type MessageKey } from '.';

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** Мова для клієнтських компонентів; ставить кореневий layout з тієї ж cookie, що й сервер */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useT() {
  const locale = useLocale();
  return useMemo(() => {
    const t = createT(locale);
    const rich = (key: MessageKey, params: Record<string, ReactNode>) => translateRich(locale, key, params);
    return Object.assign(t, { rich });
  }, [locale]);
}
