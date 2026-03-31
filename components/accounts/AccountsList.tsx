'use client';

import type { AccountWithBalance } from '@/lib/services/accounts';
import { useState } from 'react';

interface AccountsListProps {
  accounts: AccountWithBalance[];
}

export default function AccountsList({ accounts }: AccountsListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEdit = (account: AccountWithBalance) => {
    setEditingId(account.id);
    setEditName(account.name);
  };

  const handleSave = async (id: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/accounts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName }),
      });

      if (!response.ok) throw new Error('Error updating account');

      window.location.reload();
    } catch (error) {
      console.error('Error:', error);
      alert('Error al actualizar la cuenta');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Estás seguro de eliminar la cuenta "${name}"?`)) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/accounts/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error deleting account');
      }

      window.location.reload();
    } catch (error: any) {
      console.error('Error:', error);
      alert(error.message || 'Error al eliminar la cuenta');
    } finally {
      setLoading(false);
    }
  };

  if (accounts.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500 mb-4">No tenés cuentas todavía</p>
        <p className="text-sm text-gray-400">Creá tu primera cuenta para empezar a trackear tus finanzas</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {accounts.map((account) => (
        <div key={account.id} className="card hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 flex-1">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
                style={{ backgroundColor: account.color }}
              >
                {account.icon || '💳'}
              </div>

              <div className="flex-1">
                {editingId === account.id ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="font-semibold text-lg px-2 py-1 border rounded dark:bg-gray-700"
                    autoFocus
                  />
                ) : (
                  <div className="font-semibold text-lg">{account.name}</div>
                )}
                <div className="text-sm text-gray-500">
                  {account.type.replace('_', ' ')} • {account.currency}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-xl font-bold">
                  {account.is_debt && '-'}
                  ${account.balance.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-sm text-gray-500">{account.currency}</div>
                {account.currency !== 'ARS' && (
                  <div className="text-xs text-gray-400 mt-1">
                    ≈ ${account.balance_ars_blue?.toLocaleString('es-AR') || 0} ARS
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                {editingId === account.id ? (
                  <>
                    <button
                      onClick={() => handleSave(account.id)}
                      disabled={loading}
                      className="text-green-600 hover:text-green-700 px-3 py-1 disabled:opacity-50"
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      disabled={loading}
                      className="text-gray-600 hover:text-gray-700 px-3 py-1 disabled:opacity-50"
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleEdit(account)}
                      className="text-blue-600 hover:text-blue-700 px-3 py-1"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDelete(account.id, account.name)}
                      className="text-red-600 hover:text-red-700 px-3 py-1"
                    >
                      🗑️
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {account.min_balance && account.balance < account.min_balance && (
            <div className="mt-3 text-sm text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded">
              ⚠️ Saldo por debajo del mínimo (${account.min_balance.toFixed(2)})
            </div>
          )}

          {account.type === 'credit_card' && account.credit_limit && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Límite:</span>
                  <div className="font-semibold">${account.credit_limit.toLocaleString('es-AR')}</div>
                </div>
                {account.closing_day && (
                  <div>
                    <span className="text-gray-500">Cierre:</span>
                    <div className="font-semibold">Día {account.closing_day}</div>
                  </div>
                )}
                {account.due_day && (
                  <div>
                    <span className="text-gray-500">Vencimiento:</span>
                    <div className="font-semibold">Día {account.due_day}</div>
                  </div>
                )}
              </div>
              {account.last_4_digits && (
                <div className="text-xs text-gray-400 mt-2">
                  •••• {account.last_4_digits}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
