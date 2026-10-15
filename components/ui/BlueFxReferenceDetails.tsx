import type { BlueFxReference } from '@/lib/blue-fx-reference';

export default function BlueFxReferenceDetails({ reference, label = 'Referencia USD/ARS', className = '' }: {
  reference?: BlueFxReference;
  label?: string;
  className?: string;
}) {
  if (!reference) return <p className={className}>{label}: tasa, fuente y fecha no informadas.</p>;
  const provider = reference.origin === 'persisted'
    ? 'Cotización guardada · proveedor original no informado'
    : reference.provider || 'Proveedor no informado';
  const validDate = reference.observedAt && Number.isFinite(Date.parse(reference.observedAt));
  return (
    <p className={className} data-testid="blue-fx-reference">
      {label}: dólar blue {reference.side === 'sell' ? 'venta' : 'compra'}
      {' · '}1 USD = ARS {reference.rate.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
      {' · '}Fuente: {provider}
      {' · '}Fecha: {validDate ? <time dateTime={reference.observedAt!}>{new Date(reference.observedAt!).toLocaleString('es-AR', { timeZone: 'UTC' })} UTC</time> : 'no informada'}.
      {' '}Referencia indicativa.
    </p>
  );
}
