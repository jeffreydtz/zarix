import { NextResponse } from 'next/server';
import { buildOpenApiDocument } from '@/lib/api/v1/openapi';
import { canonicalAppOrigin } from '@/lib/http/body-limit';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(buildOpenApiDocument(canonicalAppOrigin()), {
    headers: {
      'cache-control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
