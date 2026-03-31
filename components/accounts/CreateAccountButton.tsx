'use client';

import { useState } from 'react';
import { ACCOUNT_PRESETS } from '@/types/database';

export default function CreateAccountButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [initialBalance, setInitialBalance] = useState('');

  const handleCreate = async () => {
    if (!selectedPreset && selectedPreset !== 0) return;

    setLoading(true);

    try {
      const preset = ACCOUNT_PRESETS[selectedPreset];

      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || preset.name,
          type: preset.type,
          currency: preset.currency,
          icon: preset.icon,
          color: preset.color,
          isDebt: preset.is_debt,
          initialBalance: parseFloat(initialBalance) || 0,
        }),
      });

      if (!response.ok) throw new Error('Error creating account');

      window.location.reload();
    } catch (error) {
      console.error('Error:', error);
      alert('Error al crear la cuenta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button onClick={() => setIsOpen(true)} className="btn btn-primary">
        + Nueva Cuenta
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Nueva Cuenta</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Seleccioná un tipo de cuenta
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ACCOUNT_PRESETS.map((preset, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedPreset(index)}
                      className={`p-3 rounded-lg border-2 transition-all text-left ${
                        selectedPreset === index
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{preset.icon}</span>
                        <div>
                          <div className="font-medium text-sm">{preset.name}</div>
                          <div className="text-xs text-gray-500">{preset.currency}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {selectedPreset !== null && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Nombre (opcional, usar preset por defecto)
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={ACCOUNT_PRESETS[selectedPreset].name}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Saldo inicial
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={initialBalance}
                      onChange={(e) => setInitialBalance(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                    />
                  </div>

                  <button
                    onClick={handleCreate}
                    disabled={loading}
                    className="w-full btn btn-primary py-3 disabled:opacity-50"
                  >
                    {loading ? 'Creando...' : 'Crear Cuenta'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
