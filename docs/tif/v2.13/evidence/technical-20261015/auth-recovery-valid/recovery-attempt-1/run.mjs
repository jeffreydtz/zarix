// SOURCE_ONLY until actual Native READY plus explicit root release.
// No provisioning or process mutation is performed by this runner.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import { isolatedPgEnvironment } from '../../../../../../scripts/lib/test-isolated-native-target.mjs';
import { validPasswordRecovery } from './contract.mjs';
import { recoveryTokenFromDeliveredMime } from './smtp-message.mjs';

const runtime = '/tmp/zarix-runtime-20261015';
const privateRoot = path.join(runtime, 'empty-account-private');
const smtpRoot = path.join(runtime, 'auth-reset-private');
const repo = fileURLToPath(new URL('../../../../../../', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const lit = value => `'${String(value).replaceAll("'", "''")}'`;
const ident = value => '"' + String(value).replaceAll('"', '""') + '"';
let output;
let report;
let before;
let protectedSnapshot;
let sources;
try {
  assert.equal(process.env.ZARIX_VALID_RECOVERY_WINDOW, 'parent-released-after-native-ready');
  assert.equal(process.env.ZARIX_ISOLATED_DATABASE_CONFIRM, 'synthetic-only');
  assert.ok(process.env.ZARIX_VALID_RECOVERY_PREFLIGHT_ONLY === undefined || process.env.ZARIX_VALID_RECOVERY_PREFLIGHT_ONLY === 'no-auth-no-password');
  process.umask(0o077);
  output = path.join(runtime, 'auth-valid-recovery-' + randomUUID()); await fs.mkdir(output, { mode: 0o700 });
  const runtimeReal = await fs.realpath(runtime);
  async function bytes(file) {
    assert.ok(path.resolve(file).startsWith(runtime + '/'));
    const info = await fs.lstat(file);
    assert.ok(info.isFile() && !info.isSymbolicLink() && !(info.mode & 0o077));
    assert.ok((await fs.realpath(file)).startsWith(runtimeReal + '/'));
    return fs.readFile(file);
  }
  const targetsFile = path.join(privateRoot, 'targets.json'), targetsBytes = await bytes(targetsFile), targets = JSON.parse(targetsBytes);
  assert.equal(targets.purpose, 'empty-account-http-replica'); assert.equal(targets.ready, true); assert.equal(targets.status, 'READY');
  assert.equal(targets.apiOrigin, 'http://127.0.0.1:60321');
  assert.equal(targets.authUpstream, 'http://127.0.0.1:60327');
  assert.equal(targets.originalAuthUpstream, 'http://127.0.0.1:55321');
  assert.equal(targets.authIsolation, 'separate-cache-binary-on-new-database');
  process.kill(targets.authPid, 0); process.kill(targets.smtpPid, 0);
  const authConfigBytes = await bytes(targets.authConfigFile), authConfig = JSON.parse(authConfigBytes);
  assert.equal(hash(authConfigBytes), targets.authConfigSha256);
  const authDsn = new URL(authConfig.GOTRUE_DB_DATABASE_URL);
  assert.equal(authDsn.hostname, '127.0.0.1'); assert.equal(authDsn.port, '55322'); assert.equal(authDsn.pathname.slice(1), targets.newDatabaseName); assert.deepEqual([...authDsn.searchParams], [['sslmode', 'disable']]); assert.equal(authDsn.hash, '');
  assert.equal(String(authConfig.GOTRUE_API_HOST), '127.0.0.1'); assert.equal(String(authConfig.GOTRUE_API_PORT), '60327');
  assert.equal(authConfig.API_EXTERNAL_URL, targets.apiOrigin + '/auth/v1'); assert.equal(authConfig.GOTRUE_SITE_URL, 'http://127.0.0.1:3004');
  assert.equal(authConfig.GOTRUE_SMTP_HOST, '127.0.0.1'); assert.equal(String(authConfig.GOTRUE_SMTP_PORT), '60325');
  const authBinaryBytes = await fs.readFile(targets.authBinary); assert.equal(hash(authBinaryBytes), targets.authBinarySha256);
  assert.equal(hash(authBinaryBytes), '2814745719ac5830d28152874dfe23d2bd703c1c985569115d9568d6b9345115');
  assert.ok(authBinaryBytes.toString().includes('exec "$SLIM_RUNTIME_DIR/.auth-wrapped" "$@"'));
  const authExecutable = path.join(path.dirname(targets.authBinary), '.auth-wrapped');
  const authExecutableSha256 = '04606de0bd299c575f2459daa8768e2529c95334ef1af878d21bb93e358bebba';
  assert.equal(hash(await fs.readFile(authExecutable)), authExecutableSha256);
  const authRuntimeProfile = path.join(path.dirname(targets.authBinary), '.runtime-env.sh'), authRuntimeProfileBytes = await fs.readFile(authRuntimeProfile);
  const gatewayConfigBytes = await bytes(targets.gatewayConfigFile), gatewayConfig = JSON.parse(gatewayConfigBytes);
  assert.equal(hash(gatewayConfigBytes), targets.gatewayConfigSha256);
  assert.equal(gatewayConfig.origin, targets.apiOrigin); assert.equal(gatewayConfig.authUpstream, targets.authUpstream); assert.equal(gatewayConfig.restUpstream, targets.restOrigin); assert.equal(gatewayConfig.databaseName, targets.newDatabaseName);
  const readinessBytes = await bytes(targets.authReadinessFile), readiness = JSON.parse(readinessBytes);
  assert.equal(hash(readinessBytes), targets.authReadinessSha256); assert.ok(/^PASS/.test(readiness.status)); assert.equal(readiness.nextPid, targets.nextPid); assert.equal(readiness.buildId, targets.buildId);
  const configBytes = await bytes(targets.smtpConfigFile), smtpConfig = JSON.parse(configBytes);
  assert.equal(hash(configBytes), targets.smtpConfigSha256);
  assert.equal(path.dirname(targets.smtpConfigFile), smtpRoot);
  assert.equal(smtpConfig.purpose, 'zarix-local-auth-reset-smtp'); assert.equal(smtpConfig.host, '127.0.0.1'); assert.equal(smtpConfig.port, 60325);
  assert.equal(smtpConfig.outputDirectory, targets.smtpOutputDirectory);
  assert.equal(path.dirname(smtpConfig.outputDirectory), smtpRoot); assert.match(path.basename(smtpConfig.outputDirectory), /^smtp-attempt-[a-z0-9-]+$/);
  const outputInfo = await fs.lstat(smtpConfig.outputDirectory); assert.ok(outputInfo.isDirectory() && !outputInfo.isSymbolicLink() && !(outputInfo.mode & 0o077));
  const sinkSource = path.join(repo, 'docs/tif/v2.13/evidence/technical-20261015/auth-reset-contract/smtp-sink.mjs');
  const sinkSha256 = hash(await fs.readFile(sinkSource)); assert.equal(sinkSha256, targets.smtpScriptSha256);
  const stateFile = path.join(smtpConfig.outputDirectory, 'state.private.json');
  const state = () => bytes(stateFile).then(raw => JSON.parse(raw));
  const smtpIdentity = value => ({ purpose: value.purpose, host: value.host, port: value.port, pid: value.pid, startedAt: value.startedAt, scriptSha256: value.scriptSha256, configSha256: value.configSha256 });
  const smtpBefore = await state();
  assert.equal(smtpBefore.pid, targets.smtpPid); assert.equal(smtpBefore.scriptSha256, sinkSha256); assert.equal(smtpBefore.configSha256, hash(configBytes)); assert.equal(smtpBefore.host, '127.0.0.1'); assert.equal(smtpBefore.port, 60325); assert.ok(smtpBefore.listeningAt && !smtpBefore.stoppedAt);
  const listener = (port, pid) => {
    const result = spawnSync('/usr/sbin/lsof', ['-nP', '-iTCP:' + port, '-sTCP:LISTEN', '-Fpn'], { encoding: 'utf8' }); assert.equal(result.status, 0, 'Exact isolated listener unavailable; raw diagnostics withheld');
    const lines = result.stdout.split('\n'); assert.deepEqual([...new Set(lines.filter(line => line.startsWith('p')).map(line => Number(line.slice(1))))], [pid]); assert.ok(lines.includes('n127.0.0.1:' + port));
  };
  const runtimeIdentity = async () => {
    listener(60327, targets.authPid); listener(60325, targets.smtpPid); listener(60321, targets.gatewayPid); listener(60323, targets.restPid);
    const executable = spawnSync('/usr/sbin/lsof', ['-a', '-p', String(targets.authPid), '-d', 'txt', '-Fn'], { encoding: 'utf8' }); assert.equal(executable.status, 0, 'Isolated Auth executable binding absent; raw diagnostics withheld');
    const expected = await fs.realpath(authExecutable); let ownExecutable = false;
    for (const file of executable.stdout.split('\n').filter(line => line.startsWith('n')).map(line => line.slice(1))) { try { if (await fs.realpath(file) === expected) ownExecutable = true; } catch { /* Other mapped files are irrelevant. */ } }
    assert.equal(ownExecutable, true);
    assert.equal(hash(await bytes(targets.authConfigFile)), hash(authConfigBytes)); assert.equal(hash(await fs.readFile(targets.authBinary)), hash(authBinaryBytes));
    assert.equal(hash(await fs.readFile(authExecutable)), authExecutableSha256); assert.equal(hash(await fs.readFile(authRuntimeProfile)), hash(authRuntimeProfileBytes));
    assert.equal(hash(await bytes(targets.gatewayConfigFile)), hash(gatewayConfigBytes)); assert.equal(hash(await bytes(targets.authReadinessFile)), hash(readinessBytes)); assert.equal(hash(await bytes(targets.smtpConfigFile)), hash(configBytes));
    const current = await state(); assert.deepEqual(smtpIdentity(current), smtpIdentity(smtpBefore)); assert.ok(current.listeningAt && !current.stoppedAt);
  };
  await runtimeIdentity();
  const emptyEnvBytes = await bytes(path.join(runtime, 'empty-proof.env')), restoreEnvBytes = await bytes(path.join(runtime, 'restore.env'));
  const env = dotenv.parse(emptyEnvBytes), restore = dotenv.parse(restoreEnvBytes);
  assert.equal(env.ZARIX_EMPTY_SUPABASE_URL, targets.apiOrigin); assert.equal(env.ZARIX_EMPTY_ANON_KEY, restore.ZARIX_RESTORE_ANON_KEY); assert.equal(env.ZARIX_EMPTY_SERVICE_ROLE_KEY, restore.ZARIX_RESTORE_SERVICE_ROLE_KEY);
  const targetUrl = new URL(env.ZARIX_EMPTY_DATABASE_URL), originalUrl = new URL(targets.originalDatabaseUrl);
  for (const url of [targetUrl, originalUrl]) { assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '55322'); assert.equal(url.search, ''); assert.equal(url.hash, ''); url.username = 'supabase_admin'; }
  assert.match(targets.newDatabaseName, /^zarix_empty_[a-f0-9]{12}4[a-f0-9]{3}[89ab][a-f0-9]{15}$/);
  assert.equal(decodeURIComponent(targetUrl.pathname.slice(1)), targets.newDatabaseName); assert.notEqual(targets.newDatabaseName, 'postgres'); assert.equal(originalUrl.pathname, '/postgres');
  const targetPg = isolatedPgEnvironment(targetUrl), originalPg = isolatedPgEnvironment(originalUrl), psql = path.join(env.ZARIX_PG_BIN, 'psql');
  function sql(query, pg = targetPg) {
    const result = spawnSync(psql, ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', `BEGIN READ ONLY; ${query}; COMMIT;`], { env: pg, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    assert.equal(result.status, 0, 'Read-only preservation query failed; raw diagnostics withheld'); return result.stdout.trim();
  }
  const rows = (query, pg = targetPg) => JSON.parse(sql(`SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb) FROM (${query})q`, pg));
  const loginFile = process.env.ZARIX_EMPTY_LOGINS_FILE || targets.authLoginFile; assert.equal(loginFile, targets.authLoginFile);
  const logins = JSON.parse(await bytes(loginFile));
  assert.equal(logins.users.length, 2);
  for (const user of logins.users) { assert.match(user.id, /^[a-f0-9-]{36}$/i); assert.match(user.email, /^zarix-.+@example\.invalid$/i); assert.ok(user.password); }
  assert.deepEqual(smtpConfig.allowedRecipients.map(email => email.toLowerCase()).sort(), logins.users.map(user => user.email.toLowerCase()).sort());
  assert.deepEqual(rows('SELECT id FROM auth.users ORDER BY id').map(row => row.id), logins.users.map(user => user.id).sort());
  const originalAuth = ['users', 'sessions', 'refresh_tokens'];
  protectedSnapshot = () => ['target', 'original'].flatMap(label => {
    const pg = label === 'target' ? targetPg : originalPg;
    const tables = rows("SELECT schemaname,tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename", pg);
    if (label === 'original') for (const tablename of originalAuth) tables.push({ schemaname: 'auth', tablename });
    return tables.map(({ schemaname, tablename }) => ({ database: label, schema: schemaname, table: tablename, ...rows(`SELECT count(*)::int AS rows,md5(COALESCE(jsonb_agg(to_jsonb(q) ORDER BY to_jsonb(q)::text)::text,'[]')) AS md5 FROM ${ident(schemaname)}.${ident(tablename)} q`, pg)[0] }));
  });
  before = protectedSnapshot();
  const ordinaryLogFiles = [...targets.authOrdinaryLogFiles, ...targets.smtpOrdinaryLogFiles];
  assert.ok(targets.authOrdinaryLogFiles.length > 0 && targets.smtpOrdinaryLogFiles.length > 0);
  for (const file of ordinaryLogFiles) { assert.ok(!file.startsWith(smtpConfig.outputDirectory + '/')); await bytes(file); }
  const ownFiles = ['run.mjs', 'contract.mjs', 'smtp-message.mjs', '../../../../../../scripts/lib/test-isolated-native-target.mjs'];
  sources = await Promise.all(ownFiles.map(async file => ({ path: file, sha256: hash(await fs.readFile(new URL(file, import.meta.url))) })));
  if (process.env.ZARIX_VALID_RECOVERY_PREFLIGHT_ONLY === 'no-auth-no-password') {
    const preflight = { status: 'PASS_PREFLIGHT_ONLY', case_id: 'CP2-10', complete_original_contract: false, noPasswordOrTokenGenerated: true, noAuthOrSmtpRequest: true, nativeTargetsSha256: hash(targetsBytes), sources, protectedTablesObserved: before.length, scope: 'Filesystem/process metadata and read-only SQL only; normal Auth/SMTP recovery remains unexecuted.' };
    await fs.writeFile(path.join(output, 'preflight.json'), JSON.stringify(preflight, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ case_id: 'CP2-10', status: preflight.status, complete_original_contract: false, output }));
    process.exit(0);
  }
  const user = logins.users[0], temporaryPassword = randomBytes(32).toString('base64url');
  const privateCheckpoint = { purpose: 'CP2-10-private-password-restoration-checkpoint', ownerId: user.id, apiOrigin: targets.apiOrigin, temporaryPassword, originalPassword: user.password, createdAt: new Date().toISOString(), stage: 'prepared-after-release' };
  const checkpointFile = path.join(output, 'password-restoration.private.json');
  await fs.writeFile(checkpointFile, JSON.stringify(privateCheckpoint, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  const checkpoint = async update => { Object.assign(privateCheckpoint, update, { updatedAt: new Date().toISOString() }); const next = checkpointFile + '.next'; await fs.writeFile(next, JSON.stringify(privateCheckpoint, null, 2) + '\n', { mode: 0o600 }); await fs.rename(next, checkpointFile); };
  const sessionClaims = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  const http = async (method, endpoint, body, accessToken, administrative = false) => {
    assert.ok(/^\/auth\/v1\/(?:token\?grant_type=password|recover|verify|user|logout\?scope=local)$/.test(endpoint) || (administrative && endpoint === '/auth/v1/admin/users/' + user.id));
    const response = await fetch(targets.apiOrigin + endpoint, { method, redirect: 'error', signal: AbortSignal.timeout(20000), headers: { apikey: administrative ? env.ZARIX_EMPTY_SERVICE_ROLE_KEY : env.ZARIX_EMPTY_ANON_KEY, Authorization: 'Bearer ' + (accessToken || (administrative ? env.ZARIX_EMPTY_SERVICE_ROLE_KEY : env.ZARIX_EMPTY_ANON_KEY)), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text(), parsed = text ? JSON.parse(text) : null;
    if (parsed?.access_token) {
      const claims = sessionClaims(parsed.access_token); assert.equal(claims.sub, user.id);
      assert.equal(Number(sql(`SELECT count(*) FROM auth.sessions WHERE id=${lit(claims.session_id)} AND user_id=${lit(user.id)}`)), 1, 'Every new Auth session must live in the isolated fixture database');
      privateCheckpoint.issuedSessions ||= [];
      privateCheckpoint.issuedSessions.push({ accessToken: parsed.access_token, refreshToken: parsed.refresh_token });
      await checkpoint({ issuedSessions: privateCheckpoint.issuedSessions });
    }
    return { status: response.status, body: parsed };
  };
  const cursors = new Map();
  const receiptNames = async () => (await fs.readdir(smtpConfig.outputDirectory)).filter(name => /^[a-f0-9-]{36}\.receipt\.private\.json$/i.test(name)).sort();
  report = await validPasswordRecovery({
    releasedByRoot: true, nativeAuthAndSmtpReady: true, authIsPrivateClone: true, ownerId: user.id, email: user.email, originalPassword: user.password, temporaryPassword, http,
    checkpoint,
    mailCursor: async () => { const current = await state(); assert.deepEqual(smtpIdentity(current), smtpIdentity(smtpBefore)); assert.ok(!current.stoppedAt); cursors.set(current.accepted, { names: await receiptNames(), at: Date.now() }); return current.accepted; },
    receiveRecoveryToken: async ({ afterSequence, recipient }) => {
      const cursor = cursors.get(afterSequence); assert.ok(cursor);
      const deadline = Date.now() + 20000;
      do {
        const current = await state(); assert.deepEqual(smtpIdentity(current), smtpIdentity(smtpBefore));
        const fresh = (await receiptNames()).filter(name => !cursor.names.includes(name));
        if (current.accepted > afterSequence && fresh.length) {
          assert.equal(current.accepted, afterSequence + 1); assert.equal(fresh.length, 1);
          const receiptBytes = await bytes(path.join(smtpConfig.outputDirectory, fresh[0])), receipt = JSON.parse(receiptBytes);
          assert.deepEqual(receipt.recipients, [recipient.toLowerCase()]); assert.match(receipt.sender, /^[a-z0-9._+-]+@example\.invalid$/i);
          assert.equal(receipt.fileName, receipt.id + '.eml'); assert.equal(fresh[0], receipt.id + '.receipt.private.json'); assert.ok(Date.parse(receipt.at) >= cursor.at - 1000);
          const message = await bytes(path.join(smtpConfig.outputDirectory, receipt.fileName)); assert.equal(message.length, receipt.bytes); assert.equal(hash(message), receipt.messageSha256);
          const delivered = recoveryTokenFromDeliveredMime(message, targets.apiOrigin);
          await checkpoint({ recoveryHash: delivered.tokenHash, smtpMessagePath: path.join(smtpConfig.outputDirectory, receipt.fileName), smtpReceiptPath: path.join(smtpConfig.outputDirectory, fresh[0]) });
          return { ...delivered, sequence: current.accepted, receiptSha256: hash(receiptBytes), requestedRecipientMatched: true };
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      } while (Date.now() < deadline);
      throw new Error('Private SMTP receipt was not observed');
    },
    restoreOriginalPassword: async ({ ownerId, originalPassword, knownOwnTokens }) => {
      for (const token of [...knownOwnTokens].reverse()) {
        try { const restored = await http('PUT', '/auth/v1/user', { password: originalPassword }, token); if (restored.status === 200 && restored.body?.id === ownerId) return; } catch { /* Repair may continue only on this isolated clone. */ }
      }
      const restored = await http('PUT', '/auth/v1/admin/users/' + ownerId, { password: originalPassword }, undefined, true);
      assert.equal(restored.status, 200); assert.equal(restored.body?.id, ownerId);
    },
    scanOrdinaryLogs: async secrets => {
      const values = [...new Set([...secrets, env.ZARIX_EMPTY_ANON_KEY, env.ZARIX_EMPTY_SERVICE_ROLE_KEY])].filter(Boolean);
      let secretMatches = 0;
      for (const file of ordinaryLogFiles) { const content = await bytes(file); for (const value of values) if (content.includes(Buffer.from(value))) secretMatches++; }
      return { examinedFiles: ordinaryLogFiles.length, secretMatches, scope: 'Exact in-memory comparison in explicit ordinary Auth/SMTP logs only; intentional private MIME/checkpoint/env files excluded, no values or matching excerpts published' };
    },
    checkProtectedRows: async () => { await runtimeIdentity(); const after = protectedSnapshot(); return { complete: true, unchanged: JSON.stringify(after) === JSON.stringify(before), before, after, scope: 'All public tables in both databases plus original Auth users/sessions/refresh_tokens; isolated Auth changes are expected and separate' }; },
  });
  report.binding = { nativeTargetsSha256: hash(targetsBytes), apiOrigin: targets.apiOrigin, authUpstream: targets.authUpstream, authPid: targets.authPid, authConfigSha256: hash(authConfigBytes), authLauncherSha256: hash(authBinaryBytes), authExecutableSha256, authRuntimeProfileSha256: hash(authRuntimeProfileBytes), authReadinessSha256: hash(readinessBytes), gatewayConfigSha256: hash(gatewayConfigBytes), exactListenerAndExecutableOwnershipVerified: true, databaseName: targets.newDatabaseName, smtpPid: targets.smtpPid, smtpScriptSha256: sinkSha256, smtpConfigSha256: hash(configBytes), ownerId: user.id, identitiesAdded: 0, newExternalCredentials: 0 };
  report.harnessManifest = sources;
  await runtimeIdentity();
  report.sourceStable = hash(await bytes(targetsFile)) === hash(targetsBytes) && hash(await bytes(path.join(runtime, 'empty-proof.env'))) === hash(emptyEnvBytes) && hash(await bytes(path.join(runtime, 'restore.env'))) === hash(restoreEnvBytes) && (await Promise.all(ownFiles.map(file => fs.readFile(new URL(file, import.meta.url)).then(hash)))).every((sha, index) => sha === sources[index].sha256) && hash(await fs.readFile(sinkSource)) === sinkSha256;
  if (!report.sourceStable) { report.status = 'FAIL'; report.complete_original_contract = false; }
  await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
} catch (error) {
  report ||= { case_id: 'CP2-10', status: 'FAIL', complete_original_contract: false, assertions: [] };
  report.status = 'FAIL'; report.complete_original_contract = false;
  report.fatal = { type: error.name, location: String(error.stack).match(/(?:run|contract|smtp-message)\.mjs:\d+:\d+/)?.[0] || 'native-precondition', rawMessagePublished: false };
  if (before && protectedSnapshot) { try { const after = protectedSnapshot(); report.finalPreservation = { complete: true, unchanged: JSON.stringify(after) === JSON.stringify(before), before, after }; } catch { report.finalPreservation = { complete: false, unchanged: false }; } }
  if (output) await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
}
console.log(JSON.stringify({ case_id: 'CP2-10', status: report?.status || 'FAIL', complete_original_contract: report?.complete_original_contract === true, output: output || null, fatal: report?.fatal || null }));
process.exitCode = report?.status === 'PASS' ? 0 : 1;
