/**
 * UI inmediata al navegar entre rutas autenticadas (RSC en vuelo).
 * Mejora la percepción de respuesta en móvil/PWA sin cambiar datos ni permisos.
 */
export default function AuthenticatedLoading() {
  return (
    <div className="min-h-[40vh] px-4 py-6 space-y-4 max-w-6xl mx-auto" aria-busy="true" aria-label="Cargando">
      <div className="h-8 w-48 rounded-lg bg-slate-200/80 dark:bg-slate-700/80 animate-pulse" />
      <div className="h-4 w-72 max-w-full rounded bg-slate-200/60 dark:bg-slate-700/60 animate-pulse" />
      <div className="h-36 rounded-2xl bg-slate-200/70 dark:bg-slate-700/70 animate-pulse" />
      <div className="h-28 rounded-2xl bg-slate-200/50 dark:bg-slate-700/50 animate-pulse" />
      <div className="h-52 rounded-2xl bg-slate-200/50 dark:bg-slate-700/50 animate-pulse" />
    </div>
  );
}
