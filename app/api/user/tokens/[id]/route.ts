import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, requireUser } from '@/lib/api-handler';
import { assertSameOrigin } from '@/lib/auth/origin';
import { revokePersonalAccessToken, updatePersonalAccessToken } from '@/lib/services/personal-access-tokens';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const { user } = await requireUser();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const pat = await updatePersonalAccessToken({
      userId: user.id,
      tokenId: id,
      expiresAt: body.expiresAt ?? body.expires_at,
      name: body.name,
      req,
    });
    return NextResponse.json({ pat });
  } catch (error) {
    return errorResponse(error);
  }
}

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
