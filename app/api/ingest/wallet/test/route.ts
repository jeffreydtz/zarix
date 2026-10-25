import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, requireUser } from '@/lib/api-handler';
import { assertSameOrigin } from '@/lib/auth/origin';
import { ingestWalletItem, sampleWalletPayload } from '@/lib/services/pending-inbox';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const { user } = await requireUser();
    const result = await ingestWalletItem({
      userId: user.id,
      json: sampleWalletPayload(),
      idempotencyKey: `test:${Date.now()}`,
      req,
    });
    return NextResponse.json({
      item: {
        id: result.item.id,
        amount: result.item.amount,
        merchant: result.item.merchant,
        status: result.item.status,
      },
      autoConfirmed: result.autoConfirmed,
      duplicate: result.duplicate,
      note: 'Dato de ejemplo. No es un gasto real.',
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
