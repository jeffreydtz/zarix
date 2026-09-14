'use client';

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="page-container py-8">
      <section className="card space-y-3" role="alert">
        <h1 className="text-xl font-semibold text-foreground">No pudimos cargar tu resumen</h1>
        <p className="text-muted-foreground">Hubo un problema de conexión. Volvé a intentarlo para consultar tus datos.</p>
        <button type="button" className="btn btn-primary min-h-11" onClick={reset}>Volver a intentar</button>
      </section>
    </div>
  );
}
