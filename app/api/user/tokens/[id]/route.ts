import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, requireUser } from '@/lib/api-handler';
import { assertSameOrigin } from '@/lib/auth/origin';
import { revokePersonalAccessToken } from '@/lib/services/personal-access-tokens';

export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const { user } = await requireUser();
    const { id } = await params;
    await revokePersonalAccessToken({ userId: user.id, tokenId: id, req });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
