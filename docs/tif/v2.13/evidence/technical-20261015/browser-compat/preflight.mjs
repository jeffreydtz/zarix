// Metadata/configuration only: does not start any browser/driver or contact APP3000.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, '../../../../../..');
const software = JSON.parse(await fs.readFile(path.join(directory, 'official-software-metadata.json'), 'utf8'));
const probe = executable => spawnSync(executable, [], { encoding: 'utf8' });
const exists = async file => { try { await fs.access(file); return true; } catch { return false; } };
const plistVersion = async app => {
  const file = `${app}/Contents/Info.plist`;
  if (!await exists(file)) return null;
  const result = spawnSync('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', file], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
};
const sources = ['preflight.mjs', 'run-browser-read.mjs', 'official-software-metadata.json', 'mozilla-selected-checksums.txt', 'firefox-versions.json', 'edge-driver-head.txt'];
const report = {
  observedAt: new Date().toISOString(), status: 'PREFLIGHT_ONLY',
  revision: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8', env: { ...process.env, DEVELOPER_DIR: '/Library/Developer/CommandLineTools' } }).stdout.trim(),
  host: {
    system: 'macOS',
    version: spawnSync('/usr/bin/sw_vers', ['-productVersion'], { encoding: 'utf8' }).stdout.trim(),
    build: spawnSync('/usr/bin/sw_vers', ['-buildVersion'], { encoding: 'utf8' }).stdout.trim(),
    architecture: probe('/usr/bin/arch').stdout.trim(),
  },
  installed: {
    safari: { version: await plistVersion('/Applications/Safari.app'), officialDriverPresent: await exists('/usr/bin/safaridriver'), automation: 'Human authorization reported by parent; E2E owner alone manages activation/restore. No session started here.' },
    chrome: { version: await plistVersion('/Applications/Google Chrome.app'), scope: 'Owned by separate E2E/visual runner; not exercised here' },
    firefox: { version: await plistVersion('/Applications/Firefox.app'), status: 'BLOCKED', reason: 'Not installed; explicit authorization for official temporary download/use under Firefox Terms is pending' },
    edge: { version: await plistVersion('/Applications/Microsoft Edge.app'), status: 'BLOCKED', reason: 'Not installed; Edge terms treat download/use as acceptance; explicit authorization pending' },
  },
  plannedOfficialVersions: { firefox: software.firefox.version, edge: software.edge.version, geckodriver: software.geckodriver.version, edgeDriver: software.edgeDriver.version },
  downloadedBinaries: false, publisherSignaturesVerified: false, appRequests: 0, browserSessions: 0,
  cnf09: { status: 'BLOCKED', reason: 'No browser execution in preflight. Original critical matrix, four products and stable current/previous requirement must be evaluated per actual cell.' },
  sourceManifest: await Promise.all(sources.map(async file => ({ path: file, sha256: createHash('sha256').update(await fs.readFile(path.join(directory, file))).digest('hex') }))),
};
const output = path.resolve(process.env.ZARIX_BROWSER_PREFLIGHT_OUTPUT || path.join(directory, 'preflight.json'));
await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, output, installed: report.installed, plannedOfficialVersions: report.plannedOfficialVersions, appRequests: 0, browserSessions: 0 }, null, 2));
