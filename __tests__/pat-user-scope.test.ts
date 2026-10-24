import { describe, expect, it } from 'vitest';
import { decodeJwtPayload, mintUserAccessToken } from '@/lib/auth/user-jwt';
import { isServiceScopedTable } from '@/lib/supabase/request-scope';

const FIXTURE_A = '11111111-1111-4111-8111-111111111111';
const FIXTURE_B = '22222222-2222-4222-8222-222222222222';

describe('PAT user-scoped JWT', () => {
  it('mints a short-lived authenticated token for a fixture user', () => {
    const previous = process.env.SUPABASE_JWT_SECRET;
    process.env.SUPABASE_JWT_SECRET = 'synthetic-jwt-secret-for-tests-only';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid';
    const token = mintUserAccessToken(FIXTURE_A, 90);
    expect(token).toBeTruthy();
    const payload = decodeJwtPayload(token!);
    expect(payload?.sub).toBe(FIXTURE_A);
    expect(payload?.role).toBe('authenticated');
    expect(payload?.aud).toBe('authenticated');
    expect(payload?.sub).not.toBe(FIXTURE_B);
    expect(JSON.stringify(payload)).not.toMatch(/hotmail/i);
    if (previous === undefined) delete process.env.SUPABASE_JWT_SECRET;
    else process.env.SUPABASE_JWT_SECRET = previous;
  });

  it('does not mint without a JWT secret', () => {
    const previous = process.env.SUPABASE_JWT_SECRET;
    delete process.env.SUPABASE_JWT_SECRET;
    expect(mintUserAccessToken(FIXTURE_A)).toBeNull();
    if (previous !== undefined) process.env.SUPABASE_JWT_SECRET = previous;
  });

  it('keeps privileged tables on the service role', () => {
    expect(isServiceScopedTable('personal_access_tokens')).toBe(true);
    expect(isServiceScopedTable('integration_audit_log')).toBe(true);
    expect(isServiceScopedTable('transactions')).toBe(false);
    expect(isServiceScopedTable('accounts')).toBe(false);
    expect(isServiceScopedTable('pending_inbox_items')).toBe(false);
  });
});
