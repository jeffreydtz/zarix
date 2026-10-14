// Synthetic independent race/health proof. No HTTP provider or database access.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const artifact = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(artifact, '../../../../../..');
const before = process.argv.includes('--before');
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice('--output='.length);
const temp = await fs.mkdtemp('/tmp/zarix-review-focals-');
await fs.symlink(path.join(root, 'node_modules'), path.join(temp, 'node_modules'));
await fs.copyFile(path.join(artifact, 'independent-race-health.test.ts.fixture'), path.join(temp, 'independent-race-health.test.ts'));
const alias = {};
if (before) {
  for (const [name, file] of [
    ['@/lib/offline-transaction-store', 'offline-store-before.ts.snapshot'],
    ['@/lib/offline-queue-sync', 'offline-sync-before.ts.snapshot'],
    ['@/app/api/health/route', 'health-before.ts.snapshot'],
  ]) {
    const copied = path.join(temp, file.replace(/\.(snapshot)$/, ''));
    await fs.copyFile(path.join(artifact, file), copied);
    alias[name] = copied;
  }
}
alias['@'] = root;
const config = path.join(temp, 'vitest.config.mjs');
await fs.writeFile(config, `export default ${JSON.stringify({ resolve: { alias }, test: { environment: 'node', include: ['*.test.ts'], fileParallelism: false, maxWorkers: 1 } })};\n`);
const args = [path.join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--root', temp, '--config', config];
if (output) args.push('--reporter=json', `--outputFile=${path.resolve(output)}`);
const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
