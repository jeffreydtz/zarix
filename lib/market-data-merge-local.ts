import type { MarketDataClient, MarketStaleFlags, MarketSectionTimes } from '@/lib/market-data-types';

/** Si el servidor devolvió secciones vacías pero hay snapshot en el dispositivo, rellenar y marcar stale. */
export function mergeMarketWithLocalSnapshot(
  api: MarketDataClient,
  local: MarketDataClient | null
): MarketDataClient {
  if (!local) return api;

  const stale: MarketStaleFlags = {
    crypto: api.stale?.crypto ?? false,
    usStocks: api.stale?.usStocks ?? false,
    argStocks: api.stale?.argStocks ?? false,
  };
  const sectionTimes: MarketSectionTimes = { ...api.sectionTimes };

  let crypto = api.crypto;
  if (!crypto.length && local.crypto.length) {
    crypto = local.crypto;
    stale.crypto = true;
    sectionTimes.crypto = local.sectionTimes?.crypto ?? local.fetchedAt;
  }

  let usStocks = api.usStocks;
  if (!usStocks.length && local.usStocks.length) {
    usStocks = local.usStocks;
    stale.usStocks = true;
    sectionTimes.usStocks = local.sectionTimes?.usStocks ?? local.fetchedAt;
  }

  let argStocks = api.argStocks;
  if (!argStocks.length && local.argStocks.length) {
    argStocks = local.argStocks;
    stale.argStocks = true;
    sectionTimes.argStocks = local.sectionTimes?.argStocks ?? local.fetchedAt;
  }

  const mergedTimes = { ...api.sectionTimes, ...sectionTimes };

  return {
    ...api,
    crypto,
    usStocks,
    argStocks,
    stale,
    sectionTimes: mergedTimes,
  };
}
