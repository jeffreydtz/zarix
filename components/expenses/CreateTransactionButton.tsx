'use client';

import { useState } from 'react';

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
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');

  const filteredCategories = categories.filter((c) => c.type === type);

  const handleCreate = async () => {
    if (!amount || !accountId) return;

    setLoading(true);

    try {
      const account = accounts.find((a) => a.id === accountId);
      if (!account) throw new Error('Account not found');

      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          accountId,
          amount: parseFloat(amount),
          currency: account.currency,
          categoryId: categoryId || null,
          description,
          transactionDate: new Date().toISOString(),
        }),
      });

      if (!response.ok) throw new Error('Error creating transaction');

      window.location.reload();
    } catch (error) {
      console.error('Error:', error);
      alert('Error al crear el movimiento');
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Nuevo Movimiento</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-500 hover:text-gray-700"
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
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Monto</label>
                <input
                  type="number"
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
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Descripción</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="ej: Compra en supermercado"
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                />
              </div>

              <button
                onClick={handleCreate}
                disabled={loading || !amount || !accountId}
                className="w-full btn btn-primary py-3 disabled:opacity-50"
              >
                {loading ? 'Creando...' : 'Crear Movimiento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
