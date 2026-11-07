/**
 * Результат дорогого запиту, який тримається ttlMs. Одночасні виклики ділять один запит,
 * збій не кешується. Кеш живе в процесі: кілька екземплярів API мають кожен свій.
 */
export function ttlCached<T>(
  ttlMs: number,
  load: () => Promise<T>,
  now: () => number = Date.now,
): () => Promise<T> {
  let value: { data: T; until: number } | null = null;
  let pending: Promise<T> | null = null;

  return async () => {
    if (value && now() < value.until) return value.data;
    pending ??= load()
      .then((data) => {
        value = { data, until: now() + ttlMs };
        return data;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
}
