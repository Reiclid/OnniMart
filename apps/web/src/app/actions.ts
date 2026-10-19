'use server';

// Зміни через API потребують токена адміністратора (ADMIN_TOKEN). Він лишається на
// сервері Next.js: кнопки викликають ці серверні дії, а не API напряму з браузера.
import {
  acceptCandidate,
  rejectCandidates,
  runMatching,
  unlinkListing,
} from '@/api/generated/matching/matching';
import { triggerScrape } from '@/api/generated/scraper/scraper';

export type ActionResult = { error: string | null };

async function run(call: () => Promise<unknown>): Promise<ActionResult> {
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
