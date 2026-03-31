'use client';

interface BalanceHeaderProps {
  totalUSD: number;
  totalARSBlue: number;
  totalCreditUsed?: number;
  totalCreditLimit?: number;
  creditUtilization?: number;
}

export default function BalanceHeader({ 
  totalUSD, 
  totalARSBlue,
  totalCreditUsed = 0,
  totalCreditLimit = 0,
  creditUtilization = 0,
}: BalanceHeaderProps) {
  const hasCreditCards = totalCreditLimit > 0;

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
          Patrimonio Total (sin inversiones)
        </h2>
        <div className="space-y-1">
          <div className="text-3xl font-bold">
            ${totalARSBlue.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            <span className="text-base font-normal text-gray-500 ml-2">ARS</span>
          </div>
          <div className="text-xl text-gray-600 dark:text-gray-400">
            USD {totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {hasCreditCards && (
        <div className="card bg-gradient-to-br from-orange-50 to-yellow-50 dark:from-orange-950 dark:to-yellow-950">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              💳 Tarjetas de Crédito
            </h2>
            <span className="text-xs font-medium px-2 py-1 rounded-full bg-white dark:bg-gray-800">
              {creditUtilization.toFixed(0)}% usado
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-gray-600 dark:text-gray-400">Usado:</span>
              <span className="text-lg font-bold text-orange-600 dark:text-orange-400">
                ${totalCreditUsed.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-gray-600 dark:text-gray-400">Límite:</span>
              <span className="text-lg font-semibold">
                ${totalCreditLimit.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-2">
              <div
                className="bg-gradient-to-r from-orange-500 to-yellow-500 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(creditUtilization, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
