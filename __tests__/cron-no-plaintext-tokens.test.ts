import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CRONS = [
  'app/api/cron/weekly-summary/route.ts',
  'app/api/cron/monthly-summary/route.ts',
  'app/api/cron/maturity-alerts/route.ts',
];

describe('crons do not read plaintext token columns', () => {
  it.each(CRONS)('%s selects no telegram_bot_token', (file) => {
    const src = readFileSync(file, 'utf8');
    expect(src).not.toMatch(/telegram_bot_token/);
  });

  it('user-secrets.ts never selects plaintext secret columns', () => {
    const src = readFileSync('lib/secrets/user-secrets.ts', 'utf8');
    expect(src).toMatch(/const encCol = `\$\{column\}_enc`;/);
    expect(src).toMatch(/select\(encCol\)/);
    expect(src).not.toMatch(/select\([^)]*gemini_api_key[^_]/);
    expect(src).not.toMatch(/select\([^)]*telegram_bot_token[^_]/);
  });
});
