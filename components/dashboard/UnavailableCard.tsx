'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export default function UnavailableCard({ title }: { title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <section className="card space-y-3" role="status">
      <h2 className="font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">
        No pudimos cargar estos datos. Tus registros siguen guardados.
      </p>
      <button type="button" className="btn btn-secondary min-h-11" disabled={pending}
        onClick={() => startTransition(() => router.refresh())}>
        {pending ? 'Reintentando…' : 'Volver a intentar'}
      </button>
    </section>
  );
}
