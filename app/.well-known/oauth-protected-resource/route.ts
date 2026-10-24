import { NextRequest, NextResponse } from 'next/server';
import { generateProtectedResourceMetadata, metadataCorsOptionsRequestHandler } from 'mcp-handler';
import { mcpOAuthEnabled, mcpOAuthIssuer } from '@/lib/auth/mcp-oauth';

export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return metadataCorsOptionsRequestHandler()();
}

export function GET(req: NextRequest) {
  if (!mcpOAuthEnabled()) {
    return NextResponse.json({ error: 'OAuth de MCP está desactivado.' }, { status: 404 });
  }
  const issuer = mcpOAuthIssuer();
  if (!issuer) {
    return NextResponse.json({ error: 'Falta ZARIX_OAUTH_ISSUER.' }, { status: 503 });
  }
  const resource = new URL('/api/mcp', req.nextUrl.origin).href;
  return NextResponse.json(
    generateProtectedResourceMetadata({
      authServerUrls: [issuer],
      resourceUrl: resource,
    })
  );
}
