'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowUpRight,
  Bitcoin,
  Building2,
  CandlestickChart,
  Coins,
  Globe2,
  HandCoins,
  LineChart,
  Pencil,
  PiggyBank,
  Receipt,
  Trash2,
  Wallet,
} from 'lucide-react';
import type { InvestmentType } from '@/types/database';
import type { InvestmentWithPnL } from '@/lib/services/investments';
import { maybeReduceTransition, motionTransition } from '@/lib/motion';
import { PRIVACY_MASK, useInvestmentsPrivacy } from '@/lib/hooks/use-investments-privacy';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import AssetLogo from '@/components/investments/AssetLogo';
import { priceFactorForType } from '@/lib/investments/type-meta';
import { formatQuoteUpdatedAtLabel } from '@/lib/investments/quote-updated-at';

interface InvestmentsListProps {
  investments: InvestmentWithPnL[];
  onArchived?: () => void;
  onEdit?: (inv: InvestmentWithPnL) => void;
  onSell?: (inv: InvestmentWithPnL) => void;
}

const TYPE_ICON: Record<InvestmentType, typeof CandlestickChart> = {
  stock_arg: CandlestickChart,
  cedear: LineChart,
  stock_us: Globe2,
  etf: LineChart,
  crypto: Bitcoin,
  plazo_fijo: PiggyBank,
  fci: Wallet,
  bond: Receipt,
  on: Building2,
  caucion: Coins,
  real_estate: Building2,
  other: Wallet,
};

function formatPrice(value: number, currency: string): string {
  if (currency === 'ARS') {
    return `ARS ${value.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
  }
  return `${currency} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pnlColor(value: number | null): string {
  if (value == null) return 'text-muted-foreground';
  if (value > 0) return 'text-success';
  if (value < 0) return 'text-destructive';
  return 'text-muted-foreground';
}

export default function InvestmentsList({ investments, onArchived, onEdit, onSell }: InvestmentsListProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const { hidden } = useInvestmentsPrivacy();
  const confirm = useConfirm();
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const archive = async (id: string) => {
    const ok = await confirm({
      title: '¿Archivar esta posición?',
      description: 'Podés volver a cargarla después si hace falta.',
      confirmLabel: 'Archivar',
      danger: true,
    });
    if (!ok) return;
    setArchivingId(id);
    try {
      const r = await fetch(`/api/investments/${id}`, { method: 'DELETE' });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || 'Error al archivar');
      }
      onArchived?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo archivar');
    } finally {
      setArchivingId(null);
    }
  };

  if (investments.length === 0) {
    return (
      <div className="card text-center py-12 px-4">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <LineChart size={22} aria-hidden />
        </div>
        <p className="text-foreground font-medium mb-1">No tenés posiciones cargadas</p>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Agregá acciones, CEDEARs, crypto o plazos fijos para ver valor de mercado y P&L acá.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {investments.map((inv, idx) => {
        const Icon = TYPE_ICON[inv.type] ?? Wallet;
        const dayPct = inv.daily_change_pct;
        const dayKnown = dayPct != null && Number.isFinite(dayPct);
        const dayPositive = dayKnown && dayPct >= 0;
        const dayClass = dayKnown ? pnlColor(dayPct) : 'text-muted-foreground';
        const totalPositive = inv.profit_loss_usd != null && inv.profit_loss_usd >= 0;

        return (
          <motion.div
            key={inv.id}
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={maybeReduceTransition(shouldReduceMotion, {
              ...motionTransition.smooth,
              delay: idx * 0.03,
            })}
            className="card hover:border-primary/30 transition-colors"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                {inv.ticker ? (
                  <AssetLogo type={inv.type} ticker={inv.ticker} name={inv.name} size={44} />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary">
                    <Icon size={20} aria-hidden />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    {inv.ticker ? (
                      <span className="font-semibold text-foreground font-mono tracking-tight">{inv.ticker}</span>
                    ) : null}
                    <span className="text-sm text-muted-foreground truncate">{inv.name}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                    {priceFactorForType(inv.type) === 100 ? 'VN ' : ''}
                    {inv.quantity.toLocaleString('es-AR', { maximumFractionDigits: 8 })}
                    {priceFactorForType(inv.type) !== 100 ? ' unidades' : ''}
                    {' · '}
                    Compra: {inv.purchase_currency}{' '}
                    {hidden
                      ? PRIVACY_MASK
                      : inv.purchase_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    {priceFactorForType(inv.type) === 100 ? ' / VN 100' : ''}
                  </div>
                  {inv.current_price ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span className="text-muted-foreground tabular-nums">
                        Precio: {formatPrice(Number(inv.current_price), inv.market_price_currency)}
                        {priceFactorForType(inv.type) === 100 ? <span className="opacity-70"> / VN 100</span> : null}
                      </span>
                      <span className="text-muted-foreground">
                        {inv.valuation_price_source === 'estimate' ? 'Estimación con cotización vencida' :
                          inv.valuation_price_source === 'purchase_reference' ? 'Referencia de compra · sin cotización' :
                          inv.valuation_price_source === 'cache' ? 'Última cotización guardada' :
                            inv.valuation_price_source === 'manual' ? 'Precio ingresado' : 'Cotización de mercado'}
                      </span>
                      {inv.is_manual_price ? (
                        <span className="rounded-full bg-warning/20 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                          Manual
                        </span>
                      ) : (
                        <>
                          <span className={`inline-flex items-center gap-0.5 font-medium tabular-nums ${dayClass}`}>
                            {dayKnown ? (
                              <>
                                {dayPositive ? (
                                  <ArrowUpRight size={12} aria-hidden />
                                ) : (
                                  <ArrowDownRight size={12} aria-hidden />
                                )}
                                {Math.abs(dayPct).toFixed(2)}% hoy
                              </>
                            ) : (
                              <span className="opacity-75">variación N/D</span>
                            )}
                          </span>
                          <span className="text-muted-foreground/80">
                            · {formatQuoteUpdatedAtLabel(inv.current_price_updated_at)}
                          </span>
                        </>
                      )}
                    </div>
                  ) : null}
                  {inv.sales_count > 0 && inv.realized_pnl_usd != null ? (
                    <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-surface-soft px-2 py-0.5 text-[11px]">
                      <HandCoins size={11} aria-hidden className="opacity-70" />
                      <span className="text-muted-foreground">Realizado:</span>
                      <span className={`font-semibold tabular-nums ${pnlColor(inv.realized_pnl_usd)}`}>
                        {inv.realized_pnl_usd >= 0 ? '+' : ''}USD {inv.realized_pnl_usd.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                      </span>
                      <span className="text-muted-foreground/70">
                        · {inv.sales_count} {inv.sales_count === 1 ? 'venta' : 'ventas'}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-row sm:flex-col items-end sm:items-end justify-between gap-2 sm:min-w-[180px] sm:text-right">
                <div className="flex flex-col items-end gap-0.5">
                  {inv.fxUnavailable && <div className="text-sm font-semibold tabular-nums">
                    {inv.current_value_native == null ? 'Valor no disponible' : hidden
                      ? `${inv.market_price_currency} ${PRIVACY_MASK}`
                      : formatPrice(inv.current_value_native, inv.market_price_currency)}
                    <p className="text-xs text-warning">Cotizaciones no disponibles</p>
                  </div>}
                  {inv.market_value_usd != null && <><div className="text-base sm:text-lg font-bold text-foreground tabular-nums">
                    {hidden
                      ? `USD ${PRIVACY_MASK}`
                      : `USD ${inv.market_value_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {inv.market_value_ars_blue == null ? 'Conversión ARS no disponible' : hidden
                      ? `≈ ARS ${PRIVACY_MASK}`
                      : `≈ ARS ${inv.market_value_ars_blue.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`}
                  </div>
                  </>}
                  {inv.profit_loss_usd != null && inv.profit_loss_percent_usd != null && <div className={`text-sm font-semibold tabular-nums ${pnlColor(inv.profit_loss_usd)}`}>
                    {totalPositive ? '+' : ''}USD {inv.profit_loss_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    <span className="ml-1 text-xs opacity-80">
                      ({totalPositive ? '+' : ''}{inv.profit_loss_percent_usd.toFixed(2)}%)
                    </span>
                  </div>}
                </div>

                <div className="flex items-center gap-1">
                  {onSell && (
                    <button
                      type="button"
                      onClick={() => onSell(inv)}
                      className="inline-flex h-11 items-center justify-center gap-1 rounded-control px-3 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                      aria-label="Vender posición"
                      title="Vender"
                    >
                      <HandCoins size={13} aria-hidden />
                      Vender
                    </button>
                  )}
                  {onEdit && (
                    <button
                      type="button"
                      onClick={() => onEdit(inv)}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-control text-muted-foreground hover:text-foreground hover:bg-surface-soft transition-colors"
                      aria-label="Editar posición"
                      title="Editar"
                    >
                      <Pencil size={14} aria-hidden />
                    </button>
                  )}
                  {onArchived && (
                    <button
                      type="button"
                      onClick={() => void archive(inv.id)}
                      disabled={archivingId === inv.id}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-control text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                      aria-label="Archivar posición"
                      title="Archivar"
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
