'use client';

import dynamic from 'next/dynamic';

const DeferredSpendingAnalyzer = dynamic(() => import('@/components/dashboard/SpendingAnalyzer'), {
  ssr: false,
  loading: () => <div className="card h-80 animate-pulse bg-secondary" />,
});

export default DeferredSpendingAnalyzer;
