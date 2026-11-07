import type { HealthDto, MatchingStatusDto, ScrapeRunDto } from '@/api/generated/model';

/**
 * Відбиток того, що видно на Огляді: статуси й лічильники запусків та черги. Сторінка
 * опитує лише його й перезавантажується, коли відбиток змінився.
 */
export function overviewSignature(
  runs: Pick<ScrapeRunDto, 'id' | 'status' | 'pagesFetched' | 'itemsSeen' | 'itemsChanged' | 'itemsFailed'>[],
  health: Pick<HealthDto, 'worker' | 'queues'> | null,
): string {
  const runPart = runs
    .map((r) => [r.id, r.status, r.pagesFetched, r.itemsSeen, r.itemsChanged, r.itemsFailed].join(':'))
    .join(',');
  const queues = health?.queues;
  return `${runPart}|${health?.worker ?? '-'}|${queues?.tasks ?? '-'}:${queues?.results ?? '-'}`;
}

/** Зіставлення цікавить лише початок і кінець запуску */
export function matchingSignature(status: Pick<MatchingStatusDto, 'running' | 'lastReport'>): string {
  return `${status.running}|${status.lastReport?.finishedAt ?? '-'}`;
}
