// Capture only the named review context; no secret environment files or values.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const previous = JSON.parse(await fs.readFile(path.join(directory, 'source-manifest-interim.json'), 'utf8'));
const final = process.argv.includes('--final');
const paths = [...new Set([...previous.sources.map(source => source.path),
  'scripts/test-isolated-offline-durability.mjs', 'app/login/page.tsx',
  'components/settings/LogoutButton.tsx', 'lib/hooks/useServiceWorker.ts', 'public/sw.js',
  'components/expenses/InlineQuickCreate.tsx',
  '__tests__/account-create-components.test.ts', '__tests__/inline-quick-create-owner-isolation.test.ts',
  '__tests__/financial-validation-http.test.ts', '__tests__/investment-retry-boundaries.test.ts',
  'app/api/accounts/route.ts', 'app/api/categories/route.ts', 'app/api/transactions/route.ts',
  'lib/transaction-idempotency.ts', 'supabase/migrations/20261009034852_durable_financial_requests_outbox.sql',
])].sort();
const sources = await Promise.all(paths.map(async filename => ({
  path: filename,
  sha256: createHash('sha256').update(await fs.readFile(filename)).digest('hex'),
})));
const git = args => execFileSync('git', args, {
  encoding: 'utf8', env: { ...process.env, DEVELOPER_DIR: '/Library/Developer/CommandLineTools' },
}).trim();
const report = {
  reviewedAt: new Date().toISOString(),
  baseRevision: previous.baseRevision,
  headRevision: git(['rev-parse', 'HEAD']),
  workingTreeClean: !git(['status', '--porcelain']),
  status: final ? 'FINAL_REVIEW_SOURCE_CAPTURE' : 'INTERIM_SOURCE_FREEZE_PENDING',
  sources,
  sourceManifestSha256: createHash('sha256').update(JSON.stringify(sources)).digest('hex'),
  sourceChangesSinceInterim: sources.filter(source => source.sha256 !== previous.sources.find(p => p.path === source.path)?.sha256)
    .map(source => ({ path: source.path, beforeSha256: previous.sources.find(p => p.path === source.path)?.sha256 ?? null, afterSha256: source.sha256 })),
  scope: 'Exact hashes of named independently inspected critical paths and focused dependencies. Source capture alone does not execute tests or prove whole-system acceptance. --final may be used only after root confirms source freeze; reports of earlier runs keep their own source hashes and scopes.',
};
const destination = path.join(directory, final ? 'source-manifest-final.json' : 'source-manifest-current.json');
await fs.writeFile(destination, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ report: path.relative(process.cwd(), destination), head: report.headRevision, sourceFiles: sources.length, manifest: report.sourceManifestSha256, status: report.status }));
