import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  buildTelegramSummaryScheduleLines,
  getNextMonthlySendUtc,
  getNextWeeklySendUtc,
  formatSendInUserTimezone,
} from '@/lib/notification-schedule';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: row } = await supabase
      .from('users')
      .select(
        'weekly_summary_enabled, monthly_summary_enabled, timezone'
      )
      .eq('id', user.id)
      .single();

    if (!row) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const now = new Date();
    return NextResponse.json({
      weekly_summary_enabled: row.weekly_summary_enabled,
      monthly_summary_enabled: row.monthly_summary_enabled,
      next_weekly_at: row.weekly_summary_enabled
        ? getNextWeeklySendUtc(now).toISOString()
        : null,
      next_monthly_at: row.monthly_summary_enabled
        ? getNextMonthlySendUtc(now).toISOString()
        : null,
      next_weekly_label: row.weekly_summary_enabled
        ? formatSendInUserTimezone(getNextWeeklySendUtc(now), row.timezone)
        : null,
      next_monthly_label: row.monthly_summary_enabled
        ? formatSendInUserTimezone(getNextMonthlySendUtc(now), row.timezone)
        : null,
    });
  } catch (e) {
    console.error('notification-preferences GET:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const updates: Record<string, boolean> = {};

    if (typeof body.weekly_summary_enabled === 'boolean') {
      updates.weekly_summary_enabled = body.weekly_summary_enabled;
    }
    if (typeof body.monthly_summary_enabled === 'boolean') {
      updates.monthly_summary_enabled = body.monthly_summary_enabled;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
    }

    const { error } = await supabase.from('users').update(updates).eq('id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const { data: row } = await supabase
      .from('users')
      .select('weekly_summary_enabled, monthly_summary_enabled, timezone')
      .eq('id', user.id)
      .single();

    const now = new Date();
    const scheduleText = row
      ? buildTelegramSummaryScheduleLines(
          row.weekly_summary_enabled,
          row.monthly_summary_enabled,
          row.timezone,
          now
        )
      : '';

    return NextResponse.json({
      ok: true,
      weekly_summary_enabled: row?.weekly_summary_enabled,
      monthly_summary_enabled: row?.monthly_summary_enabled,
      scheduleText,
      next_weekly_label: row?.weekly_summary_enabled
        ? formatSendInUserTimezone(getNextWeeklySendUtc(now), row.timezone)
        : null,
      next_monthly_label: row?.monthly_summary_enabled
        ? formatSendInUserTimezone(getNextMonthlySendUtc(now), row.timezone)
        : null,
    });
  } catch (e) {
    console.error('notification-preferences POST:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
