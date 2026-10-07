'use client';

import dynamic from 'next/dynamic';

export const MarketDataWidget = dynamic(() => import('@/components/investments/MarketDataWidget'), { ssr: false });
export const InvestmentAccountsList = dynamic(() => import('@/components/investments/InvestmentAccountsList'), { ssr: false });

