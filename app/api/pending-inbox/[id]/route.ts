import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, requireUser } from '@/lib/api-handler';
import { assertSameOrigin } from '@/lib/auth/origin';
import { confirmPendingItem, discardPendingItem } from '@/lib/services/pending-inbox';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const { user } = await requireUser();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const action = body.action === 'discard' ? 'discard' : 'confirm';
    if (action === 'discard') {
      await discardPendingItem({ userId: user.id, itemId: id, req });
      return new NextResponse(null, { status: 204 });
    }
    const item = await confirmPendingItem({
      userId: user.id,
      itemId: id,
      amount: typeof body.amount === 'number' ? body.amount : undefined,
      currency: typeof body.currency === 'string' ? body.currency : undefined,
      merchant: typeof body.merchant === 'string' ? body.merchant : undefined,
      accountId: typeof body.accountId === 'string' ? body.accountId : undefined,
      categoryId: typeof body.categoryId === 'string' ? body.categoryId : undefined,
      occurredAt: typeof body.occurredAt === 'string' ? body.occurredAt : undefined,
      req,
    });
    return NextResponse.json({ item });
  } catch (error) {
    return errorResponse(error);
  }
}
