import { NextRequest, NextResponse } from 'next/server';
import { buildOpenApiDocument } from '@/lib/api/v1/openapi';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || 'https://zarix-phi.vercel.app';
  return NextResponse.json(buildOpenApiDocument(origin), {
    headers: { 'cache-control': 'public, max-age=60' },
  });
}
