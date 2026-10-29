/**
 * Адреса покупця для лімітів API (API бачить лише сервер Next.js). Через тунель її ставить
 * Cloudflare (cf-connecting-ip, клієнт не підробить), напряму — сам Next у x-forwarded-for.
 */
export function clientAddress(headers: Headers): string | undefined {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return headers.get('cf-connecting-ip') ?? (forwarded || undefined) ?? headers.get('x-real-ip') ?? undefined;
}
