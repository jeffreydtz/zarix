'use client';

import { useState } from 'react';
import type { AccountWithBalance } from '@/lib/services/accounts';
import EditAccountModal from '@/components/accounts/EditAccountModal';

export default function AccountDetailEditButton({ account }: { account: AccountWithBalance }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-secondary"
      >
        Editar cuenta
      </button>
      {open && <EditAccountModal account={account} onClose={() => setOpen(false)} />}
    </>
  );
}
