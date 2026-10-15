// Official CLI advisors, read-only and restricted to the new isolated E2E DB.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isolatedNativeTargets, safeNativeFailure } from './lib/test-isolated-native-target.mjs';
import { bootstrapSources } from './lib/test-isolated-database.mjs';

const { apiUrl, databaseUrl } = isolatedNativeTargets();
assert.equal(`${apiUrl.port}:${databaseUrl.port}`, '57321:57322');
const output = path.resolve(process.env.ZARIX_RECOMPUTE_OUTPUT || '/tmp/zarix-atomic-account-recompute-native');
const privateOutput = path.resolve(process.env.ZARIX_RECOMPUTE_PRIVATE_OUTPUT || '/tmp/zarix-atomic-account-recompute-private');
await fs.mkdir(output, { recursive: true });
await fs.mkdir(privateOutput, { recursive: true, mode: 0o700 });
await fs.chmod(privateOutput, 0o700);
const cli = process.env.ZARIX_SUPABASE_CLI || 'supabase';
const cliDatabaseUrl = new URL(databaseUrl);
cliDatabaseUrl.searchParams.set('sslmode', 'disable'); // Guarded loopback native stack has no TLS listener.
const command = ['db', 'advisors', '--db-url', cliDatabaseUrl.href, '--type', 'all', '--level', 'info', '--fail-on', 'none', '--output', 'json'];
const report = { startedAt: new Date().toISOString(), scope: 'Read-only official CLI security/performance advisors for E2E localhost:57322. Existing schema findings are reported separately from the new repair RPC.', command: 'supabase db advisors --db-url "$GUARDED_LOOPBACK_URL_WITH_SSLMODE_DISABLE" --type all --level info --fail-on none --output json', status: 'RUNNING' };
try {
  const result = spawnSync(cli, command, { env: process.env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  await fs.writeFile(path.join(privateOutput, 'advisors.stdout'), result.stdout || '', { mode: 0o600 });
  await fs.writeFile(path.join(privateOutput, 'advisors.stderr'), result.stderr || '', { mode: 0o600 });
  if (result.status !== 0) throw new Error('Local CLI advisors unavailable; private raw diagnostics preserved');
  const parsed = JSON.parse(result.stdout);
  const findings = Array.isArray(parsed) ? parsed : parsed.lints || parsed.advisors || parsed.results;
  assert.ok(Array.isArray(findings), 'Unexpected CLI advisors output shape');
  const token = value => typeof value === 'string' && /^[A-Za-z0-9_]+$/.test(value) ? value : null;
  // Only catalog identifiers and levels are published. Descriptions/detail/query
  // text are omitted because they may embed row values or credentials.
  report.findings = findings.map(finding => ({ name: token(finding.name), level: token(finding.level), schema: token(finding.metadata?.schema), entity: token(finding.metadata?.name) }));
  report.counts = report.findings.reduce((counts, finding) => ({ ...counts, [finding.level || 'unknown']: (counts[finding.level || 'unknown'] || 0) + 1 }), {});
  report.newRpcFindings = report.findings.filter(finding => finding.schema === 'public' && finding.entity === 'recompute_account_balance');
  report.scriptSha256 = createHash('sha256').update(await fs.readFile(new URL(import.meta.url))).digest('hex');
  report.sourceManifest = (await bootstrapSources()).map(({ path, sha256 }) => ({ path, sha256 }));
  report.status = report.newRpcFindings.length === 0 ? 'PASS' : 'FAIL';
  if (report.status === 'FAIL') process.exitCode = 1;
} catch (error) {
  report.status = 'BLOCKED'; report.failure = safeNativeFailure(error, 'local official CLI advisors'); process.exitCode = 1;
}
report.finishedAt = new Date().toISOString();
await fs.writeFile(path.join(output, 'account-recompute-advisors.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, counts: report.counts || null, newRpcFindings: report.newRpcFindings?.length ?? null, report: path.join(output, 'account-recompute-advisors.json') }));
