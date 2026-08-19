import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
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
    const supabase = await createClient();
    // Query mínima contra una tabla del sistema (categorías): confirma que la DB
    // responde sin leer datos de usuario.
    const { error } = await supabase
      .from('categories')
      .select('id', { count: 'exact', head: true })
      .eq('is_system', true);

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
