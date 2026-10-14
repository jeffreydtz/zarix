'use client';
import { useState } from 'react';
import type { FinancialSubmitResult, QueuedOperation } from '@/lib/offline-transaction-store';

export function QueueReview({ items, discard, retry }: { items: QueuedOperation[]; discard: (id: string) => Promise<void>; retry: (id: string) => Promise<FinancialSubmitResult | null> }) {
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState<string | null>(null);
  return <details className="mt-2 max-h-56 overflow-auto">
    <summary className="cursor-pointer underline">Revisar cola ({items.length})</summary>
    <p className="my-2">Para retomar una operación guardada, reintentá esa solicitud. Cargarla desde un formulario nuevo crea otra operación.</p>
    {items.map(item => {
      const data = item.payload as Record<string, unknown> | null;
      const legacy = !item.ownerId && !item.endpoint?.startsWith('/api/shared/');
      const label = legacy ? 'Operación antigua sin sesión identificada' : String(data?.description || data?.name || (item.endpoint?.endsWith('/sell') ? 'Venta de inversión' : 'Operación guardada'));
      return <div key={item.id} className="border-t border-border py-2">
        <span>{label}{item.confirmedReceipt ? ' · Confirmada, lista para revisar' : ''}</span>
        {!legacy && <button type="button" className="block underline" disabled={retrying !== null} onClick={async () => {
          setRetrying(item.id);
          try {
            const result = await retry(item.id);
            setError(result?.state === 'confirmed' ? '' : result?.error || 'No se confirmó la solicitud. Sigue guardada para reintentar.');
          } catch { setError('No se pudo retomar. La solicitud sigue guardada.'); }
          finally { setRetrying(null); }
        }}>{item.confirmedReceipt ? 'Ver confirmación' : 'Reintentar esta solicitud'}</button>}
        <button type="button" className="block underline" onClick={async () => {
          if (!window.confirm('¿Quitar esta solicitud de la cola? Esto no revierte una operación que ya se haya confirmado. Revisá tus movimientos antes de crear otra.')) return;
          try { await discard(item.id); setError(''); } catch { setError('No se pudo quitar. La solicitud sigue guardada.'); }
        }}>Quitar de la cola</button>
      </div>;
    })}
    {error && <p role="alert">{error}</p>}
  </details>;
}
