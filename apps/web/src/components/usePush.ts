'use client';

import { useEffect, useState } from 'react';
import { removePushDevice, savePushDevice } from '@/app/(shop)/actions';
import { base64UrlToBytes } from '@/lib/push';

/**
 * Push у цьому браузері. install — iPhone/iPad у Safari: push є лише з головного екрана;
 * blocked — покупець заборонив сповіщення сайту, змінити це можна лише в налаштуваннях браузера.
 */
export type PushState = 'loading' | 'unsupported' | 'install' | 'blocked' | 'off' | 'on';

const isAppleMobile = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export function usePush(publicKey: string | null) {
  const [state, setState] = useState<PushState>('loading');
  const [endpoint, setEndpoint] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      if (!publicKey) return setState('unsupported');
      if (!supported()) return setState(isAppleMobile() ? 'install' : 'unsupported');
      if (Notification.permission === 'denied') return setState('blocked');
      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.getSubscription();
      setEndpoint(subscription?.endpoint ?? null);
      setState(subscription && Notification.permission === 'granted' ? 'on' : 'off');
    })().catch(() => setState('unsupported'));
  }, [publicKey]);

  /** Запит дозволу → підписка → API; false — покупець не дозволив */
  async function enable(): Promise<boolean> {
    if (!publicKey) return false;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setState(permission === 'denied' ? 'blocked' : 'off');
      return false;
    }
    const registration = await navigator.serviceWorker.register('/sw.js');
    // Стара підписка могла бути з іншим ключем (новий VAPID) — тоді subscribe падає
    await (await registration.pushManager.getSubscription())?.unsubscribe();
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) });
    await save(subscription);
    setEndpoint(subscription.endpoint);
    setState('on');
    return true;
  }

  async function disable(deviceId: string | undefined) {
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    await (await registration?.pushManager.getSubscription())?.unsubscribe();
    if (deviceId) await removePushDevice(deviceId);
    setEndpoint(null);
    setState('off');
  }

  /** Підписка є в браузері, а API її не знає (інший акаунт, видалили з іншого пристрою) — записати знову */
  async function resync() {
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) await save(subscription);
  }

  return { state, endpoint, enable, disable, resync };
}

function save(subscription: PushSubscription) {
  const { keys } = subscription.toJSON();
  return savePushDevice({ endpoint: subscription.endpoint, p256dh: keys?.p256dh ?? '', auth: keys?.auth ?? '' });
}
