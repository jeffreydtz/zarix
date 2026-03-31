'use client';

interface BalanceHeaderProps {
  liquidUSD: number;
  liquidARSBlue: number;
  investmentsUSD: number;
  investmentsARSBlue: number;
  totalUSD: number;
  totalARSBlue: number;
  totalCreditUsed?: number;
  totalCreditLimit?: number;
  creditUtilization?: number;
}

export default function BalanceHeader({ 
  liquidUSD,
  liquidARSBlue,
  investmentsUSD,
  investmentsARSBlue,
  totalUSD,
  totalARSBlue,
  totalCreditUsed = 0,
  totalCreditLimit = 0,
  creditUtilization = 0,
}: BalanceHeaderProps) {
  const hasCreditCards = totalCreditLimit > 0;
  const hasInvestments = investmentsUSD > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950">
          <h2 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
            💰 Patrimonio Líquido
          </h2>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            (para gastar hoy)
          </div>
          <div className="space-y-1">
            <div className="text-3xl font-bold text-blue-700 dark:text-blue-300">
              ${liquidARSBlue.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              <span className="text-base font-normal text-gray-500 ml-2">ARS</span>
            </div>
            <div className="text-xl text-gray-600 dark:text-gray-400">
              USD {liquidUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {hasInvestments && (
          <div className="card bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950 dark:to-pink-950">
            <h2 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
              📈 Patrimonio Total
            </h2>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              (con inversiones)
            </div>
            <div className="space-y-1">
              <div className="text-3xl font-bold text-purple-700 dark:text-purple-300">
                ${totalARSBlue.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                <span className="text-base font-normal text-gray-500 ml-2">ARS</span>
              </div>
              <div className="text-xl text-gray-600 dark:text-gray-400">
                USD {totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-purple-600 dark:text-purple-400 mt-2 pt-2 border-t border-purple-200 dark:border-purple-800">
                Inversiones: ${investmentsARSBlue.toLocaleString('es-AR')} ARS (USD {investmentsUSD.toLocaleString('en-US')})
              </div>
            </div>
          </div>
        )}

        {!hasInvestments && (
          <div className="card bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-800 dark:to-slate-800 border-2 border-dashed border-gray-300 dark:border-gray-600">
            <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
              📈 Sin inversiones aún
            </h2>
            <div className="text-xs text-gray-400 dark:text-gray-500 mb-3">
              Creá una cuenta tipo &quot;Inversión&quot; para trackear tu patrimonio invertido
            </div>
          </div>
        )}
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
