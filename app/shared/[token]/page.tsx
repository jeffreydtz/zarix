import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { sharedExpensesService, isValidShareToken } from '@/lib/services/sharedExpenses';
import SharedGroupView from '@/components/shared/SharedGroupView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Gastos compartidos — Zarix',
  robots: { index: false, follow: false },
};

export default async function SharedGroupPage({
  params,
}: {
  params: { token: string };
}) {
  if (!isValidShareToken(params.token)) notFound();

  const detail = await sharedExpensesService.getGroupByToken(params.token);
  if (!detail) notFound();

  return <SharedGroupView token={params.token} initialData={detail} />;
}
