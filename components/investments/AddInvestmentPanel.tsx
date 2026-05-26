'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, ChevronDown, Loader2, Plus, Search, TriangleAlert, X } from 'lucide-react';
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

const NEEDS_TICKER = new Set<InvestmentType>(['stock_arg', 'cedear', 'stock_us', 'etf', 'crypto', 'bond']);

interface QuoteState {
  status: 'idle' | 'loading' | 'ok' | 'warn' | 'error';
  message: string | null;
}

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
  const [quoteState, setQuoteState] = useState<QuoteState>({ status: 'idle', message: null });

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
      setQuoteState({ status: 'idle', message: null });
      return;
    }
    setQuoteState({ status: 'loading', message: 'Consultando cotización…' });
    try {
      const r = await fetch(
        `/api/investments/quote?symbol=${encodeURIComponent(ticker.trim())}&type=${encodeURIComponent(type)}`
      );
      const data = await r.json();
      if (data.ok && typeof data.price === 'number') {
        const formatted = data.price.toLocaleString('es-AR', { maximumFractionDigits: 6 });
        setQuoteState({
          status: 'ok',
          message: `Cotización ${data.currency} ${formatted}${typeof data.changePct === 'number' ? ` · ${data.changePct >= 0 ? '+' : ''}${Number(data.changePct).toFixed(2)}% hoy` : ''}`,
        });
      } else {
        setQuoteState({
          status: 'warn',
          message: data.error
            ? String(data.error)
            : 'No encontramos cotización para ese ticker. Vas a poder guardar igual, pero el valor no se va a refrescar solo.',
        });
      }
    } catch {
      setQuoteState({ status: 'error', message: 'No se pudo verificar la cotización.' });
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
    setQuoteState({ status: 'idle', message: null });
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
        stock_arg: 'Acciones panel líder Merval: GGAL, YPFD, PAMP, BMA, ALUA, TGSU2. Sin sufijo .BA.',
        cedear:
          'CEDEARs por BYMA: AAPL, MSFT, NVDA, MELI, GLOB, KO. Búsqueda incluye catálogo curado de los clásicos.',
        crypto: 'Símbolo corto: BTC, ETH, USDT. CoinGecko resuelve los IDs comunes.',
        bond:
          'Bonos soberanos: AL30, GD30, AL35, AE38; CER: TX26, TX28. Variantes D=MEP, C=CCL (ej. AL30D). IMPORTANTE: cotizan por VN 100. Cargá Cantidad = VN total (ej. 1000) y Precio = precio cotizado (ej. 91980 ARS por VN 100). Vencimiento/TNA son opcionales.',
      }) as Partial<Record<InvestmentType, string>>,
    []
  );

  if (investmentAccounts.length === 0) {
    return (
      <div className="card border-amber-300/70 bg-amber-50/80 dark:border-amber-700/60 dark:bg-amber-950/30">
        <div className="flex items-start gap-3">
          <TriangleAlert className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" size={18} aria-hidden />
          <div>
            <p className="font-medium text-amber-900 dark:text-amber-100 mb-1">
              Necesitás una cuenta de inversión
            </p>
            <p className="text-sm text-amber-800/90 dark:text-amber-200/90 mb-2">
              Las posiciones se asocian a una cuenta tipo Inversión (IOL, Balanz, etc.).
            </p>
            <Link
              href="/accounts"
              className="inline-flex items-center font-semibold text-amber-950 dark:text-amber-50 underline underline-offset-2"
            >
              Ir a Cuentas y crear una →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn btn-primary inline-flex items-center gap-2 text-sm"
      >
        {open ? <X size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
        {open ? 'Cerrar' : 'Agregar posición'}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            onSubmit={handleSubmit}
            className="card space-y-4 overflow-hidden"
          >
            <div className="zx-kpi text-xs text-muted-foreground space-y-1.5">
              <p className="font-semibold text-foreground">Cómo cargar el ticker</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Escribí nombre o símbolo en el buscador (Yahoo Finance).</li>
                <li>Elegí un resultado para autocompletar; podés editar el nombre.</li>
                <li>Si no aparece, escribilo a mano y guardalo igual.</li>
              </ul>
              {helpExamples[type] && (
                <p className="pt-1.5 border-t border-border/60 text-muted-foreground">{helpExamples[type]}</p>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-muted-foreground font-medium">Cuenta</span>
                <div className="relative mt-1">
                  <select
                    className="input pr-9 appearance-none"
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
                  <ChevronDown
                    size={16}
                    aria-hidden
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                </div>
              </label>

              <label className="block text-sm">
                <span className="text-muted-foreground font-medium">Tipo</span>
                <div className="relative mt-1">
                  <select
                    className="input pr-9 appearance-none"
                    value={type}
                    onChange={(e) => {
                      setType(e.target.value as InvestmentType);
                      setTicker('');
                      setSearchQuery('');
                      setSearchHits([]);
                      setQuoteState({ status: 'idle', message: null });
                    }}
                  >
                    {TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={16}
                    aria-hidden
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                </div>
              </label>
            </div>

            {needsTicker && (
              <div className="space-y-2.5">
                <label className="block text-sm">
                  <span className="text-muted-foreground font-medium">Buscar ticker</span>
                  <div className="relative mt-1">
                    <Search
                      size={14}
                      aria-hidden
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <input
                      type="text"
                      className="input pl-9"
                      placeholder="Ej. Apple, GGAL, BTC…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                </label>
                {searchLoading && (
                  <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                    <Loader2 size={12} aria-hidden className="animate-spin" />
                    Buscando…
                  </p>
                )}
                {searchHits.length > 0 && (
                  <ul className="max-h-44 overflow-auto rounded-control border border-border bg-surface-soft text-sm divide-y divide-border/70">
                    {searchHits.map((h) => (
                      <li key={h.symbol}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-surface-elevated transition-colors"
                          onClick={() => selectHit(h)}
                        >
                          <span className="font-mono font-semibold text-foreground">{h.symbol}</span>
                          <span className="text-muted-foreground"> — {h.name}</span>
                          {h.exchange && (
                            <span className="block text-xs text-muted-foreground/80 mt-0.5">{h.exchange}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <label className="block text-sm">
                  <span className="text-muted-foreground font-medium">Ticker guardado</span>
                  <input
                    type="text"
                    className="input mt-1 font-mono uppercase tracking-tight"
                    placeholder="AAPL / GGAL / BTC"
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  />
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void verifyQuote()}
                    disabled={quoteState.status === 'loading' || !ticker.trim()}
                    className="btn btn-secondary text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {quoteState.status === 'loading' ? (
                      <Loader2 size={14} aria-hidden className="animate-spin" />
                    ) : (
                      <Search size={14} aria-hidden />
                    )}
                    Verificar cotización
                  </button>
                  {quoteState.message && (
                    <span
                      className={`text-xs inline-flex items-center gap-1 ${
                        quoteState.status === 'ok'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : quoteState.status === 'warn'
                            ? 'text-amber-600 dark:text-amber-400'
                            : quoteState.status === 'error'
                              ? 'text-red-500 dark:text-red-400'
                              : 'text-muted-foreground'
                      }`}
                    >
                      {quoteState.status === 'ok' && <CheckCircle2 size={12} aria-hidden />}
                      {quoteState.status === 'warn' && <TriangleAlert size={12} aria-hidden />}
                      {quoteState.message}
                    </span>
                  )}
                </div>
              </div>
            )}

            <label className="block text-sm">
              <span className="text-muted-foreground font-medium">Nombre</span>
              <input
                type="text"
                className="input mt-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>

            <div className="grid sm:grid-cols-3 gap-3">
              <label className="block text-sm">
                <span className="text-muted-foreground font-medium">
                  {type === 'bond' ? 'Cantidad (VN total)' : 'Cantidad'}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  className="input mt-1 tabular-nums"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="text-muted-foreground font-medium">
                  {type === 'bond' ? 'Precio compra (por VN 100)' : 'Precio compra'}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  className="input mt-1 tabular-nums"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="text-muted-foreground font-medium">Moneda compra</span>
                <div className="relative mt-1">
                  <select
                    className="input pr-9 appearance-none"
                    value={purchaseCurrency}
                    onChange={(e) => setPurchaseCurrency(e.target.value)}
                  >
                    <option value="USD">USD</option>
                    <option value="ARS">ARS</option>
                  </select>
                  <ChevronDown
                    size={16}
                    aria-hidden
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                </div>
              </label>
            </div>

            <label className="block text-sm">
              <span className="text-muted-foreground font-medium">Fecha de compra</span>
              <input
                type="date"
                className="input mt-1"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                required
              />
            </label>

            {(type === 'plazo_fijo' || type === 'caucion' || type === 'bond') && (
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-muted-foreground font-medium">Vencimiento (opcional)</span>
                  <input
                    type="date"
                    className="input mt-1"
                    value={maturityDate}
                    onChange={(e) => setMaturityDate(e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-muted-foreground font-medium">TNA % (opcional)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="input mt-1 tabular-nums"
                    value={interestRate}
                    onChange={(e) => setInterestRate(e.target.value)}
                    placeholder="Ej. 75"
                  />
                </label>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-500 dark:text-red-400 inline-flex items-center gap-1.5">
                <TriangleAlert size={14} aria-hidden />
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button type="submit" disabled={submitting} className="btn btn-primary text-sm">
                {submitting ? 'Guardando…' : 'Guardar posición'}
              </button>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setOpen(false);
                }}
                className="btn btn-ghost text-sm"
              >
                Cancelar
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
