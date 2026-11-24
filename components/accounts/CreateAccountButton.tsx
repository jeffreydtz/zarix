'use client';

import { submitAccountCreation, type AccountCreationAttempt } from '@/lib/account-create-request';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBodyScrollLock } from '@/lib/hooks/useBodyScrollLock';
import {
  ACCOUNT_FORM_CURRENCIES,
  ACCOUNT_FORM_ICONS,
  ACCOUNT_FORM_TYPES,
} from '@/components/accounts/account-form-constants';
import { useRouter } from 'next/navigation';
import { moneyAmountFromToken } from '@/lib/money-amount';

export default function CreateAccountButton() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  useBodyScrollLock(isOpen);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const attempt = useRef<AccountCreationAttempt>({});
  const [pending, setPending] = useState(false);
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('💳');
  const [selectedType, setSelectedType] = useState('bank');
  const [selectedCurrency, setSelectedCurrency] = useState('ARS');
  const [initialBalance, setInitialBalance] = useState('');
  const [isDebt, setIsDebt] = useState(false);
  const [includeInLiquid, setIncludeInLiquid] = useState(true);

  const [creditLimit, setCreditLimit] = useState('');
  const [closingDay, setClosingDay] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [isMulticurrency, setIsMulticurrency] = useState(false);
  const [secondaryCurrency, setSecondaryCurrency] = useState('USD');

  useEffect(() => {
    const discarded = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== attempt.current.pending?.id) return;
      attempt.current.pending = undefined;
      setPending(false);
      setError('Solicitud pendiente descartada. Podés editar los datos antes de crear otra.');
    };
    window.addEventListener('zarix-operation-discarded', discarded);
    return () => window.removeEventListener('zarix-operation-discarded', discarded);
  }, []);

  const selectedTypeData = ACCOUNT_FORM_TYPES.find((t) => t.value === selectedType);
  const isCreditCard = selectedType === 'credit_card';
  const isInvestment = selectedType === 'investment';

  const handleCreate = async () => {
    if (loading || attempt.current.inFlight) return;
    setError('');
    if (!name.trim()) {
      setError('El nombre es requerido');
      return;
    }

    if (isCreditCard && !creditLimit) {
      setError('El límite de crédito es requerido para tarjetas');
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
        initialBalance: parseFloat(initialBalance.replace(',', '.')) || 0,
        includeInTotal: true,
        includeInLiquid: isInvestment ? true : includeInLiquid,
      };

      if (isCreditCard) {
        const parsedLimit = moneyAmountFromToken(creditLimit);
        if (parsedLimit == null || parsedLimit <= 0) {
          setError('Ingresá un límite de crédito válido para la tarjeta');
          setLoading(false);
          return;
        }
        payload.creditLimit = parsedLimit;
        if (closingDay) payload.closingDay = parseInt(closingDay);
        if (dueDay) payload.dueDay = parseInt(dueDay);
        if (isMulticurrency) {
          payload.isMulticurrency = true;
          payload.secondaryCurrency = secondaryCurrency;
        }
      }

      const outcome = await submitAccountCreation(attempt.current, payload, {
        online: navigator.onLine, onPending: original => {
          setPending(true);
          setName(String(original.name || ''));
          setSelectedType(String(original.type || 'bank'));
          setSelectedCurrency(String(original.currency || 'ARS'));
          setSelectedIcon(String(original.icon || '💳'));
          setInitialBalance(String(original.initialBalance ?? ''));
          setIsDebt(Boolean(original.isDebt));
          setIncludeInLiquid(original.includeInLiquid !== false);
          setCreditLimit(String(original.creditLimit ?? ''));
          setClosingDay(String(original.closingDay ?? ''));
          setDueDay(String(original.dueDay ?? ''));
          setIsMulticurrency(Boolean(original.isMulticurrency));
          setSecondaryCurrency(String(original.secondaryCurrency || 'USD'));
        },
      });
      if (outcome.state !== 'confirmed') { setError(outcome.message); return; }
      setPending(false);
      setName('');
      setSelectedIcon('💳');
      setSelectedType('bank');
      setSelectedCurrency('ARS');
      setInitialBalance('');
      setIsDebt(false);
      setIncludeInLiquid(true);
      setCreditLimit('');
      setClosingDay('');
      setDueDay('');
      setIsMulticurrency(false);
      setSecondaryCurrency('USD');
      setIsOpen(false);
      router.refresh();
    } catch (error: any) {
      console.error('Error:', error);
      setError(error.message || 'Error al crear la cuenta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <motion.button 
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => { setError(''); setIsOpen(true); }}
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
              className="bg-card rounded-3xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-border"
            >
              <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between rounded-t-3xl">
                <h2 className="text-xl font-bold text-foreground">Nueva Cuenta</h2>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-xl hover:bg-secondary text-muted-foreground"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </motion.button>
              </div>

              <div className="p-6 space-y-5">
                {error && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
                    {error}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">Nombre</label>
                  <input
                        disabled={pending || loading}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej: Banco Galicia, Mercado Pago"
                    className="input"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">Tipo</label>
                  <div className="grid grid-cols-2 gap-2">
                    {ACCOUNT_FORM_TYPES.map((type) => (
                      <motion.button
                        key={type.value}
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        disabled={pending || loading}
                        onClick={() => setSelectedType(type.value)}
                        className={`p-3 rounded-xl border-2 transition-all text-left flex items-center gap-2 ${
                          selectedType === type.value
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-border'
                        }`}
                      >
                        <span className="text-xl">{type.icon}</span>
                        <span className="font-medium text-sm text-muted-foreground">{type.label}</span>
                      </motion.button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">Icono</label>
                  <div className="grid grid-cols-6 gap-2">
                    {ACCOUNT_FORM_ICONS.map((icon) => (
                      <motion.button
                        key={icon}
                        type="button"
                        whileTap={{ scale: 0.9 }}
                        disabled={pending || loading}
                          onClick={() => setSelectedIcon(icon)}
                        className={`p-2.5 text-2xl rounded-xl border-2 transition-all ${
                          selectedIcon === icon
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-border'
                        }`}
                      >
                        {icon}
                      </motion.button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">Moneda</label>
                  <div className="grid grid-cols-5 gap-2">
                    {ACCOUNT_FORM_CURRENCIES.map((currency) => (
                      <motion.button
                        key={currency.value}
                        type="button"
                        whileTap={{ scale: 0.95 }}
                        disabled={pending || loading}
                        onClick={() => setSelectedCurrency(currency.value)}
                        className={`p-2 rounded-xl border-2 transition-all text-center ${
                          selectedCurrency === currency.value
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-border'
                        }`}
                      >
                        <div className="text-lg">{currency.flag}</div>
                        <div className="text-xs font-medium text-muted-foreground">{currency.value}</div>
                      </motion.button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">
                    Saldo inicial
                  </label>
                  <input
                        disabled={pending || loading}
                    type="text"
                    inputMode="decimal"
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
                      <div className="p-4 bg-warning/10 rounded-xl border border-warning/30">
                        <p className="text-sm text-warning font-medium mb-3">
                          Datos de la tarjeta
                        </p>
                        
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">
                              Límite de crédito *
                            </label>
                            <input
                        disabled={pending || loading}
                              type="text"
                              inputMode="decimal"
                              value={creditLimit}
                              onChange={(e) => setCreditLimit(e.target.value)}
                              placeholder="100000"
                              className="input"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-muted-foreground mb-1">
                                Día de cierre
                              </label>
                              <input
                        disabled={pending || loading}
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
                              <label className="block text-xs font-medium text-muted-foreground mb-1">
                                Día de vencimiento
                              </label>
                              <input
                        disabled={pending || loading}
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

                          <div className="flex items-center gap-3 p-3 bg-card rounded-lg border border-warning/30">
                            <input
                        disabled={pending || loading}
                              type="checkbox"
                              id="isMulticurrency"
                              checked={isMulticurrency}
                              onChange={(e) => setIsMulticurrency(e.target.checked)}
                              className="w-5 h-5 text-warning rounded-lg focus:ring-2 focus:ring-warning"
                            />
                            <div className="flex-1">
                              <label htmlFor="isMulticurrency" className="text-sm font-medium text-muted-foreground">
                                Tarjeta bi-moneda
                              </label>
                              <p className="text-xs text-muted-foreground">
                                Acepta gastos en otra moneda sin convertir
                              </p>
                            </div>
                          </div>

                          {isMulticurrency && (
                            <div>
                              <label className="block text-xs font-medium text-muted-foreground mb-1">
                                Segunda moneda
                              </label>
                              <select
                        disabled={pending || loading}
                                value={secondaryCurrency}
                                onChange={(e) => setSecondaryCurrency(e.target.value)}
                                className="input"
                              >
                                {ACCOUNT_FORM_CURRENCIES.filter((c) => c.value !== selectedCurrency).map((currency) => (
                                  <option key={currency.value} value={currency.value}>
                                    {currency.flag} {currency.value}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {!isCreditCard && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-3 p-3 bg-secondary rounded-xl"
                    >
                      <input
                        disabled={pending || loading}
                        type="checkbox"
                        id="isDebt"
                        checked={isDebt}
                        onChange={(e) => setIsDebt(e.target.checked)}
                        className="w-5 h-5 text-primary rounded-lg focus:ring-2 focus:ring-ring"
                      />
                      <label htmlFor="isDebt" className="text-sm font-medium text-muted-foreground">
                        Es una deuda (mostrar saldo negativo)
                      </label>
                    </motion.div>
                  )}

                  {!isInvestment && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-start gap-3 p-3 bg-secondary rounded-xl"
                    >
                      <input
                        disabled={pending || loading}
                        type="checkbox"
                        id="includeInLiquid"
                        checked={includeInLiquid}
                        onChange={(e) => setIncludeInLiquid(e.target.checked)}
                        className="w-5 h-5 text-primary rounded-lg focus:ring-2 focus:ring-ring mt-0.5"
                      />
                      <div>
                        <label htmlFor="includeInLiquid" className="text-sm font-medium text-muted-foreground">
                          Contar en patrimonio líquido
                        </label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Desmarcá si no querés que sume al “liquidez” del panel (sigue en el total).
                        </p>
                      </div>
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
                    pending ? 'Reintentar la misma solicitud' : 'Crear Cuenta'
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
