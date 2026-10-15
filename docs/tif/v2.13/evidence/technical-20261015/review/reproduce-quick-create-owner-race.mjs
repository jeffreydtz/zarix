// Synthetic callback/effect proof, no sockets, identities or financial writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../../../../../..');
const before = process.argv.includes('--before');
const output = process.argv.find(argument => argument.startsWith('--output='))?.slice('--output='.length);
const temporary = await fs.mkdtemp('/tmp/zarix-review-quick-create-');
await fs.symlink(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'));
await fs.copyFile(path.join(directory, 'quick-create-owner-race.test.ts.fixture'), path.join(temporary, 'quick-create-owner-race.test.ts'));
const alias = {};
if (before) {
  const copied = path.join(temporary, 'QuickCreateProvider.tsx');
  await fs.copyFile(path.join(directory, 'quick-create-provider-before.tsx.snapshot'), copied);
  alias['@/components/add-transaction/AddTransactionProvider'] = copied;
  const inline = path.join(temporary, 'InlineQuickCreate.tsx');
  await fs.copyFile(path.join(directory, 'quick-create-inline-before.tsx.snapshot'), inline);
  alias['@/components/expenses/InlineQuickCreate'] = inline;
}
alias['@'] = root;
const config = path.join(temporary, 'vitest.config.mjs');
await fs.writeFile(config, `export default ${JSON.stringify({ oxc: { jsx: { runtime: 'automatic' } }, resolve: { alias }, test: { environment: 'node', include: ['*.test.ts'], fileParallelism: false, maxWorkers: 1 } })};\n`);
const args = [path.join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--root', temporary, '--config', config];
if (output) args.push('--reporter=json', `--outputFile=${path.resolve(output)}`);
const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
