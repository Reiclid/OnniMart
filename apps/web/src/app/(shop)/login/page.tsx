import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/AuthForm';
import { currentUser } from '@/lib/session';

export default async function LoginPage(props: PageProps<'/login'>) {
  const params = await props.searchParams;
  const next = typeof params.next === 'string' && params.next.startsWith('/') ? params.next : '/profile';
  if (await currentUser()) redirect(next);
  const mode = params.mode === 'register' ? 'register' : 'login';

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div className="space-y-1">
        <h1 className="text-display font-bold">{mode === 'register' ? 'Create account' : 'Sign in'}</h1>
        <p className="text-body text-fg-muted">Track prices and get told when they drop.</p>
      </div>
      <AuthForm mode={mode} next={next} />
    </div>
  );
}
