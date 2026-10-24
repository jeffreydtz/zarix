import { NextResponse } from 'next/server';
import { errorResponse, requireUser } from '@/lib/api-handler';
import { listPendingItems } from '@/lib/services/pending-inbox';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { user } = await requireUser();
    const items = await listPendingItems(user.id, 'pending');
    return NextResponse.json({ items });
  } catch (error) {
    return errorResponse(error);
  }
}
