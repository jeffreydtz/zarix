import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

// Run after a successful fresh build; stdout contains metadata and path names only.
const buildRoot = resolve(process.argv[2] || '.next');
const affected = /(?:^|\/)node_modules\/(?:braces|micromatch|fast-glob|chokidar|tailwindcss|eslint-config-next|@next\/eslint-plugin-next)(?:\/|$)/;
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.name.endsWith('.nft.json')) files.push(path);
  }
}
await walk(buildRoot);
if (!files.length) throw new Error('No build traces found; run npm run build first');
const traces = [];
const matches = [];
for (const path of files.sort()) {
  const source = await readFile(path);
  const trace = JSON.parse(source.toString('utf8'));
  const found = trace.files.filter(file => affected.test(file));
  traces.push({ path: path.slice(buildRoot.length + 1), sha256: createHash('sha256').update(source).digest('hex'), fileCount: trace.files.length });
  if (found.length) matches.push({ trace: path.slice(buildRoot.length + 1), paths: found });
}
let buildId = null;
try { buildId = (await readFile(join(buildRoot, 'BUILD_ID'), 'utf8')).trim(); } catch { /* recorded below */ }
console.log(JSON.stringify({ inspectedAt: new Date().toISOString(), buildId, traceCount: traces.length, affectedMatches: matches, traces, scope: 'Static Next build trace inspection; does not prove absence of dynamic or vendored code or an exploit path.' }, null, 2));
