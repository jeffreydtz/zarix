import { NextRequest, NextResponse } from 'next/server';
import { cotizacionesService } from '@/lib/services/cotizaciones';

export async function GET(req: NextRequest) {
  try {
    const quotes = await cotizacionesService.getAllQuotes();
    return NextResponse.json(quotes);
  } catch (error) {
    console.error('Cotizaciones API error:', error);
    return NextResponse.json(
      { error: 'Error fetching quotes' },
      { status: 500 }
    );
  }
}
