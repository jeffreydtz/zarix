import { NextResponse } from 'next/server';
import { errorResponse, requireUser } from '@/lib/api-handler';
import { createServiceClientSync } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { user } = await requireUser();
    const supabase = createServiceClientSync();
    const { data, error } = await supabase
      .from('integration_audit_log')
      .select('id, action, source, ip_hash, user_agent, metadata, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return NextResponse.json({ events: data ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}
