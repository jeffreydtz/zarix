/** Comparte solamente trabajo pendiente; nunca convierte un error en una cotización. */
const pending = new Map<string, Promise<unknown>>();
export function singleFlight<T>(key: string, work: () => Promise<T>): Promise<T> {
  const current = pending.get(key);
  if (current) return current as Promise<T>;
  const promise = Promise.resolve().then(work).finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}

export async function mapConcurrent<T, R>(items: T[], concurrency: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await work(items[index]);
    }
  }));
  return results;
}

export function positiveNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function quoteDate(value: unknown, fallback = new Date()): Date {
  const date = typeof value === 'number' ? new Date(value * 1000) :
    typeof value === 'string' ? new Date(value) : fallback;
  return Number.isFinite(date.getTime()) && date.getTime() > 0 && date.getTime() <= Date.now() + 60_000
    ? date : fallback;
}
