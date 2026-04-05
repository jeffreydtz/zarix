'use client';

import { useState, useMemo, useEffect } from 'react';
import { useOfflineQueue } from '@/lib/hooks/useOfflineQueue';
import type { QueuedTransaction } from '@/lib/hooks/useOfflineQueue';
import { formatAccountSelectLabel } from '@/lib/format-account-select';

const STABLE_FOR_ARS = new Set(['USDT', 'USDC', 'DAI', 'BUSD']);

type QuotesLite = {
  blueSell: number;
  btcArs?: number;
  ethArs?: number;
};

function parseQuotesResponse(data: unknown): QuotesLite | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const blue = d.dolar as { blue?: { sell?: number } } | undefined;
  const sell = Number(blue?.blue?.sell);
  if (!Number.isFinite(sell) || sell <= 0) return null;
  const crypto = d.crypto as Record<string, unknown> | undefined;
  const btc = Number((crypto?.btc as { priceARS?: number } | undefined)?.priceARS);
  const eth = Number((crypto?.eth as { priceARS?: number } | undefined)?.priceARS);
  return {
    blueSell: sell,
    btcArs: Number.isFinite(btc) && btc > 0 ? btc : undefined,
    ethArs: Number.isFinite(eth) && eth > 0 ? eth : undefined,
  };
}

interface CreateTransactionButtonProps {
  accounts: Array<{ id: string; name: string; currency: string; balance: number }>;
  categories: Array<{ id: string; name: string; icon: string; type: string }>;
  /** Solo transferencia (p. ej. desde Cuentas): sin selector Gasto/Ingreso */
  mode?: 'default' | 'transfer-only';
  triggerLabel?: string;
  triggerClassName?: string;
}

export default function CreateTransactionButton({
  accounts,
  categories,
  mode = 'default',
  triggerLabel,
  triggerClassName,
}: CreateTransactionButtonProps) {
  const transferOnly = mode === 'transfer-only';
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<'expense' | 'income' | 'transfer'>(
    transferOnly ? 'transfer' : 'expense'
  );
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  /** Si origen y destino tienen moneda distinta: el monto está en origen o en destino. */
  const [transferAmountBasis, setTransferAmountBasis] = useState<'source' | 'destination'>('source');
  const [useManualExchangeRate, setUseManualExchangeRate] = useState(false);
  const [manualExchangeRate, setManualExchangeRate] = useState('');
  const [quotesLite, setQuotesLite] = useState<QuotesLite | null>(null);
  const [quotesLoading, setQuotesLoading] = useState(false);

  const { isOnline, enqueue } = useOfflineQueue();

  const filteredCategories = categories.filter((c) => c.type === type || c.type === 'both');
  const destinationAccounts = accounts.filter((a) => a.id !== accountId);

  const sourceAccount = useMemo(
    () => accounts.find((a) => a.id === accountId),
    [accounts, accountId]
  );
  const destAccount = useMemo(
    () => accounts.find((a) => a.id === destinationAccountId),
    [accounts, destinationAccountId]
  );

  const crossCurrencyTransfer = useMemo(() => {
    if (type !== 'transfer' || !sourceAccount || !destAccount) return false;
    return (
      sourceAccount.currency.trim().toUpperCase() !== destAccount.currency.trim().toUpperCase()
    );
  }, [type, sourceAccount, destAccount]);

  const transferPayloadCurrency = useMemo(() => {
    if (type !== 'transfer' || !sourceAccount) return sourceAccount?.currency ?? 'ARS';
    if (!crossCurrencyTransfer || !destAccount) return sourceAccount.currency;
    return transferAmountBasis === 'destination' ? destAccount.currency : sourceAccount.currency;
  }, [type, sourceAccount, destAccount, crossCurrencyTransfer, transferAmountBasis]);

  const manualExchangeInvalid = useMemo(() => {
    if (type !== 'transfer' || !crossCurrencyTransfer || !useManualExchangeRate) return false;
    const p = parseFloat(manualExchangeRate.replace(',', '.'));
    return !Number.isFinite(p) || p <= 0;
  }, [type, crossCurrencyTransfer, useManualExchangeRate, manualExchangeRate]);

  useEffect(() => {
    if (!isOpen || !crossCurrencyTransfer) return;
    let cancelled = false;
    setQuotesLoading(true);
    fetch('/api/cotizaciones', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setQuotesLite(parseQuotesResponse(data));
      })
      .catch(() => {
        if (!cancelled) setQuotesLite(null);
      })
      .finally(() => {
        if (!cancelled) setQuotesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, crossCurrencyTransfer]);

  /** Referencia en pesos (ARS) del monto ingresado para transferencias multimoneda. */
  const transferArsReference = useMemo(() => {
    if (type !== 'transfer' || !crossCurrencyTransfer || !sourceAccount || !destAccount) {
      return null;
    }
    const amt = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(amt) || amt <= 0) return null;

    const cur = transferPayloadCurrency.trim().toUpperCase();
    const src = sourceAccount.currency.trim().toUpperCase();
    const dst = destAccount.currency.trim().toUpperCase();
    const manualR = parseFloat(manualExchangeRate.replace(',', '.'));
    const hasManual =
      useManualExchangeRate && Number.isFinite(manualR) && manualR > 0;

    if (cur === 'ARS') {
      return {
        ars: amt,
        hint: 'Monto ingresado en pesos argentinos.',
      };
    }

    if (cur === 'USD' || STABLE_FOR_ARS.has(cur)) {
      if (!quotesLite) {
        return quotesLoading
          ? { ars: null, hint: 'loading' as const }
          : { ars: null, hint: 'no-quote' as const };
      }
      let rate = quotesLite.blueSell;
      let hint = 'dólar blue (referencia automática)';
      const srcUsdLike = src === 'USD' || STABLE_FOR_ARS.has(src);
      const curUsdLike = cur === 'USD' || STABLE_FOR_ARS.has(cur);
      if (hasManual) {
        if (srcUsdLike && dst === 'ARS' && transferAmountBasis === 'source' && curUsdLike) {
          rate = manualR;
          hint = 'tu tipo de cambio manual';
        } else if (
          src === 'ARS' &&
          (dst === 'USD' || STABLE_FOR_ARS.has(dst)) &&
          transferAmountBasis === 'destination' &&
          curUsdLike
        ) {
          rate = manualR;
          hint = 'tu tipo de cambio manual (ARS por 1 unidad en USD/stable)';
        }
      }
      return { ars: amt * rate, hint };
    }

    if (!quotesLite) {
      return quotesLoading ? { ars: null, hint: 'loading' as const } : null;
    }

    if (cur === 'BTC' && quotesLite.btcArs) {
      return {
        ars: amt * quotesLite.btcArs,
        hint: 'precio BTC en ARS (referencia)',
      };
    }
    if (cur === 'ETH' && quotesLite.ethArs) {
      return {
        ars: amt * quotesLite.ethArs,
        hint: 'precio ETH en ARS (referencia)',
      };
    }

    return { ars: null, hint: 'unsupported' as const };
  }, [
    type,
    crossCurrencyTransfer,
    sourceAccount,
    destAccount,
    amount,
    transferPayloadCurrency,
    transferAmountBasis,
    useManualExchangeRate,
    manualExchangeRate,
    quotesLite,
    quotesLoading,
  ]);

  const resetForm = () => {
    setType(transferOnly ? 'transfer' : 'expense');
    setAmount('');
    setAccountId('');
    setDestinationAccountId('');
    setCategoryId('');
    setDescription('');
    setTransferAmountBasis('source');
    setUseManualExchangeRate(false);
    setManualExchangeRate('');
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

    const isCrossTransfer =
      type === 'transfer' &&
      sourceAccount &&
      destAccount &&
      sourceAccount.currency.trim().toUpperCase() !== destAccount.currency.trim().toUpperCase();

    const manualRateParsed = parseFloat(manualExchangeRate.replace(',', '.'));
    const exchangeRateOverride =
      type === 'transfer' &&
      isCrossTransfer &&
      useManualExchangeRate &&
      Number.isFinite(manualRateParsed) &&
      manualRateParsed > 0
        ? manualRateParsed
        : undefined;

    const payload: QueuedTransaction['payload'] = {
      type,
      accountId,
      destinationAccountId: type === 'transfer' ? destinationAccountId : undefined,
      amount: parseFloat(amount),
      currency: type === 'transfer' ? transferPayloadCurrency : account.currency,
      categoryId: type === 'transfer' ? null : (categoryId || null),
      description: description || (type === 'transfer' ? 'Transferencia entre cuentas' : ''),
      transactionDate: new Date().toISOString(),
      ...(exchangeRateOverride !== undefined ? { exchangeRateOverride } : {}),
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

  const canTransfer = accounts.length >= 2;
  const openButtonLabel = triggerLabel ?? (transferOnly ? 'Transferir entre cuentas' : '+ Nuevo Movimiento');
  const openButtonClass = triggerClassName ?? 'btn btn-primary';

  return (
    <>
      <button
        type="button"
        onClick={() => canTransfer && setIsOpen(true)}
        disabled={transferOnly && !canTransfer}
        title={transferOnly && !canTransfer ? 'Creá al menos dos cuentas para transferir' : undefined}
        className={`${openButtonClass}${transferOnly && !canTransfer ? ' opacity-50 cursor-not-allowed' : ''}`}
      >
        {openButtonLabel}
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-4 z-50"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold">
                  {transferOnly ? 'Transferencia entre cuentas' : 'Nuevo Movimiento'}
                </h2>
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
              {!transferOnly && (
                <div>
                  <label className="block text-sm font-medium mb-2">Tipo</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
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
                      type="button"
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
                      type="button"
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
              )}

              {type === 'transfer' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-2">Cuenta origen</label>
                    <select
                      value={accountId}
                      onChange={(e) => {
                        setAccountId(e.target.value);
                        setTransferAmountBasis('source');
                      }}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                    >
                      <option value="">Seleccioná una cuenta</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {formatAccountSelectLabel(acc)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Cuenta destino</label>
                    <select
                      value={destinationAccountId}
                      onChange={(e) => {
                        setDestinationAccountId(e.target.value);
                        setTransferAmountBasis('source');
                      }}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                    >
                      <option value="">Seleccioná cuenta destino</option>
                      {destinationAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {formatAccountSelectLabel(acc)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {crossCurrencyTransfer && sourceAccount && destAccount && (
                    <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-950/40 p-3 space-y-2">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                        Moneda del monto
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Elegí si el importe lo ingresás en la moneda de la cuenta origen o de la de destino
                        (la otra cuenta se actualiza con la cotización del sistema).
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <button
                          type="button"
                          onClick={() => setTransferAmountBasis('source')}
                          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                            transferAmountBasis === 'source'
                              ? 'bg-blue-600 text-white'
                              : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          Origen ({sourceAccount.currency})
                        </button>
                        <button
                          type="button"
                          onClick={() => setTransferAmountBasis('destination')}
                          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                            transferAmountBasis === 'destination'
                              ? 'bg-blue-600 text-white'
                              : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          Destino ({destAccount.currency})
                        </button>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Monto
                      {crossCurrencyTransfer && (
                        <span className="text-slate-500 dark:text-slate-400 font-normal">
                          {' '}
                          ({transferPayloadCurrency})
                        </span>
                      )}
                    </label>
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

                  {crossCurrencyTransfer && transferArsReference && (
                    <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 px-3 py-2.5 text-xs">
                      {transferArsReference.hint === 'loading' && (
                        <p className="text-slate-600 dark:text-slate-300">Obteniendo cotización de referencia…</p>
                      )}
                      {transferArsReference.hint === 'no-quote' && (
                        <p className="text-amber-800 dark:text-amber-200">
                          No se pudo cargar el dólar blue. Revisá la conexión o usá tipo de cambio manual abajo.
                        </p>
                      )}
                      {transferArsReference.ars !== null && typeof transferArsReference.ars === 'number' && (
                        <p className="text-slate-700 dark:text-slate-200 leading-relaxed">
                          <span className="text-slate-500 dark:text-slate-400">Equivalente aproximado en pesos: </span>
                          <span className="font-semibold tabular-nums text-emerald-800 dark:text-emerald-200">
                            $
                            {Math.round(transferArsReference.ars).toLocaleString('es-AR', {
                              maximumFractionDigits: 0,
                            })}{' '}
                            ARS
                          </span>
                          <span className="text-slate-500 dark:text-slate-400"> — {transferArsReference.hint}</span>
                        </p>
                      )}
                      {transferArsReference.hint === 'unsupported' && (
                        <p className="text-slate-600 dark:text-slate-400">
                          No hay referencia automática a pesos para esta moneda en el cotizador.
                        </p>
                      )}
                    </div>
                  )}

                  {crossCurrencyTransfer && sourceAccount && destAccount && (
                    <details className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-900/30 p-3">
                      <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-200">
                        Tipo de cambio manual (casos extremos)
                      </summary>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 mb-2 leading-relaxed">
                        {transferAmountBasis === 'source' ? (
                          <>
                            Indicá cuántas unidades de <strong>{destAccount.currency}</strong> equivalen a{' '}
                            <strong>1 {sourceAccount.currency}</strong> (lo que acredita el destino por cada
                            unidad debitada del origen).
                          </>
                        ) : (
                          <>
                            Indicá cuántas unidades de <strong>{sourceAccount.currency}</strong> equivalen a{' '}
                            <strong>1 {destAccount.currency}</strong> (lo que debita el origen por cada unidad
                            que ingresaste en destino).
                          </>
                        )}
                      </p>
                      <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={useManualExchangeRate}
                          onChange={(e) => {
                            setUseManualExchangeRate(e.target.checked);
                            if (!e.target.checked) setManualExchangeRate('');
                          }}
                          className="rounded border-slate-300"
                        />
                        Usar cotización propia (no la automática del sistema)
                      </label>
                      {useManualExchangeRate && (
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          value={manualExchangeRate}
                          onChange={(e) => setManualExchangeRate(e.target.value)}
                          placeholder={
                            transferAmountBasis === 'source'
                              ? `Ej: cuántos ${destAccount.currency} por 1 ${sourceAccount.currency}`
                              : `Ej: cuántos ${sourceAccount.currency} por 1 ${destAccount.currency}`
                          }
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-sm"
                        />
                      )}
                    </details>
                  )}
                </>
              ) : (
                <>
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
                          {formatAccountSelectLabel(acc)}
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
                </>
              )}

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
                  (type === 'transfer' && (!destinationAccountId || destinationAccountId === accountId)) ||
                  (type === 'transfer' && manualExchangeInvalid)
                }
                className="w-full btn btn-primary py-3 disabled:opacity-50"
              >
                {loading
                  ? 'Guardando...'
                  : isOnline
                  ? transferOnly
                    ? 'Transferir'
                    : 'Crear Movimiento'
                  : 'Guardar Offline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
