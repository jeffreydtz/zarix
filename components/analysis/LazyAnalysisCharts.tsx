'use client';

import dynamic from 'next/dynamic';
import ChartSkeleton from '@/components/ui/ChartSkeleton';

export const CategoryDonut = dynamic(() => import('@/components/analysis/CategoryDonut'), { ssr: false, loading: () => <ChartSkeleton height={320} /> });
export const MonthlyBarChart = dynamic(() => import('@/components/analysis/MonthlyBarChart'), { ssr: false, loading: () => <ChartSkeleton height={320} /> });
export const CashFlowChart = dynamic(() => import('@/components/analysis/CashFlowChart'), { ssr: false, loading: () => <ChartSkeleton height={320} /> });
export const TopExpenses = dynamic(() => import('@/components/analysis/TopExpenses'), { ssr: false, loading: () => <ChartSkeleton height={240} /> });
export const AccountBreakdownChart = dynamic(() => import('@/components/analysis/AccountBreakdownChart'), { ssr: false, loading: () => <ChartSkeleton height={240} /> });
