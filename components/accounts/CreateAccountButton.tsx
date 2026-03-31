'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ICONS = [
  '💳', '🏦', '💰', '💵', '💸', '🪙', 
  '📱', '🏧', '💎', '🎯', '🔐', '📊',
  '💼', '🏠', '🚗', '✈️', '🎓', '⚡'
];

const ACCOUNT_TYPES = [
  { value: 'bank', label: 'Banco', icon: '🏦', color: '#3B82F6' },
  { value: 'cash', label: 'Efectivo', icon: '💵', color: '#10B981' },
  { value: 'investment', label: 'Inversion', icon: '📈', color: '#8B5CF6' },
  { value: 'credit_card', label: 'Tarjeta de Credito', icon: '💳', color: '#F59E0B' },
  { value: 'crypto', label: 'Crypto', icon: '₿', color: '#EF4444' },
  { value: 'digital_wallet', label: 'Billetera Digital', icon: '📱', color: '#06B6D4' },
  { value: 'other', label: 'Otro', icon: '🔁', color: '#6B7280' },
];

const CURRENCIES = [
  { value: 'ARS', label: 'ARS', flag: '🇦🇷' },
  { value: 'USD', label: 'USD', flag: '🇺🇸' },
  { value: 'BTC', label: 'BTC', flag: '₿' },
  { value: 'ETH', label: 'ETH', flag: 'Ξ' },
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
      alert('El limite de credito es requerido para tarjetas');
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
      <motion.button 
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setIsOpen(true)} 
        className="btn btn-primary flex items-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Nueva Cuenta
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={(e) => e.target === e.currentTarget && setIsOpen(false)}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white dark:bg-slate-800 rounded-3xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 dark:border-slate-700"
            >
              <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between rounded-t-3xl">
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">Nueva Cuenta</h2>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </motion.button>
              </div>

              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Nombre</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej: Banco Galicia, Mercado Pago"
                    className="input"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Tipo</label>
                  <div className="grid grid-cols-2 gap-2">
                    {ACCOUNT_TYPES.map((type) => (
                      <motion.button
                        key={type.value}
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setSelectedType(type.value)}
                        className={`p-3 rounded-xl border-2 transition-all text-left flex items-center gap-2 ${
                          selectedType === type.value
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <span className="text-xl">{type.icon}</span>
                        <span className="font-medium text-sm text-slate-700 dark:text-slate-300">{type.label}</span>
                      </motion.button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Icono</label>
                  <div className="grid grid-cols-6 gap-2">
                    {ICONS.map((icon) => (
                      <motion.button
                        key={icon}
                        type="button"
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setSelectedIcon(icon)}
                        className={`p-2.5 text-2xl rounded-xl border-2 transition-all ${
                          selectedIcon === icon
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        {icon}
                      </motion.button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Moneda</label>
                  <div className="grid grid-cols-5 gap-2">
                    {CURRENCIES.map((currency) => (
                      <motion.button
                        key={currency.value}
                        type="button"
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setSelectedCurrency(currency.value)}
                        className={`p-2 rounded-xl border-2 transition-all text-center ${
                          selectedCurrency === currency.value
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <div className="text-lg">{currency.flag}</div>
                        <div className="text-xs font-medium text-slate-600 dark:text-slate-400">{currency.value}</div>
                      </motion.button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Saldo inicial
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={initialBalance}
                    onChange={(e) => setInitialBalance(e.target.value)}
                    placeholder="0.00"
                    className="input"
                  />
                </div>

                <AnimatePresence mode="wait">
                  {isCreditCard && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-4 overflow-hidden"
                    >
                      <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
                        <p className="text-sm text-amber-700 dark:text-amber-300 font-medium mb-3">
                          Datos de la tarjeta
                        </p>
                        
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                              Limite de credito *
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={creditLimit}
                              onChange={(e) => setCreditLimit(e.target.value)}
                              placeholder="100000"
                              className="input"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                Dia de cierre
                              </label>
                              <input
                                type="number"
                                min="1"
                                max="31"
                                value={closingDay}
                                onChange={(e) => setClosingDay(e.target.value)}
                                placeholder="15"
                                className="input"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                Dia de vencimiento
                              </label>
                              <input
                                type="number"
                                min="1"
                                max="31"
                                value={dueDay}
                                onChange={(e) => setDueDay(e.target.value)}
                                placeholder="25"
                                className="input"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                              Ultimos 4 digitos
                            </label>
                            <input
                              type="text"
                              maxLength={4}
                              value={last4Digits}
                              onChange={(e) => setLast4Digits(e.target.value.replace(/\D/g, ''))}
                              placeholder="1234"
                              className="input font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {!isCreditCard && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl"
                    >
                      <input
                        type="checkbox"
                        id="isDebt"
                        checked={isDebt}
                        onChange={(e) => setIsDebt(e.target.checked)}
                        className="w-5 h-5 text-blue-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                      <label htmlFor="isDebt" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Es una deuda (mostrar saldo negativo)
                      </label>
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={handleCreate}
                  disabled={loading || !name.trim()}
                  className="w-full btn btn-primary py-3.5 text-base"
                >
                  {loading ? (
                    <motion.span
                      animate={{ opacity: [1, 0.5, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    >
                      Creando...
                    </motion.span>
                  ) : (
                    'Crear Cuenta'
                  )}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
