import { NextResponse } from 'next/server';
import { createServiceClientSync } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Health check liviano: verifica conectividad con Supabase. Público a propósito
// (para monitores de uptime tipo UptimeRobot). No expone datos sensibles.
export async function GET() {
  const startedAt = Date.now();
  try {
    const supabase = createServiceClientSync();
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
