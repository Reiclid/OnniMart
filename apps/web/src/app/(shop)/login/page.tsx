import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/AuthForm';
import { getT } from '@/i18n/server';
import { currentUser } from '@/lib/session';

export default async function LoginPage(props: PageProps<'/login'>) {
  const params = await props.searchParams;
  const next = typeof params.next === 'string' && params.next.startsWith('/') ? params.next : '/profile';
  if (await currentUser()) redirect(next);
  const mode = params.mode === 'register' ? 'register' : 'login';
  const t = await getT();

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div className="space-y-1">
        <h1 className="text-display font-bold">{t(mode === 'register' ? 'auth.createAccount' : 'auth.signIn')}</h1>
        <p className="text-body text-fg-muted">{t('auth.tagline')}</p>
      </div>
      <AuthForm mode={mode} next={next} />
    </div>
  );
}
