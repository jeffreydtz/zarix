import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import { createClient } from '@/lib/supabase/server';
import type { InvestmentType } from '@/types/database';
import { loadArgentineQuotes } from '@/lib/market-data/data912-client';
import { catalogLookup, searchCatalog, type CatalogEntry } from '@/lib/market-data/argentine-catalog';

export const dynamic = 'force-dynamic';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const TICKER_TYPES: InvestmentType[] = [
  'stock_arg',
  'cedear',
  'stock_us',
  'etf',
  'crypto',
  'bond',
];

interface SearchHit {
  symbol: string;
  name: string;
  exchange?: string;
}

function dedupeBySymbol(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const h of hits) {
    const key = h.symbol.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

function mapQuotesForType(quotes: unknown[], investmentType: InvestmentType): SearchHit[] {
  const out: SearchHit[] = [];

  for (const raw of quotes) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const symbol = typeof row.symbol === 'string' ? row.symbol.trim() : '';
    if (!symbol) continue;

    const qt = typeof row.quoteType === 'string' ? row.quoteType : '';
    const name =
      (typeof row.shortname === 'string' && row.shortname) ||
      (typeof row.longname === 'string' && row.longname) ||
      symbol;
    const exchange = typeof row.exchange === 'string' ? row.exchange : undefined;

    if (investmentType === 'crypto') {
      if (qt === 'CRYPTOCURRENCY' || symbol.toUpperCase().endsWith('-USD')) {
        const base = symbol.toUpperCase().endsWith('-USD')
          ? symbol.slice(0, -4).toUpperCase()
          : symbol.toUpperCase();
        out.push({ symbol: base, name: String(name), exchange });
      }
      continue;
    }

    if (investmentType === 'stock_arg' || investmentType === 'cedear' || investmentType === 'bond') {
      if (symbol.toUpperCase().endsWith('.BA') && (qt === 'EQUITY' || qt === 'ETF')) {
        const base = symbol.replace(/\.BA$/i, '').toUpperCase();
        out.push({ symbol: base, name: String(name), exchange });
      }
      continue;
    }

    if (investmentType === 'etf') {
      if (qt === 'ETF' && !symbol.toUpperCase().endsWith('.BA')) {
        out.push({ symbol: symbol.toUpperCase(), name: String(name), exchange });
      }
      continue;
    }

    if (investmentType === 'stock_us') {
      if (qt === 'EQUITY' && !symbol.toUpperCase().endsWith('.BA')) {
        out.push({ symbol: symbol.toUpperCase(), name: String(name), exchange });
      }
    }
  }

  return dedupeBySymbol(out);
}

function catalogTypeFor(t: InvestmentType): CatalogEntry['type'] | null {
  if (t === 'stock_arg' || t === 'cedear' || t === 'bond') return t;
  return null;
}

async function searchArgentineUniverse(
  type: 'stock_arg' | 'cedear' | 'bond',
  query: string
): Promise<SearchHit[]> {
  const upper = query.trim().toUpperCase();
  const hits: SearchHit[] = [];

  // 1) Catálogo curado (instantáneo, sin red).
  for (const entry of searchCatalog(type, upper, 20)) {
    hits.push({ symbol: entry.symbol, name: entry.name });
  }

  // 2) data912: si está cargado, agrega símbolos que matchean prefix aunque no estén en catálogo.
  try {
    const universe = await loadArgentineQuotes();
    const source =
      type === 'stock_arg'
        ? universe.byStock
        : type === 'cedear'
          ? universe.byCedear
          : universe.byBond;

    for (const [symbol] of source) {
      if (!upper || symbol.startsWith(upper) || symbol.includes(upper)) {
        const fromCatalog = catalogLookup(type, symbol);
        hits.push({
          symbol,
          name: fromCatalog?.name || symbol,
          exchange: 'BYMA',
        });
      }
      if (hits.length >= 40) break;
    }
  } catch {
    /* data912 caído — el catálogo ya cubrió */
  }

  return dedupeBySymbol(hits).slice(0, 20);
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const q = req.nextUrl.searchParams.get('q')?.trim() || '';
    const type = req.nextUrl.searchParams.get('type') as InvestmentType | null;

    if (!type || !TICKER_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
    }

    if (q.length < 1) {
      if (type === 'stock_arg' || type === 'cedear' || type === 'bond') {
        const seeded = searchCatalog(type, '', 12).map((e) => ({ symbol: e.symbol, name: e.name }));
        return NextResponse.json({ results: seeded });
      }
      return NextResponse.json({ results: [] as SearchHit[] });
    }

    const catType = catalogTypeFor(type);
    if (catType) {
      const argHits = await searchArgentineUniverse(catType, q);

      // Yahoo backup en paralelo para no perder coverage.
      let yahooHits: SearchHit[] = [];
      try {
        const result = await yahooFinance.search(q, {
          quotesCount: 16,
          newsCount: 0,
          region: 'AR',
          lang: 'es-AR',
        });
        const quotes = Array.isArray(result.quotes) ? result.quotes : [];
        yahooHits = mapQuotesForType(quotes, type);
      } catch {
        /* Yahoo abajo: usamos lo que ya tenemos */
      }

      const merged = dedupeBySymbol([...argHits, ...yahooHits]).slice(0, 20);
      return NextResponse.json({ results: merged });
    }

    // Resto: Yahoo como antes.
    const region = 'US';
    const result = await yahooFinance.search(q, {
      quotesCount: 16,
      newsCount: 0,
      region,
      lang: 'es-AR',
    });

    const quotes = Array.isArray(result.quotes) ? result.quotes : [];
    const results = mapQuotesForType(quotes, type);

    return NextResponse.json({ results });
  } catch (error: unknown) {
    console.error('ticker-search error:', error);
    const message = error instanceof Error ? error.message : 'Error en búsqueda';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
