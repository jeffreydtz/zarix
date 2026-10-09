'use client';
import { useEffect, useRef, useState } from 'react';
import { submitFinancialOperation, type QueuedOperation } from '@/lib/offline-transaction-store';

/** A form's retry reuses its persisted operation, including after it was closed. */
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
      const result = await submitFinancialOperation(endpoint, payload, method, current.current?.endpoint === endpoint && current.current.draftScope === (scope ?? endpoint) ? current.current : undefined, scope ?? endpoint);
      current.current = result.state === 'pending' ? result.item : undefined;
      setPending(result.state === 'pending');
      return result;
    } finally { busy.current = false; }
  };
  return { submit, pending };
}
