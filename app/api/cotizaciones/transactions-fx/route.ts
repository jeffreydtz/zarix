import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cotizacionesService } from '@/lib/services/cotizaciones';

export const dynamic = 'force-dynamic';

/** Solo USD→ARS y EUR→ARS para previews de movimientos (sin crypto ni panel completo). */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rates = await cotizacionesService.getTransactionsFxRates();
    return NextResponse.json(rates);
  } catch (error) {
    console.error('transactions-fx API error:', error);
    return NextResponse.json(
      { error: 'Error fetching FX rates' },
      { status: 500 }
    );
  }
}
