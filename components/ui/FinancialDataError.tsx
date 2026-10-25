export default function FinancialDataError({ retryHref }: { retryHref: string }) {
  return (
    <section role="alert" className="card p-6 space-y-3">
      <h1 className="text-xl font-semibold">No pudimos cargar tus datos financieros</h1>
      <p>Volvé a intentar en unos minutos para consultar tus datos.</p>
      <a href={retryHref} className="btn-primary inline-flex">Reintentar</a>
    </section>
  );
}
