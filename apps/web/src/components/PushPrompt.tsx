'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useT } from '@/i18n/client';
import { buttonStyles } from './ui';
import { usePush } from './usePush';

/**
 * «Price dropped? We’ll tell you.» (Figma 25): як онбординг — Skip угорі, приклад сповіщень,
 * заголовок, одна кнопка. Де push неможливий або вже увімкнений — одразу далі.
 */
export function PushPrompt({ publicKey, next }: { publicKey: string; next: string }) {
  const t = useT();
  const router = useRouter();
  const push = usePush(publicKey);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (['unsupported', 'blocked', 'on'].includes(push.state)) router.replace(next);
  }, [push.state, next, router]);

  async function turnOn() {
    setBusy(true);
    await push.enable().catch(() => false);
    router.replace(next);
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-[34px]">
      <div className="flex h-25 items-center justify-end">
        <Link href={next} replace className="press -mr-1 px-1 py-3 text-body font-semibold text-brand">
          {t('onboarding.skip')}
        </Link>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-6 pb-8">
        <div aria-hidden className="space-y-2.5 rounded-xl bg-selected px-4 py-5">
          <Sample title={t('push.example1Title')} body={t('push.example1Body')} time={t('push.now')} />
          <Sample title={t('push.example2Title')} body={t('push.example2Body')} time={t('push.hoursAgo', { count: 2 })} />
        </div>
        <h1 className="text-display font-bold whitespace-pre-line">{t('push.title')}</h1>
        {push.state === 'install' && <p className="text-body text-fg-muted">{t('push.iosInstall')}</p>}
      </div>

      {push.state !== 'install' && (
        <button type="button" onClick={turnOn} disabled={busy || push.state === 'loading'} className={`${buttonStyles.primary} w-full disabled:opacity-60`}>
          {t('push.turnOn')}
        </button>
      )}
    </div>
  );
}

/** Як виглядатиме сповіщення на екрані телефона */
function Sample({ title, body, time }: { title: string; body: string; time: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-surface px-3.5 py-3 shadow-floating">
      <span className="grid size-9.5 shrink-0 place-items-center rounded-[10px] bg-brand text-title-sm font-bold text-white">O</span>
      <div className="min-w-0 flex-1">
        <p className="flex justify-between gap-2 text-body font-semibold">
          <span className="truncate">{title}</span>
          <span className="shrink-0 text-caption font-normal text-fg-muted">{time}</span>
        </p>
        <p className="truncate text-body-sm text-fg-muted">{body}</p>
      </div>
    </div>
  );
}
