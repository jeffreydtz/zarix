import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cotizacionesService } from '@/lib/services/cotizaciones';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
