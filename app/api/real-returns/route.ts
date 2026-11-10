import { NextResponse } from 'next/server';
import { errorResponse, requireUser } from '@/lib/api-handler';
import { getRealReturnsReport } from '@/lib/services/real-returns';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { user } = await requireUser();
    const report = await getRealReturnsReport(user.id);
    return NextResponse.json(report);
  } catch (error) {
    return errorResponse(error);
  }
}
