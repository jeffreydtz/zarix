import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const FIXTURE_USER_A = '11111111-1111-4111-8111-111111111111';
const FIXTURE_USER_B = '22222222-2222-4222-8222-222222222222';
const OWNER_MAILBOXES = [`jef_dietz${'@'}hotmail.com`];
const SKIP_DIRS = new Set(['node_modules', '.git', 'docs', '.next', 'coverage']);

async function walk(dir: string, acc: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, acc);
    else if (/\.(ts|tsx|js|mjs|sql)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

describe('fixture-only identities', () => {
  it('never hardcodes the owner mailbox or a real user id in tests, seeds or scripts', async () => {
    const files = [
      ...(await walk(path.join(ROOT, '__tests__'))),
      ...(await walk(path.join(ROOT, 'scripts'))),
      path.join(ROOT, 'supabase/seed.sql'),
      path.join(ROOT, 'lib/telegram/test-bot.ts'),
    ];
    const hits: string[] = [];
    for (const file of files) {
      try {
        await stat(file);
      } catch {
        continue;
      }
      const text = await readFile(file, 'utf8');
      const relative = path.relative(ROOT, file);
      if (relative.endsWith('fixture-identities.test.ts')) continue;
      for (const mailbox of OWNER_MAILBOXES) {
        if (text.toLowerCase().includes(mailbox)) {
          hits.push(`${relative} contains owner mailbox`);
        }
      }
      if (/\b[a-z0-9._%+-]+@hotmail\.com\b/i.test(text)) {
        hits.push(`${relative} contains a hotmail address`);
      }
      if (text.includes('USER_ID_AQUI') || /user ID real/i.test(text)) {
        hits.push(`${relative} asks for a real user id`);
      }
    }
    expect(hits).toEqual([]);

    const seed = await readFile(path.join(ROOT, 'supabase/seed.sql'), 'utf8');
    expect(seed).toContain(FIXTURE_USER_A);
    expect(seed).toContain('test-a@zarix.invalid');
    expect(seed).not.toContain('USER_ID_AQUI');

    const fixtures = await readFile(path.join(ROOT, 'scripts/lib/test-isolated-database.mjs'), 'utf8');
    expect(fixtures).toContain(FIXTURE_USER_A);
    expect(fixtures).toContain(FIXTURE_USER_B);
    expect(fixtures).toContain('test-a@zarix.invalid');
    expect(fixtures).toContain('test-b@zarix.invalid');
  });
});
