import { NextResponse } from 'next/server';
import { ApiError, withAuth } from '@/lib/api-handler';
import { selectMovementAccounts } from '@/lib/plans/service';

export const PUT = withAuth(async ({ user }, request) => {
  let body: unknown;
  try { body = await request.json(); } catch { throw new ApiError('El cuerpo debe ser JSON válido.'); }
  const ids = body && typeof body === 'object' && 'accountIds' in body ? body.accountIds : null;
  if (!Array.isArray(ids) || ids.length > 20 || ids.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    throw new ApiError('Elegí hasta 20 cuentas válidas.');
  }
  await selectMovementAccounts(user.id, ids);
  return NextResponse.json({ ok: true });
});
