import type { InvestmentType } from '@/types/database';
import { CRYPTO_LOGO_TICKERS } from '@/lib/investments/display';
import { stripBymaSuffix } from '@/lib/market-data/quote-currency';

const TICKER_RE = /^[A-Z0-9.]{1,16}$/;

/** Well-known issuer / company domains for BYMA names without a US listing. */
const ISSUER_DOMAIN: Record<string, string> = {
  YPF: 'ypf.com',
  YPFD: 'ypf.com',
  GGAL: 'galaricia.com',
  PAMP: 'pampaenergia.com',
  TXAR: 'ternium.com',
  BMA: 'macro.com.ar',
  BBAR: 'bbva.com.ar',
  CEPU: 'centralpuerto.com',
  LOMA: 'loma.com',
  ALUA: 'aluar.com.ar',
  CRES: 'cresud.com.ar',
  IRSA: 'irsa.com.ar',
  TECO2: 'teco.com.ar',
  SUPV: 'supervielle.com.ar',
  BYMA: 'byma.com.ar',
  AL30: 'argentina.gob.ar',
  AL35: 'argentina.gob.ar',
  GD30: 'argentina.gob.ar',
  GD35: 'argentina.gob.ar',
  AE38: 'argentina.gob.ar',
  AL29: 'argentina.gob.ar',
};

function foldTicker(ticker: string): string {
  return stripBymaSuffix(ticker).replace(/[^A-Z0-9.]/g, '');
}

function underlyingForLogo(type: InvestmentType, ticker: string): string {
  const t = foldTicker(ticker);
  if (type === 'cedear' && /[DC]$/.test(t) && t.length > 3) return t.slice(0, -1);
  return t;
}

export function isSafeLogoTicker(ticker: string): boolean {
  return TICKER_RE.test(foldTicker(ticker));
}

/**
 * Free, unauthenticated logo URLs. First match that returns an image wins.
 * Proxied by /api/investments/logo so the page CSP stays img-src 'self'.
 */
export function logoCandidateUrls(type: InvestmentType, ticker: string): string[] {
  const raw = foldTicker(ticker);
  if (!raw || !TICKER_RE.test(raw)) return [];
  const urls: string[] = [];
  if (type === 'crypto') {
    if (!CRYPTO_LOGO_TICKERS.has(raw)) return urls;
    const coin = raw.toLowerCase();
    urls.push(`https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/${coin}.svg`);
    urls.push(`https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/32/color/${coin}.png`);
    return urls;
  }
  const underlying = underlyingForLogo(type, raw);
  if (type === 'stock_us' || type === 'etf' || type === 'cedear') {
    urls.push(`https://assets.parqet.com/logos/symbol/${underlying}`);
  }
  if (type === 'stock_arg') {
    urls.push(`https://assets.parqet.com/logos/symbol/${raw}.BA`);
    const domain = ISSUER_DOMAIN[raw] || ISSUER_DOMAIN[underlying];
    if (domain) urls.push(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`);
  }
  if (type === 'bond' || type === 'on') {
    const root = raw.replace(/[CDO]$/, '');
    const domain = ISSUER_DOMAIN[raw] || ISSUER_DOMAIN[root];
    if (domain) urls.push(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`);
  }
  if (type === 'fci') {
    urls.push(`https://www.google.com/s2/favicons?domain=cafci.org.ar&sz=128`);
  }
  return urls;
}

export function initialsForAsset(name: string, ticker: string | null): string {
  const fromTicker = (ticker || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase();
  if (fromTicker) return fromTicker;
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
  return (name.trim().slice(0, 2) || '?').toUpperCase();
}
