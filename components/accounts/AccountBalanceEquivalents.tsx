import type { AccountWithBalance } from '@/lib/services/accounts';

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
        ? 'text-sm text-slate-500 dark:text-slate-400 mt-2 space-y-1'
        : 'text-xs text-slate-400 dark:text-slate-500 mt-0.5';

  const warn =
    variant === 'dark'
      ? 'text-xs opacity-75'
      : 'text-xs text-amber-600 dark:text-amber-400/90';

  if (c === 'ARS') {
    if (absUsd == null || absUsd < 1e-8) {
      return <div className={warn}>Sin cotización a USD</div>;
    }
    return (
      <div className={base}>
        <span className={variant === 'detail' ? 'block' : undefined}>
          Equivalente (dólar blue):{' '}
          <span className="tabular-nums font-medium text-slate-600 dark:text-slate-300">
            ≈ ${fmtUsd(absUsd)} USD
          </span>
        </span>
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
          <span className="tabular-nums font-medium text-slate-600 dark:text-slate-300">
            ≈ ${fmtArs(absArs)} ARS
          </span>
        </span>
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
      <span className="tabular-nums text-slate-600 dark:text-slate-300">{parts.join(' · ')}</span>
    </div>
  );
}
