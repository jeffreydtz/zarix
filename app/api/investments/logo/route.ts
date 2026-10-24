import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { InvestmentType } from '@/types/database';
import { INVESTMENT_TYPES } from '@/lib/investments/type-meta';
import { isSafeLogoTicker, logoCandidateUrls } from '@/lib/investments/asset-logo';

export const dynamic = 'force-dynamic';

const FETCH_MS = 4000;
const cache = new Map<string, { ts: number; body: ArrayBuffer; contentType: string }>();
const CACHE_MS = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const type = req.nextUrl.searchParams.get('type') as InvestmentType | null;
  const ticker = (req.nextUrl.searchParams.get('ticker') || '').trim().toUpperCase();
  if (!type || !INVESTMENT_TYPES.includes(type) || !isSafeLogoTicker(ticker)) {
    return new NextResponse(null, { status: 404 });
  }

  const cacheKey = `${type}:${ticker}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_MS) {
    return new NextResponse(cached.body, {
      status: 200,
      headers: {
        'Content-Type': cached.contentType,
        'Cache-Control': 'private, max-age=86400',
      },
    });
  }

  for (const url of logoCandidateUrls(type, ticker)) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_MS),
        headers: { Accept: 'image/*,*/*' },
      });
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') || 'image/png';
      if (!contentType.startsWith('image/') && !contentType.includes('svg')) continue;
      const body = await res.arrayBuffer();
      if (body.byteLength < 32 || body.byteLength > 500_000) continue;
      cache.set(cacheKey, { ts: Date.now(), body, contentType });
      return new NextResponse(body, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'private, max-age=86400',
        },
      });
    } catch {
      continue;
    }
  }

  return new NextResponse(null, { status: 404 });
}
