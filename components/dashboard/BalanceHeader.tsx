'use client';

interface BalanceHeaderProps {
  totalUSD: number;
  totalARSBlue: number;
}

export default function BalanceHeader({ totalUSD, totalARSBlue }: BalanceHeaderProps) {
  return (
    <div className="card">
      <h2 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
        Patrimonio Total
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
  );
}
