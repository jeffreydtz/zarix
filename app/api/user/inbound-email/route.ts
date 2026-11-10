import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, requireUser } from '@/lib/api-handler';
import { assertSameOrigin } from '@/lib/auth/origin';
import {
  getInboundMailbox,
  issueInboundMailbox,
  revokeInboundMailbox,
} from '@/lib/services/inbound-mailbox';
import { recordIntegrationAudit } from '@/lib/integrations/audit';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { user } = await requireUser();
    const mailbox = await getInboundMailbox(user.id);
    return NextResponse.json({ mailbox });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const { user } = await requireUser();
    const issued = await issueInboundMailbox(user.id);
    await recordIntegrationAudit({
      userId: user.id,
      action: 'token.create',
      source: 'web',
      metadata: { prefix: issued.mailbox.tokenPrefix, scope: 'inbound-email' },
      outcome: 'ok',
    });
    return NextResponse.json(
      {
        token: issued.token,
        mailbox: issued.mailbox,
        warning: 'Reenviá mails de Mercado Pago o del banco a esa dirección. Nada se registra sin que lo confirmes.',
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const { user } = await requireUser();
    await revokeInboundMailbox(user.id);
    await recordIntegrationAudit({
      userId: user.id,
      action: 'token.revoke',
      source: 'web',
      metadata: { scope: 'inbound-email' },
      outcome: 'ok',
    });
    return NextResponse.json({ revoked: true });
  } catch (error) {
    return errorResponse(error);
  }
}
