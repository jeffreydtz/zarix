'use client';
import { useEffect, useRef, useState } from 'react';
import { submitFinancialOperation, type QueuedOperation } from '@/lib/offline-transaction-store';

/** A live form retries only its own selected ID. A new form creates a new
 * intent; after reload, recover a saved operation explicitly from the queue. */
export function useFinancialOperation(scope?: string) {
  const current = useRef<QueuedOperation>();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const discarded = (event: Event) => {
      if ((event as CustomEvent<string>).detail === current.current?.id) {
        current.current = undefined;
        setPending(false);
      }
    };
    window.addEventListener('zarix-operation-discarded', discarded);
    return () => window.removeEventListener('zarix-operation-discarded', discarded);
  }, []);
  const submit = async (endpoint: string, payload: unknown, method: 'POST' | 'PUT' = 'POST') => {
    if (busy.current) return null;
    busy.current = true;
    try {
      const prior = current.current?.endpoint === endpoint && current.current.draftScope === (scope ?? endpoint) ? current.current : undefined;
      const result = await submitFinancialOperation(endpoint, payload, method, prior, scope ?? endpoint, prior?.id);
      current.current = result.state === 'pending' ? result.item : undefined;
      setPending(result.state === 'pending');
      return result;
    } finally { busy.current = false; }
  };
  return { submit, pending };
}
