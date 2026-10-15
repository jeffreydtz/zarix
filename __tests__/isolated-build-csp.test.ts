import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const filename = require.resolve('../next.config.js');
function load() { delete require.cache[filename]; return require(filename); }
async function csp() {
  const headers = await load().headers();
  return headers.find((entry: { source: string }) => entry.source === '/:path*').headers
    .find((entry: { key: string }) => entry.key === 'Content-Security-Policy').value as string;
}
afterEach(() => { vi.unstubAllEnvs(); delete require.cache[filename]; });
describe('isolated build CSP', () => {
  it('keeps the normal production policy independent of a local URL', async () => {
    vi.stubEnv('ZARIX_ISOLATED_TEST_BUILD', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:57321');
    expect(await csp()).not.toContain('127.0.0.1');
  });
  it('permits only the exact local HTTP and websocket origin when explicitly enabled', async () => {
    vi.stubEnv('ZARIX_ISOLATED_TEST_BUILD', '1');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:57321');
    const policy = await csp();
    expect(policy).toContain('http://127.0.0.1:57321 ws://127.0.0.1:57321');
    expect(policy).not.toContain('http://*');
  });
  it.each(['https://external.example:443', 'http://127.0.0.1:57321/extra',
    'http://private:secret@127.0.0.1:57321', 'http://localhost',
    'http://127.0.0.1:57321?token=secret', 'http://127.0.0.1:57321#fragment'])
    ('rejects non-origin or non-loopback configuration: %s', (url) => {
      vi.stubEnv('ZARIX_ISOLATED_TEST_BUILD', '1');
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', url);
      expect(load).toThrow();
    });
});
