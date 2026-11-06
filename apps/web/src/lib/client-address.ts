/**
 * Адреса покупця для лімітів API (API бачить лише сервер Next.js). Через тунель її ставить
 * Cloudflare (cf-connecting-ip, клієнт не підробить). Напряму — x-forwarded-for, який клієнт
 * може надіслати сам (Next його не перезаписує), тому веб слухає лише 127.0.0.1.
 */
export function clientAddress(headers: Headers): string | undefined {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return headers.get('cf-connecting-ip') ?? (forwarded || undefined) ?? headers.get('x-real-ip') ?? undefined;
}
