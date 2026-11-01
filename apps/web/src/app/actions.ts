'use server';

// Зміни через API потребують токена адміністратора (ADMIN_TOKEN). Він лишається на
// сервері Next.js: кнопки викликають ці серверні дії, а не API напряму з браузера.
import {
  acceptBarcodeCandidate,
  acceptCandidate,
  rejectBarcodeCandidates,
  undoDecision,
  rejectCandidates,
  resetVariation,
  runMatching,
  setMatchingRule,
  setVariation,
  unlinkListing,
} from '@/api/generated/matching/matching';
import {
  addVariantBarcode,
  getBrands,
  mergeBrand,
  removeVariantBarcode,
  renameBrand,
  updateProduct,
  updateVariant,
} from '@/api/generated/catalog/catalog';
import type { ScheduleDto, UpdateProductDto, UpdateScheduleDto, UpdateVariantDto } from '@/api/generated/model';
import { runAllScrapes, triggerScrape, updateSchedule } from '@/api/generated/scraper/scraper';
import { SESSION_COOKIE } from '@/api/custom-fetch';
import { adminGate, sessionIsAdmin } from '@/lib/admin-access';
import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';

export type ActionResult = { error: string | null };

async function run(call: () => Promise<unknown>): Promise<ActionResult> {
  // Серверну дію можна викликати POST-ом на будь-яку адресу, не лише з /admin, тож proxy.ts
  // її не захищає — перевіряємо доступ тут так само
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const access = await adminGate(
    await headers(),
    { password: process.env.ADMIN_WEB_PASSWORD, adminEmail: process.env.ADMIN_EMAIL },
    () => sessionIsAdmin(token),
  );
  if (access !== 'ok') {
    return { error: 'Немає доступу до адмінки' };
  }
  try {
    await call();
    return { error: null };
  } catch (e) {
    // У продакшні Next.js ховає текст помилок серверних дій — повертаємо його явно
    return { error: e instanceof Error ? e.message : 'Не вдалося виконати дію' };
  }
}

export async function triggerScrapeAction(store: string, maxPages?: number) {
  return run(() => triggerScrape({ store, maxPages }));
}

// revalidatePath — щоб Огляд одразу показав новий розклад і запуски у відповіді дії
export async function updateScheduleAction(patch: UpdateScheduleDto): Promise<ActionResult & { schedule?: ScheduleDto }> {
  let schedule: ScheduleDto | undefined;
  const result = await run(async () => {
    const response = await updateSchedule(patch);
    if (response.status === 200) schedule = response.data;
  });
  revalidatePath('/admin');
  return { ...result, schedule };
}

export async function runAllScrapesAction() {
  const result = await run(() => runAllScrapes());
  revalidatePath('/admin');
  return result;
}

export async function runMatchingAction() {
  return run(() => runMatching());
}

export async function acceptCandidateAction(candidateId: string) {
  return run(() => acceptCandidate(candidateId));
}

export async function rejectCandidatesAction(listingId: string) {
  return run(() => rejectCandidates(listingId));
}

export async function unlinkListingAction(listingId: string) {
  return run(() => unlinkListing(listingId));
}

export async function acceptBarcodeAction(candidateId: string) {
  return run(() => acceptBarcodeCandidate(candidateId));
}

export async function rejectBarcodesAction(variantId: string) {
  return run(() => rejectBarcodeCandidates(variantId));
}

export async function undoDecisionAction(id: string, kind: 'match' | 'barcode') {
  return run(() => undoDecision(id, { kind }));
}

export async function updateProductAction(productId: string, patch: UpdateProductDto) {
  return run(() => updateProduct(productId, patch));
}

export async function updateVariantAction(variantId: string, patch: UpdateVariantDto) {
  return run(() => updateVariant(variantId, patch));
}

export async function addBarcodeAction(variantId: string, gtin: string) {
  return run(() => addVariantBarcode(variantId, { gtin }));
}

export async function removeBarcodeAction(variantId: string, gtin: string) {
  return run(() => removeVariantBarcode(variantId, gtin));
}

export async function setVariationAction(word: string, action: 'ADD' | 'REMOVE', note?: string) {
  return run(() => setVariation(word, { action, note: note || undefined }));
}

export async function resetVariationAction(word: string) {
  return run(() => resetVariation(word));
}

export async function setMatchingRuleAction(key: string, enabled: boolean) {
  return run(() => setMatchingRule(key, { enabled }));
}

export async function renameBrandAction(id: string, name: string) {
  return run(() => renameBrand(id, { name }));
}

/** Злити бренд в інший; основний задається id або ключем (slug), як у таблиці брендів */
export async function mergeBrandAction(id: string, into: string) {
  return run(async () => {
    let target = into.trim();
    if (!/^[0-9a-f-]{36}$/.test(target)) {
      const { data } = await getBrands({ search: target, pageSize: 50 });
      const found = data.items.find((b) => b.slug === target.toLowerCase());
      if (!found) throw new Error(`Бренд з ключем «${target}» не знайдено`);
      target = found.id;
    }
    await mergeBrand(id, { into: target });
  });
}
