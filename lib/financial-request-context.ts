import { AsyncLocalStorage } from 'node:async_hooks';

const requests = new AsyncLocalStorage<{ prefix: string; next: number }>();

/** Each incoming provider event is an operation namespace, never a payload hash. */
export function withFinancialRequestContext<T>(prefix: string, work: () => Promise<T>): Promise<T> {
  return requests.run({ prefix, next: 0 }, work);
}

export function nextFinancialRequestId(): string | undefined {
  const context = requests.getStore();
  return context ? `${context.prefix}:${context.next++}` : undefined;
}
