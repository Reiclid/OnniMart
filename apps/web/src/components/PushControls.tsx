'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { removePushDevice, sendTestPush } from '@/app/(shop)/actions';
import type { DeviceDto } from '@/api/generated/model';
import { useT } from '@/i18n/client';
import { listStyles as s } from './ui';
import { usePush } from './usePush';

/**
 * Settings → Notifications (Figma 26): push цього браузера, далі `middle` (знижки),
 * потім інші пристрої покупця. Цей пристрій впізнаємо за endpoint його підписки.
 */
export function PushControls({ publicKey, devices, middle }: { publicKey: string | null; devices: DeviceDto[]; middle: ReactNode }) {
  const t = useT();
  const push = usePush(publicKey);
  const [busy, setBusy] = useState(false);
  const [tested, setTested] = useState(false);
  const current = devices.find((d) => d.endpoint === push.endpoint);
  const others = devices.filter((d) => d !== current);
  const { state, resync } = push;
  const synced = useRef(false);

  useEffect(() => {
    if (state !== 'on' || current || synced.current) return;
    synced.current = true;
    void resync();
  }, [state, current, resync]);

  async function toggle(on: boolean) {
    setBusy(true);
    await (on ? push.enable() : push.disable(current?.id)).catch(() => undefined);
    setBusy(false);
  }

  const hint = { install: 'push.iosInstall', blocked: 'notificationSettings.blocked', unsupported: 'notificationSettings.unsupported' } as const;

  return (
    <>
      <section className="space-y-2">
        <h2 className={s.heading}>{t('notificationSettings.thisPhone')}</h2>
        <div className={s.card}>
          <label className={s.row}>
            <span className="flex-1">{t('settings.push')}</span>
            <span className="relative inline-flex shrink-0">
              <input
                type="checkbox"
                role="switch"
                checked={state === 'on'}
                disabled={busy || !['on', 'off'].includes(state)}
                onChange={(e) => void toggle(e.currentTarget.checked)}
                aria-label={t('settings.push')}
                className="peer h-6.5 w-11 cursor-pointer appearance-none rounded-full bg-line-strong transition-colors duration-(--duration-fast) ease-standard checked:bg-brand disabled:cursor-default disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute top-0.75 left-0.75 size-5 rounded-full bg-surface shadow-floating transition-[translate] duration-(--duration-spring-snappy) ease-spring-snappy peer-checked:translate-x-4.5"
              />
            </span>
          </label>
          {state === 'on' && push.endpoint && (
            <button
              type="button"
              disabled={tested}
              onClick={() => void sendTestPush(push.endpoint!).then(setTested)}
              className={`${s.row} ${s.link} font-semibold text-brand disabled:text-fg-muted`}
            >
              {t(tested ? 'notificationSettings.testSent' : 'notificationSettings.test')}
            </button>
          )}
        </div>
        {state in hint && <p className={s.hint}>{t(hint[state as keyof typeof hint])}</p>}
      </section>

      {middle}

      {others.length > 0 && (
        <section className="space-y-2">
          <h2 className={s.heading}>{t('notificationSettings.otherDevices')}</h2>
          <div className={s.card}>
            {others.map((d) => (
              <div key={d.id} className={s.row}>
                <span className="flex-1">{d.label ?? t('notificationSettings.browser')}</span>
                <RemoveDevice id={d.id} />
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function RemoveDevice({ id }: { id: string }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void removePushDevice(id);
      }}
      className="press text-body font-semibold text-danger disabled:opacity-50"
    >
      {t('notificationSettings.remove')}
    </button>
  );
}
