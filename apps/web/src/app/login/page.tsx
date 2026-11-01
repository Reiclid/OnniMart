import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/AuthForm';
import { getT } from '@/i18n/server';
import { currentUser } from '@/lib/session';
import { safeNext } from '@/lib/sign-in';

/** Вхід і реєстрація (Figma 22–24): як онбординг — без шапки й таб-бару */
export default async function LoginPage(props: PageProps<'/login'>) {
  const params = await props.searchParams;
  const next = safeNext(params.next);
  if (await currentUser()) redirect(next);
  const t = await getT();

  return (
    <AuthForm
      mode={params.mode === 'register' ? 'register' : 'login'}
      next={next}
      google={Boolean(process.env.GOOGLE_CLIENT_ID)}
      error={params.error === 'google' ? t('auth.errors.google') : null}
    />
  );
}
