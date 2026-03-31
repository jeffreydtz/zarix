'use client';

import { useState } from 'react';

const ICONS = [
  '💳', '🏦', '💰', '💵', '💸', '🪙', 
  '📱', '🏧', '💎', '🎯', '🔐', '📊',
  '💼', '🏠', '🚗', '✈️', '🎓', '⚡'
];

const ACCOUNT_TYPES = [
  { value: 'bank', label: '🏦 Banco', color: '#3B82F6' },
  { value: 'cash', label: '💵 Efectivo', color: '#10B981' },
  { value: 'investment', label: '📈 Inversión', color: '#8B5CF6' },
  { value: 'credit_card', label: '💳 Tarjeta de Crédito', color: '#F59E0B' },
  { value: 'crypto', label: '₿ Crypto', color: '#EF4444' },
  { value: 'digital_wallet', label: '📱 Billetera Digital', color: '#06B6D4' },
  { value: 'other', label: '🔁 Otro', color: '#6B7280' },
];

const CURRENCIES = [
  { value: 'ARS', label: 'ARS ($)', flag: '🇦🇷' },
  { value: 'USD', label: 'USD ($)', flag: '🇺🇸' },
  { value: 'BTC', label: 'BTC (₿)', flag: '₿' },
  { value: 'ETH', label: 'ETH (Ξ)', flag: 'Ξ' },
  { value: 'USDT', label: 'USDT', flag: '₮' },
];

export default function CreateAccountButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('💳');
  const [selectedType, setSelectedType] = useState('bank');
  const [selectedCurrency, setSelectedCurrency] = useState('ARS');
  const [initialBalance, setInitialBalance] = useState('');
  const [isDebt, setIsDebt] = useState(false);
  
  // Campos específicos para tarjetas de crédito
  const [creditLimit, setCreditLimit] = useState('');
  const [closingDay, setClosingDay] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [last4Digits, setLast4Digits] = useState('');

  const selectedTypeData = ACCOUNT_TYPES.find(t => t.value === selectedType);
  const isCreditCard = selectedType === 'credit_card';

  const handleCreate = async () => {
    if (!name.trim()) {
      alert('El nombre es requerido');
      return;
    }

    if (isCreditCard && !creditLimit) {
      alert('El límite de crédito es requerido para tarjetas');
      return;
    }

    setLoading(true);

    try {
      const payload: any = {
        name: name.trim(),
        type: selectedType,
        currency: selectedCurrency,
        icon: selectedIcon,
        color: selectedTypeData?.color || '#3B82F6',
        isDebt: isCreditCard || isDebt,
        initialBalance: parseFloat(initialBalance) || 0,
        includeInTotal: !isCreditCard,
      };

      if (isCreditCard) {
        payload.creditLimit = parseFloat(creditLimit);
        if (closingDay) payload.closingDay = parseInt(closingDay);
        if (dueDay) payload.dueDay = parseInt(dueDay);
        if (last4Digits) payload.last4Digits = last4Digits;
      }

      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Error creating account');

      setName('');
      setSelectedIcon('💳');
      setSelectedType('bank');
      setSelectedCurrency('ARS');
      setInitialBalance('');
      setIsDebt(false);
      setCreditLimit('');
      setClosingDay('');
      setDueDay('');
      setLast4Digits('');
      setIsOpen(false);
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
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6">
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
                <label className="block text-sm font-medium mb-2">Nombre</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Banco Galicia, Mercado Pago, Billetera"
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Tipo</label>
                <div className="grid grid-cols-2 gap-2">
                  {ACCOUNT_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setSelectedType(type.value)}
                      className={`p-3 rounded-lg border-2 transition-all text-left ${
                        selectedType === type.value
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-medium text-sm">{type.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Ícono</label>
                <div className="grid grid-cols-6 gap-2">
                  {ICONS.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setSelectedIcon(icon)}
                      className={`p-3 text-2xl rounded-lg border-2 transition-all ${
                        selectedIcon === icon
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Moneda</label>
                <div className="grid grid-cols-3 gap-2">
                  {CURRENCIES.map((currency) => (
                    <button
                      key={currency.value}
                      type="button"
                      onClick={() => setSelectedCurrency(currency.value)}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        selectedCurrency === currency.value
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-lg">{currency.flag}</div>
                      <div className="text-xs font-medium">{currency.value}</div>
                    </button>
                  ))}
                </div>
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

              {isCreditCard && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Límite de crédito *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={creditLimit}
                      onChange={(e) => setCreditLimit(e.target.value)}
                      placeholder="Ej: 100000"
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Día de cierre (opcional)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={closingDay}
                        onChange={(e) => setClosingDay(e.target.value)}
                        placeholder="Ej: 15"
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Día de vencimiento
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={dueDay}
                        onChange={(e) => setDueDay(e.target.value)}
                        placeholder="Ej: 25"
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Últimos 4 dígitos (opcional)
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      value={last4Digits}
                      onChange={(e) => setLast4Digits(e.target.value.replace(/\D/g, ''))}
                      placeholder="1234"
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                    />
                  </div>
                </>
              )}

              {!isCreditCard && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isDebt"
                    checked={isDebt}
                    onChange={(e) => setIsDebt(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <label htmlFor="isDebt" className="text-sm font-medium">
                    Es una deuda (mostrar saldo negativo)
                  </label>
                </div>
              )}

              <button
                onClick={handleCreate}
                disabled={loading || !name.trim()}
                className="w-full btn btn-primary py-3 disabled:opacity-50"
              >
                {loading ? 'Creando...' : 'Crear Cuenta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
