'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { authenticate } from '@/app/(shop)/actions';
import { useT } from '@/i18n/client';
import { buttonStyles, ChevronLeftIcon, EyeIcon, EyeOffIcon } from './ui';

const field = 'h-13 w-full rounded-md border bg-surface px-4 text-body outline-none placeholder:text-fg-muted focus:border-accent';

/** Вхід або реєстрація (Figma 22–24): заголовок, Google, email і пароль по центру, кнопка знизу */
export function AuthForm({ mode, next, google, error }: { mode: 'login' | 'register'; next: string; google: boolean; error: string | null }) {
  const t = useT();
  const [state, action, pending] = useActionState(authenticate, { error: null });
  const register = mode === 'register';
  const other = `/login?${new URLSearchParams({ ...(register ? {} : { mode: 'register' }), next })}`;
  const message = state.error ?? error;

  return (
    <form action={action} className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-[34px]">
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="next" value={next} />
      <div className="flex h-25 items-center">
        <Link href="/" aria-label={t('nav.back')} className="press grid size-11 place-items-center rounded-md bg-surface text-icon">
          <ChevronLeftIcon width={22} height={22} />
        </Link>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-4 pb-8">
        <h1 className="mb-1 text-center text-display-lg font-bold">{t(register ? 'auth.createAccount' : 'auth.signIn')}</h1>
        {google && (
          <>
            {/* Обробник маршруту веде на Google — звичайне посилання, не клієнтський перехід */}
            <a href={`/auth/google?${new URLSearchParams({ next })}`} className={`${buttonStyles.secondary} h-13 w-full border-line-strong`}>
              <GoogleLogo />
              {t('auth.google')}
            </a>
            <p className="flex items-center gap-3 text-body-sm font-medium text-fg-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
              {t('auth.or')}
            </p>
          </>
        )}
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder={t('auth.email')}
          aria-label={t('auth.email')}
          className={`${field} border-line-strong`}
        />
        <PasswordField
          name="password"
          label={t('auth.password')}
          autoComplete={register ? 'new-password' : 'current-password'}
          invalid={!register && state.error !== null}
        />
        {register && <PasswordField name="password2" label={t('auth.repeatPassword')} autoComplete="new-password" invalid={false} />}
        {message && (
          <p role="alert" className="text-body-sm font-medium text-danger">
            {message}
          </p>
        )}
      </div>

      <button type="submit" disabled={pending} className={`${buttonStyles.primary} w-full disabled:opacity-60`}>
        {t(register ? 'auth.createAccount' : 'auth.signIn')}
      </button>
      <Link href={other} className="press mt-3 self-center px-2 py-1 text-body font-semibold text-brand">
        {t(register ? 'auth.haveAccount' : 'auth.createAccount')}
      </Link>
    </form>
  );
}

function PasswordField({ name, label, autoComplete, invalid }: { name: string; label: string; autoComplete: string; invalid: boolean }) {
  const t = useT();
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        name={name}
        type={shown ? 'text' : 'password'}
        required
        minLength={8}
        maxLength={200}
        autoComplete={autoComplete}
        placeholder={label}
        aria-label={label}
        aria-invalid={invalid || undefined}
        className={`${field} pr-12 ${invalid ? 'border-2 border-danger' : 'border-line-strong'}`}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={t(shown ? 'auth.hidePassword' : 'auth.showPassword')}
        aria-pressed={shown}
        className="absolute inset-y-0 right-1 grid w-11 place-items-center text-icon-muted"
      >
        {shown ? <EyeOffIcon width={22} height={22} /> : <EyeIcon width={22} height={22} />}
      </button>
    </div>
  );
}

/** Логотип Google за правилами бренду: чотири кольори, не перефарбовується */
function GoogleLogo() {
  return (
    <svg width={20} height={20} viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
