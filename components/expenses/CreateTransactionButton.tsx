'use client';

import { Plus } from 'lucide-react';
import { useAddTransaction } from '@/components/add-transaction/AddTransactionProvider';

export default function CreateTransactionButton({
  mode,
  triggerClassName,
  defaultAccountId,
}: {
  mode?: 'transfer-only';
  triggerClassName?: string;
  defaultAccountId?: string;
} = {}) {
  const { open } = useAddTransaction();
  const isTransfer = mode === 'transfer-only';
  return (
    <button
      type="button"
      onClick={() =>
        open({
          ...(isTransfer ? { type: 'transfer' as const } : {}),
          ...(defaultAccountId ? { accountId: defaultAccountId } : {}),
        })
      }
      className={
        triggerClassName ||
        'inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:brightness-95 min-h-[44px]'
      }
    >
      <Plus className="w-4 h-4" aria-hidden />
      {isTransfer ? 'Transferir' : 'Nuevo'}
    </button>
  );
}
