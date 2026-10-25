'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { authenticate } from '@/app/(shop)/actions';
import { useT } from '@/i18n/client';
import { buttonStyles } from './ui';

const input = 'w-full rounded-md border border-line bg-surface px-4 py-3 text-body outline-none focus:border-accent';

/** Вхід або реєстрація (одна форма, режим з адреси) */
export function AuthForm({ mode, next }: { mode: 'login' | 'register'; next: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(authenticate, { error: null });
  const register = mode === 'register';
  const other = `/login?${new URLSearchParams({ ...(register ? {} : { mode: 'register' }), next })}`;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="next" value={next} />
      {register && (
        <label className="block space-y-1">
          <span className="text-body-sm font-semibold">{t('auth.name')}</span>
          <input name="name" autoComplete="given-name" maxLength={100} className={input} />
        </label>
      )}
      <label className="block space-y-1">
        <span className="text-body-sm font-semibold">{t('auth.email')}</span>
        <input name="email" type="email" required autoComplete="email" className={input} />
      </label>
      <label className="block space-y-1">
        <span className="text-body-sm font-semibold">{t('auth.password')}</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={register ? 'new-password' : 'current-password'}
          className={input}
        />
      </label>
      {state.error && <p role="alert" className="text-body-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className={`${buttonStyles.primary} w-full disabled:opacity-60`}>
        {t(register ? 'auth.createAccount' : 'auth.signIn')}
      </button>
      <p className="text-center text-body-sm text-fg-muted">
        {t(register ? 'auth.haveAccount' : 'auth.newHere')}{' '}
        <Link href={other} className="font-semibold text-brand">
          {t(register ? 'auth.signIn' : 'auth.createAnAccount')}
        </Link>
      </p>
    </form>
  );
}
