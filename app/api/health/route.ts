import { NextRequest, NextResponse } from 'next/server';
import { createBareServiceClient, createServiceClient } from '@/lib/supabase/server';
import { clientIpFromRequest, rateLimitAllow } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Health check liviano: verifica conectividad con Supabase. Público a propósito
// (para monitores de uptime tipo UptimeRobot). No expone datos sensibles.
export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  if (!rateLimitAllow(`health:${clientIpFromRequest(req)}`, 30, 60 * 1000)) {
    return NextResponse.json({ status: 'busy' }, { status: 429 });
  }
  try {
    const supabase = await createServiceClient();
    // Backend-only minimal read; anonymous table grants intentionally stay closed.
    // HEAD can lose an upstream error body/status in an API gateway, so it
    // must not be the sole evidence that this table is actually queryable.
    const { error } = await supabase
      .from('categories')
      .select('id')
      .eq('is_system', true)
      .limit(1);

    if (error) {
      return NextResponse.json(
        { status: 'degraded', db: 'error', latencyMs: Date.now() - startedAt },
        { status: 503 }
      );
    }

    const bare = createBareServiceClient();
    const rateLimit = await bare.rpc('rate_limit_hit', {
      p_key: 'health:probe',
      p_max: 1_000_000,
      p_window_ms: 60_000,
    });
    if (rateLimit.error) {
      const msg = rateLimit.error.message || '';
      const code = 'code' in rateLimit.error ? String(rateLimit.error.code || '') : '';
      const missing =
        /PGRST202|42883/.test(code) ||
        /does not exist|Could not find the function/i.test(msg);
      const denied = /42501/.test(code) || /permission denied/i.test(msg);
      if (missing) {
        console.error(
          '[health] rate_limit_hit missing_rpc; apply_migration 20261024200000 before deploying this build'
        );
      } else if (denied) {
        console.error('[health] rate_limit_hit permission-denied');
      } else {
        console.error('[health] rate_limit_hit error');
      }
      return NextResponse.json(
        {
          status: 'degraded',
          db: 'ok',
          rateLimit: missing ? 'missing_rpc' : 'error',
          latencyMs: Date.now() - startedAt,
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      status: 'ok',
      db: 'ok',
      latencyMs: Date.now() - startedAt,
    });
  } catch {
    return NextResponse.json(
      { status: 'down', latencyMs: Date.now() - startedAt },
      { status: 503 }
    );
  }
}
