import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, requireUser } from '@/lib/api-handler';
import { assertSameOrigin } from '@/lib/auth/origin';
import {
  createPersonalAccessToken,
  listPersonalAccessTokens,
} from '@/lib/services/personal-access-tokens';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { user } = await requireUser();
    const tokens = await listPersonalAccessTokens(user.id);
    return NextResponse.json({ tokens });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const { user } = await requireUser();
    const body = await req.json().catch(() => ({}));
    const result = await createPersonalAccessToken({
      userId: user.id,
      name: body.name,
      scopes: body.scopes,
      expiresAt: body.expiresAt ?? body.expires_at,
      req,
    });
    return NextResponse.json(
      { token: result.token, pat: result.pat, warning: 'Guardá este token ahora. No se vuelve a mostrar.' },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
