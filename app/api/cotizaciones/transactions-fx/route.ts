import { NextResponse } from 'next/server';
import { cotizacionesService } from '@/lib/services/cotizaciones';

/** Solo USD→ARS y EUR→ARS para previews de movimientos (sin crypto ni panel completo). */
export async function GET() {
  try {
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
