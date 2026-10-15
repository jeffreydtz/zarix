import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
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
