/** Назва пристрою в Settings → Notifications: «Chrome · Android». Невідоме — лише те, що впізнали */
export function deviceLabel(userAgent: string | null): string | null {
  const ua = userAgent ?? '';
  const browser = [
    [/EdgA?\//, 'Edge'],
    [/SamsungBrowser\//, 'Samsung Internet'],
    [/OPR\//, 'Opera'],
    [/Firefox\/|FxiOS\//, 'Firefox'],
    [/Chrome\/|CriOS\//, 'Chrome'],
    [/Safari\//, 'Safari'],
  ].find(([re]) => (re as RegExp).test(ua))?.[1];
  const os = [
    [/Android/, 'Android'],
    [/iPhone/, 'iPhone'],
    [/iPad/, 'iPad'],
    [/Windows/, 'Windows'],
    [/Mac OS X/, 'Mac'],
    [/Linux/, 'Linux'],
  ].find(([re]) => (re as RegExp).test(ua))?.[1];
  return [browser, os].filter(Boolean).join(' · ') || null;
}

/** VAPID-ключ base64url → байти для pushManager.subscribe({ applicationServerKey }) */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
