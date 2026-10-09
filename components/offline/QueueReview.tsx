'use client';
import { useState } from 'react';
import type { QueuedOperation } from '@/lib/offline-transaction-store';

export function QueueReview({ items, discard }: { items: QueuedOperation[]; discard: (id: string) => Promise<void> }) {
  const [error, setError] = useState('');
  return <details className="mt-2 max-h-56 overflow-auto">
    <summary className="cursor-pointer underline">Revisar cola ({items.length})</summary>
    <p className="my-2">Una respuesta perdida puede dejar una operación ya registrada. Revisá los datos antes de volver a cargarla.</p>
    {items.map(item => {
      const data = item.payload as Record<string, unknown> | null;
      const legacy = !item.ownerId && !item.endpoint?.startsWith('/api/shared/');
      const label = legacy ? 'Operación antigua sin sesión identificada' : String(data?.description || data?.name || (item.endpoint?.endsWith('/sell') ? 'Venta de inversión' : 'Operación guardada'));
      return <div key={item.id} className="border-t border-border py-2">
        <span>{label}{item.confirmedReceipt ? ' · Confirmada, lista para revisar' : ''}</span>
        <button type="button" className="block underline" onClick={async () => {
          if (!window.confirm('¿Quitar esta solicitud de la cola? Esto no revierte una operación que ya se haya confirmado. Revisá tus movimientos antes de crear otra.')) return;
          try { await discard(item.id); setError(''); } catch { setError('No se pudo quitar. La solicitud sigue guardada.'); }
        }}>Quitar de la cola</button>
      </div>;
    })}
    {error && <p role="alert">{error}</p>}
  </details>;
}
