import type { AccountWithBalance } from '@/lib/services/accounts';
import BlueFxReferenceDetails from '@/components/ui/BlueFxReferenceDetails';

type Variant = 'default' | 'dark' | 'detail';

function fmtUsd(n: number) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtArs(n: number) {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

/**
 * Muestra el mismo saldo expresado en ARS y en USD (dólar blue / cruce EUR) para ver el cierre en ambas monedas.
 * La cuenta sigue teniendo una sola moneda en base de datos; esto es solo referencia visual.
 */
export default function AccountBalanceEquivalents({
  account,
  variant = 'default',
}: {
  account: AccountWithBalance;
  variant?: Variant;
}) {
  const c = account.currency.trim().toUpperCase();
  const rawBal = Number(account.balance);
  const ars = account.balance_ars_blue != null ? Number(account.balance_ars_blue) : null;
  const usd = account.balance_usd != null ? Number(account.balance_usd) : null;
  const hasBalance = Math.abs(rawBal) > 1e-8;

  if (!hasBalance) return null;

  const absArs = ars != null ? Math.abs(ars) : null;
  const absUsd = usd != null ? Math.abs(usd) : null;

  const base =
    variant === 'dark'
      ? 'text-xs opacity-90 font-medium'
      : variant === 'detail'
        ? 'text-sm text-muted-foreground mt-2 space-y-1'
        : 'text-xs text-muted-foreground mt-0.5';

  const warn =
    variant === 'dark'
      ? 'text-xs opacity-75'
      : 'text-xs text-warning';

  if (c === 'ARS') {
    if (absUsd == null || absUsd < 1e-8) {
      return <div className={warn}>Sin cotización a USD</div>;
    }
    return (
      <div className={base}>
        <span className={variant === 'detail' ? 'block' : undefined}>
          Equivalente (dólar blue):{' '}
          <span className="tabular-nums font-medium text-muted-foreground">
            ≈ ${fmtUsd(absUsd)} USD
          </span>
        </span>
        {variant === 'detail' ? <BlueFxReferenceDetails reference={account.blueReference} className="text-xs mt-1" /> : null}
      </div>
    );
  }

  if (c === 'USD') {
    if (absArs == null || absArs < 1e-8) {
      return <div className={warn}>Sin cotización a ARS</div>;
    }
    return (
      <div className={base}>
        <span className={variant === 'detail' ? 'block' : undefined}>
          Equivalente (dólar blue):{' '}
          <span className="tabular-nums font-medium text-muted-foreground">
            ≈ ${fmtArs(absArs)} ARS
          </span>
        </span>
        {variant === 'detail' ? <BlueFxReferenceDetails reference={account.blueReference} className="text-xs mt-1" /> : null}
      </div>
    );
  }

  // EUR u otra moneda: mostrar ambos cruces
  const parts: string[] = [];
  if (absArs != null && absArs > 1e-8) parts.push(`≈ $${fmtArs(absArs)} ARS`);
  if (absUsd != null && absUsd > 1e-8) parts.push(`≈ $${fmtUsd(absUsd)} USD`);
  if (parts.length === 0) {
    return <div className={warn}>Sin cotización ARS/USD</div>;
  }
  return (
    <div className={base}>
      <span className="tabular-nums text-muted-foreground">{parts.join(' · ')}</span>
      {variant === 'detail' ? <BlueFxReferenceDetails reference={account.blueReference} label="Tramo USD/ARS (otros cruces no incluidos)" className="text-xs mt-1" /> : null}
    </div>
  );
}
