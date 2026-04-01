'use client';

import { useState } from 'react';
import { useOfflineQueue } from '@/lib/hooks/useOfflineQueue';

interface CreateTransactionButtonProps {
  accounts: Array<{ id: string; name: string; currency: string }>;
  categories: Array<{ id: string; name: string; icon: string; type: string }>;
}

export default function CreateTransactionButton({
  accounts,
  categories,
}: CreateTransactionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');

  const { isOnline, enqueue } = useOfflineQueue();

  const filteredCategories = categories.filter((c) => c.type === type || c.type === 'both');
  const destinationAccounts = accounts.filter((a) => a.id !== accountId);

  const resetForm = () => {
    setType('expense');
    setAmount('');
    setAccountId('');
    setDestinationAccountId('');
    setCategoryId('');
    setDescription('');
  };

  const handleClose = () => {
    setIsOpen(false);
    resetForm();
  };

  const handleCreate = async () => {
    if (!amount || !accountId) return;
    if (type === 'transfer' && !destinationAccountId) return;
    if (type === 'transfer' && destinationAccountId === accountId) return;
    setLoading(true);

    const account = accounts.find((a) => a.id === accountId);
    if (!account) {
      setLoading(false);
      return;
    }

    const payload = {
      type,
      accountId,
      destinationAccountId: type === 'transfer' ? destinationAccountId : undefined,
      amount: parseFloat(amount),
      currency: account.currency,
      categoryId: type === 'transfer' ? null : (categoryId || null),
      description: description || (type === 'transfer' ? 'Transferencia entre cuentas' : ''),
      transactionDate: new Date().toISOString(),
    };

    try {
      if (!isOnline) {
        await enqueue(payload);
        handleClose();
        return;
      }

      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Error al crear el movimiento');

      handleClose();
      window.location.reload();
    } catch {
      if (!navigator.onLine) {
        await enqueue(payload);
        handleClose();
      } else {
        alert('Error al crear el movimiento');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button onClick={() => setIsOpen(true)} className="btn btn-primary">
        + Nuevo Movimiento
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-4 z-50"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold">Nuevo Movimiento</h2>
                {!isOnline && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                    Sin conexión — se guardará localmente
                  </p>
                )}
              </div>
              <button
                onClick={handleClose}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Tipo</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setType('expense')}
                    className={`flex-1 py-2 rounded-lg ${
                      type === 'expense'
                        ? 'bg-red-500 text-white'
                        : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                  >
                    💸 Gasto
                  </button>
                  <button
                    onClick={() => setType('income')}
                    className={`flex-1 py-2 rounded-lg ${
                      type === 'income'
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                  >
                    💰 Ingreso
                  </button>
                  <button
                    onClick={() => setType('transfer')}
                    className={`flex-1 py-2 rounded-lg ${
                      type === 'transfer'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                  >
                    🔄 Transfer
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Monto</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Cuenta</label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                >
                  <option value="">Seleccioná una cuenta</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.currency})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                {type === 'transfer' ? (
                  <>
                    <label className="block text-sm font-medium mb-2">Cuenta destino</label>
                    <select
                      value={destinationAccountId}
                      onChange={(e) => setDestinationAccountId(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                    >
                      <option value="">Seleccioná cuenta destino</option>
                      {destinationAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({acc.currency})
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <label className="block text-sm font-medium mb-2">Categoría</label>
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                    >
                      <option value="">Sin categoría</option>
                      {filteredCategories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.icon} {cat.name}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Descripción</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={type === 'transfer' ? 'ej: Paso a cuenta ahorro' : 'ej: Compra en supermercado'}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                />
              </div>

              <button
                onClick={handleCreate}
                disabled={
                  loading ||
                  !amount ||
                  !accountId ||
                  (type === 'transfer' && (!destinationAccountId || destinationAccountId === accountId))
                }
                className="w-full btn btn-primary py-3 disabled:opacity-50"
              >
                {loading
                  ? 'Guardando...'
                  : isOnline
                  ? 'Crear Movimiento'
                  : 'Guardar Offline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
