import type { MarketDataClient } from '@/lib/market-data-types';

const LS_KEY = 'zarix-market-data-v1';

export function loadMarketDataFromLocal(): MarketDataClient | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MarketDataClient;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveMarketDataToLocal(data: MarketDataClient): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}
