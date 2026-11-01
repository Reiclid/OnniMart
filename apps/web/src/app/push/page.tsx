import { redirect } from 'next/navigation';
import { getPushKey } from '@/api/generated/push/push';
import { PushPrompt } from '@/components/PushPrompt';
import { requireUser } from '@/lib/session';
import { safeNext } from '@/lib/sign-in';

/** Після реєстрації (Figma 25): запропонувати push на цей телефон; без VAPID на сервері — далі одразу */
export default async function PushPage(props: PageProps<'/push'>) {
  const next = safeNext((await props.searchParams).next);
  await requireUser(`/push?${new URLSearchParams({ next })}`);
  const publicKey = await getPushKey().then((r) => r.data.publicKey, () => null);
  if (!publicKey) redirect(next);
  return <PushPrompt publicKey={publicKey} next={next} />;
}
