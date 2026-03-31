'use client';

interface PortfolioSummaryProps {
  totalValue: number;
  totalPnL: number;
  totalPnLPercent: number;
  byType: Array<{
    type: string;
    count: number;
    value: number;
    pnl: number;
  }>;
}

const TYPE_LABELS: Record<string, string> = {
  stock_arg: 'Acciones ARG',
  cedear: 'CEDEARs',
  stock_us: 'Acciones USA',
  etf: 'ETFs',
  crypto: 'Crypto',
  plazo_fijo: 'Plazo Fijo',
  fci: 'FCI',
  bond: 'Bonos',
  caucion: 'Cauciones',
  real_estate: 'Inmuebles',
  other: 'Otros',
};

export default function PortfolioSummary({
  totalValue,
  totalPnL,
  totalPnLPercent,
  byType,
}: PortfolioSummaryProps) {
  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
          Valor Total del Portafolio
        </h2>
        <div className="text-3xl font-bold mb-2">
          USD {totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </div>
        <div
          className={`text-lg ${
            totalPnL >= 0 ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {totalPnL >= 0 ? '+' : ''}
          USD {totalPnL.toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
          ({totalPnLPercent.toFixed(2)}%)
        </div>
      </div>

      {byType.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Distribución por Tipo</h3>
          <div className="space-y-3">
            {byType.map((item) => {
              const percent = (item.value / totalValue) * 100;
              return (
                <div key={item.type}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">
                      {TYPE_LABELS[item.type] || item.type}
                    </span>
                    <span className="text-sm text-gray-500">
                      {percent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-500">
                      {item.count} posición{item.count !== 1 ? 'es' : ''}
                    </span>
                    <span className="text-xs text-gray-500">
                      USD {item.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
