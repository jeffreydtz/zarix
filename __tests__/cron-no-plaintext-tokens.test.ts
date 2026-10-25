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
});
