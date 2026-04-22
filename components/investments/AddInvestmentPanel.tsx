'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Account } from '@/types/database';
import type { InvestmentType } from '@/types/database';

interface TickerHit {
  symbol: string;
  name: string;
  exchange?: string;
}

const TYPE_OPTIONS: { value: InvestmentType; label: string }[] = [
  { value: 'stock_us', label: 'Acción USA' },
  { value: 'etf', label: 'ETF (USA)' },
  { value: 'cedear', label: 'CEDEAR' },
  { value: 'stock_arg', label: 'Acción Argentina (BYMA)' },
  { value: 'crypto', label: 'Cripto' },
  { value: 'plazo_fijo', label: 'Plazo fijo' },
  { value: 'fci', label: 'FCI' },
  { value: 'bond', label: 'Bono' },
  { value: 'caucion', label: 'Caución' },
  { value: 'real_estate', label: 'Inmueble' },
  { value: 'other', label: 'Otro' },
];

const NEEDS_TICKER = new Set<InvestmentType>([
  'stock_arg',
  'cedear',
  'stock_us',
  'etf',
  'crypto',
]);

interface AddInvestmentPanelProps {
  investmentAccounts: Account[];
  onCreated?: () => void;
}

export default function AddInvestmentPanel({ investmentAccounts, onCreated }: AddInvestmentPanelProps) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [type, setType] = useState<InvestmentType>('stock_us');
  const [ticker, setTicker] = useState('');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseCurrency, setPurchaseCurrency] = useState('USD');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [maturityDate, setMaturityDate] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHits, setSearchHits] = useState<TickerHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotePreview, setQuotePreview] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const needsTicker = NEEDS_TICKER.has(type);

  useEffect(() => {
    if (investmentAccounts.length === 0) return;
    if (!accountId || !investmentAccounts.some((a) => a.id === accountId)) {
      setAccountId(investmentAccounts[0].id);
    }
  }, [investmentAccounts, accountId]);

  useEffect(() => {
    if (!needsTicker) {
      setSearchHits([]);
      setSearchQuery('');
      return;
    }

    const q = searchQuery.trim();
    if (q.length < 1) {
      setSearchHits([]);
      return;
    }

    const handle = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const r = await fetch(
          `/api/investments/ticker-search?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}`
        );
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Error de búsqueda');
        setSearchHits(Array.isArray(data.results) ? data.results : []);
      } catch {
        setSearchHits([]);
      } finally {
        setSearchLoading(false);
      }
    }, 400);

    return () => clearTimeout(handle);
  }, [searchQuery, type, needsTicker]);

  const verifyQuote = useCallback(async () => {
    if (!needsTicker || !ticker.trim()) {
      setQuotePreview(null);
      return;
    }
    setQuoteLoading(true);
    setQuotePreview(null);
    try {
      const r = await fetch(
        `/api/investments/quote?symbol=${encodeURIComponent(ticker.trim())}&type=${encodeURIComponent(type)}`
      );
      const data = await r.json();
      if (data.ok && typeof data.price === 'number') {
        setQuotePreview(
          `Cotización actual: ${data.currency} ${data.price.toLocaleString('es-AR', {
            maximumFractionDigits: 6,
          })}`
        );
      } else {
        setQuotePreview(data.error ? String(data.error) : 'No se encontró cotización para ese ticker.');
      }
    } catch {
      setQuotePreview('No se pudo verificar la cotización.');
    } finally {
      setQuoteLoading(false);
    }
  }, [needsTicker, ticker, type]);

  const selectHit = (hit: TickerHit) => {
    setTicker(hit.symbol);
    setName(hit.name);
    setSearchQuery(hit.symbol);
    setSearchHits([]);
  };

  const resetForm = () => {
    setTicker('');
    setName('');
    setQuantity('1');
    setPurchasePrice('');
    setPurchaseCurrency('USD');
    setPurchaseDate(new Date().toISOString().split('T')[0]);
    setMaturityDate('');
    setInterestRate('');
    setSearchQuery('');
    setSearchHits([]);
    setError(null);
    setQuotePreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!accountId) {
      setError('Elegí una cuenta de inversión.');
      return;
    }
    if (needsTicker && !ticker.trim()) {
      setError('Buscá y elegí un ticker, o escribilo a mano.');
      return;
    }
    if (!name.trim()) {
      setError('Completá el nombre del activo.');
      return;
    }
    const qty = Number(quantity);
    const price = Number(purchasePrice);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('La cantidad debe ser un número mayor a 0.');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setError('El precio de compra debe ser un número mayor a 0.');
      return;
    }

    setSubmitting(true);
    try {
      const r = await fetch('/api/investments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          type,
          ticker: needsTicker ? ticker.trim().toUpperCase() : undefined,
          name: name.trim(),
          quantity: qty,
          purchasePrice: price,
          purchaseCurrency,
          purchaseDate,
          maturityDate: maturityDate || undefined,
          interestRate: interestRate ? Number(interestRate) : undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        throw new Error(data.error || 'No se pudo guardar');
      }
      resetForm();
      setOpen(false);
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSubmitting(false);
    }
  };

  const helpExamples = useMemo(
    () =>
      ({
        stock_us: 'En Yahoo Finance buscá la empresa: el ticker suele ser 3–5 letras (AAPL, MSFT).',
        etf: 'Igual que acciones USA: SPY, VOO, QQQ.',
        stock_arg: 'Las acciones locales en Yahoo llevan sufijo .BA (ej. GGAL.BA). Acá guardamos solo GGAL.',
        cedear: 'CEDEARs cotizan en pesos con sufijo .BA; el ticker base es el mismo estilo (ej. AAPL.BA → podés guardar AAPL si tu broker muestra el CEDEAR con ese código).',
        crypto: 'Usá el símbolo corto: BTC, ETH, USDT. CoinGecko resuelve varios IDs comunes.',
      }) as Partial<Record<InvestmentType, string>>,
    []
  );

  if (investmentAccounts.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/80 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
        <p className="font-medium mb-1">Necesitás una cuenta de inversión</p>
        <p className="text-amber-800/90 dark:text-amber-200/90 mb-2">
          Las posiciones se asocian a una cuenta tipo Inversión (IOL, Balanz, etc.).
        </p>
        <Link
          href="/accounts"
          className="inline-flex font-semibold text-amber-950 dark:text-amber-50 underline underline-offset-2"
        >
          Ir a Cuentas y crear una
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2.5 shadow-sm transition-colors"
      >
        {open ? 'Cerrar' : '+ Agregar posición'}
      </button>

      {open && (
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-4"
        >
          <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-600 p-3 text-xs text-slate-600 dark:text-slate-300 space-y-2">
            <p className="font-semibold text-slate-800 dark:text-slate-100">Cómo mapear el ticker</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Escribí nombre o símbolo en el buscador (datos vía Yahoo Finance).</li>
              <li>Elegí un resultado para rellenar ticker y nombre; podés editar el nombre.</li>
              <li>
                Cotización en vivo: al guardar, el valor se actualiza solo (y la página refresca el portafolio cada
                pocos minutos).
              </li>
            </ul>
            {helpExamples[type] && <p className="pt-1 border-t border-slate-200 dark:border-slate-600">{helpExamples[type]}</p>}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-400 font-medium">Cuenta</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                required
              >
                {investmentAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-400 font-medium">Tipo</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                value={type}
                onChange={(e) => {
                  setType(e.target.value as InvestmentType);
                  setTicker('');
                  setSearchQuery('');
                  setSearchHits([]);
                  setQuotePreview(null);
                }}
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {needsTicker && (
            <div className="space-y-2">
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400 font-medium">Buscar ticker</span>
                <input
                  type="text"
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  placeholder="Ej. Apple, GGAL, BTC…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoComplete="off"
                />
              </label>
              {searchLoading && <p className="text-xs text-slate-500">Buscando…</p>}
              {searchHits.length > 0 && (
                <ul className="max-h-40 overflow-auto rounded-lg border border-slate-200 dark:border-slate-600 divide-y divide-slate-100 dark:divide-slate-700 text-sm">
                  {searchHits.map((h) => (
                    <li key={h.symbol}>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                        onClick={() => selectHit(h)}
                      >
                        <span className="font-mono font-semibold text-slate-900 dark:text-slate-50">{h.symbol}</span>
                        <span className="text-slate-500 dark:text-slate-400"> — {h.name}</span>
                        {h.exchange && (
                          <span className="block text-xs text-slate-400 mt-0.5">{h.exchange}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400 font-medium">Ticker guardado</span>
                <input
                  type="text"
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-mono uppercase"
                  placeholder="AAPL / GGAL / BTC"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                />
              </label>

              <button
                type="button"
                onClick={() => void verifyQuote()}
                disabled={quoteLoading || !ticker.trim()}
                className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:underline disabled:opacity-50"
              >
                {quoteLoading ? 'Consultando…' : 'Verificar cotización ahora'}
              </button>
              {quotePreview && <p className="text-xs text-slate-600 dark:text-slate-300">{quotePreview}</p>}
            </div>
          )}

          <label className="block text-sm">
            <span className="text-slate-600 dark:text-slate-400 font-medium">Nombre</span>
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>

          <div className="grid sm:grid-cols-3 gap-3">
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-400 font-medium">Cantidad</span>
              <input
                type="text"
                inputMode="decimal"
                className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm tabular-nums"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-400 font-medium">Precio compra</span>
              <input
                type="text"
                inputMode="decimal"
                className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm tabular-nums"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-400 font-medium">Moneda compra</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                value={purchaseCurrency}
                onChange={(e) => setPurchaseCurrency(e.target.value)}
              >
                <option value="USD">USD</option>
                <option value="ARS">ARS</option>
              </select>
            </label>
          </div>

          <label className="block text-sm">
            <span className="text-slate-600 dark:text-slate-400 font-medium">Fecha de compra</span>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              required
            />
          </label>

          {(type === 'plazo_fijo' || type === 'caucion' || type === 'bond') && (
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400 font-medium">Vencimiento (opcional)</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  value={maturityDate}
                  onChange={(e) => setMaturityDate(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400 font-medium">TNA % (opcional)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value)}
                  placeholder="Ej. 75"
                />
              </label>
            </div>
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5"
            >
              {submitting ? 'Guardando…' : 'Guardar posición'}
            </button>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setOpen(false);
              }}
              className="rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-medium px-4 py-2.5 text-slate-700 dark:text-slate-200"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
