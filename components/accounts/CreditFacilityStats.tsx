import { formatCurrency } from '@/lib/utils/currency';
import { creditFacilityFigures, type CreditFacilityInput } from '@/lib/credit-card-display';

interface CreditFacilityStatsProps {
  account: CreditFacilityInput;
  currency?: string;
  compact?: boolean;
}

export default function CreditFacilityStats({
  account,
  currency = 'ARS',
  compact = false,
}: CreditFacilityStatsProps) {
  const { limit, used, available } = creditFacilityFigures(account);
  if (!(limit > 0)) return null;

  const amountClass = compact
    ? 'font-semibold tabular-nums'
    : 'font-semibold tabular-nums text-foreground';
  const labelClass = 'text-xs text-muted-foreground mb-0.5';

  return (
    <div className={compact ? 'grid grid-cols-3 gap-2 text-xs' : 'grid grid-cols-3 gap-3 text-sm'}>
      <div>
        <p className={labelClass}>Límite</p>
        <p className={amountClass}>{formatCurrency(limit, currency, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
      </div>
      <div>
        <p className={labelClass}>Usado</p>
        <p className={amountClass}>{formatCurrency(used, currency, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
      </div>
      <div>
        <p className={labelClass}>Disponible</p>
        <p className={`${amountClass} ${available < 0 ? 'text-destructive' : compact ? '' : 'text-success'}`}>
          {formatCurrency(available, currency, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </p>
      </div>
    </div>
  );
}
