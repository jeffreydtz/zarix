import type { InvestmentType } from '@/types/database';
import { INVESTMENT_TYPE_OPTIONS } from '@/lib/investments/type-meta';

export interface PositionAnalyticsInput {
  id: string;
  name: string;
  ticker: string | null;
  type: InvestmentType;
  market_price_currency: string;
  market_value_usd: number | null;
  profit_loss_usd: number | null;
  profit_loss_percent_usd: number | null;
  daily_change_pct: number | null;
  daily_pnl_usd: number | null;
}

export interface CompositionSlice {
  key: string;
  label: string;
  count: number;
  value: number;
  pnl: number;
  percent: number;
}

export interface RankedPosition {
  id: string;
  name: string;
  ticker: string | null;
  type: InvestmentType;
  profit_loss_usd: number;
  profit_loss_percent_usd: number;
  market_value_usd: number;
}

export interface PeriodChange {
  abs: number;
  pct: number;
}

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  INVESTMENT_TYPE_OPTIONS.map((o) => [o.value, o.label])
);

export function typeLabel(type: string): string {
  return TYPE_LABELS[type] || type;
}

export function composeComposition(
  positions: readonly PositionAnalyticsInput[],
  by: 'type' | 'currency'
): CompositionSlice[] {
  if (positions.some(p => p.market_value_usd == null || p.profit_loss_usd == null)) return [];
  const total = positions.reduce((sum, p) => sum + (p.market_value_usd ?? 0), 0);
  const acc = new Map<string, { count: number; value: number; pnl: number }>();
  for (const p of positions) {
    const key = by === 'type' ? p.type : (p.market_price_currency || 'USD').toUpperCase();
    const cur = acc.get(key) || { count: 0, value: 0, pnl: 0 };
    cur.count += 1;
    cur.value += p.market_value_usd ?? 0;
    cur.pnl += p.profit_loss_usd ?? 0;
    acc.set(key, cur);
  }
  return Array.from(acc.entries())
    .map(([key, v]) => ({
      key,
      label: by === 'type' ? typeLabel(key) : key,
      count: v.count,
      value: v.value,
      pnl: v.pnl,
      percent: total > 0 ? (v.value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

export function rankGainersLosers(
  positions: readonly PositionAnalyticsInput[],
  limit = 3
): { gainers: RankedPosition[]; losers: RankedPosition[] } {
  const ranked = positions
    .filter((p): p is PositionAnalyticsInput & {
      market_value_usd: number; profit_loss_usd: number; profit_loss_percent_usd: number;
    } => p.market_value_usd != null && p.profit_loss_usd != null
      && p.profit_loss_percent_usd != null && Number.isFinite(p.profit_loss_percent_usd))
    .map((p) => ({
      id: p.id,
      name: p.name,
      ticker: p.ticker,
      type: p.type,
      profit_loss_usd: p.profit_loss_usd,
      profit_loss_percent_usd: p.profit_loss_percent_usd,
      market_value_usd: p.market_value_usd,
    }))
    .sort((a, b) => b.profit_loss_percent_usd - a.profit_loss_percent_usd);
  return {
    gainers: ranked.filter((p) => p.profit_loss_percent_usd > 0).slice(0, limit),
    losers: ranked.filter((p) => p.profit_loss_percent_usd < 0).slice(-limit).reverse(),
  };
}

export function periodChangeFromSnapshots(
  snapshots: ReadonlyArray<{ snapshot_date: string; market_value_usd: number }>,
  currentValue: number,
  days: number,
  today = new Date()
): PeriodChange | null {
  if (!Number.isFinite(currentValue) || days <= 0) return null;
  const target = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  target.setUTCDate(target.getUTCDate() - days);
  const targetIso = target.toISOString().slice(0, 10);
  let best: { snapshot_date: string; market_value_usd: number } | null = null;
  for (const row of snapshots) {
    if (row.snapshot_date > targetIso) continue;
    if (!best || row.snapshot_date > best.snapshot_date) best = row;
  }
  if (!best || !Number.isFinite(best.market_value_usd) || best.market_value_usd <= 0) return null;
  const abs = currentValue - best.market_value_usd;
  const pct = (abs / best.market_value_usd) * 100;
  if (![abs, pct].every(Number.isFinite)) return null;
  return { abs, pct };
}
