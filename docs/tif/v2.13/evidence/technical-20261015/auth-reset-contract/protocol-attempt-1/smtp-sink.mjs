// Local SMTP capture for the two existing synthetic identities. No forwarding.
import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';

const privateRoot = '/tmp/zarix-runtime-20261015/auth-reset-private';
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--config') throw new Error('Explicit private SMTP config required');
const configPath = path.resolve(args[1]);
if (path.dirname(configPath) !== privateRoot) throw new Error('SMTP config outside owned private directory');
const info = await fs.lstat(configPath);
if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077)) throw new Error('SMTP config must be regular0600');
const realRoot = await fs.realpath(privateRoot);
const realRuntime = await fs.realpath('/tmp/zarix-runtime-20261015');
const rootInfo = await fs.lstat(privateRoot);
if (realRoot !== path.join(realRuntime, 'auth-reset-private') || rootInfo.isSymbolicLink() || (rootInfo.mode & 0o077)) throw new Error('SMTP private directory must be real0700');
if (await fs.realpath(configPath) !== path.join(realRoot, path.basename(configPath))) throw new Error('SMTP config canonical path differs');
const configBytes = await fs.readFile(configPath);
const config = JSON.parse(configBytes);
if (config.purpose !== 'zarix-local-auth-reset-smtp' || config.host !== '127.0.0.1' || config.port !== 60325) throw new Error('SMTP target not exact');
if (!Array.isArray(config.allowedRecipients) || config.allowedRecipients.length !== 2 || config.allowedRecipients.some(value => typeof value !== 'string' || !/^zarix-[a-z0-9._+-]+@example\.invalid$/i.test(value))) throw new Error('SMTP requires exactly the two synthetic recipients');
const allowed = new Set(config.allowedRecipients.map(value => value.toLowerCase()));
if (allowed.size !== 2) throw new Error('SMTP recipients must identify two different synthetic identities');
const output = path.resolve(config.outputDirectory);
if (path.dirname(output) !== privateRoot || !/^smtp-attempt-[a-z0-9-]+$/.test(path.basename(output))) throw new Error('SMTP output directory not owned');
await fs.mkdir(output, { mode: 0o700 }); // Reject reuse of any previous attempt.
async function syncDirectory(directory) {
  const handle = await fs.open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}
await syncDirectory(privateRoot);
const hash = value => createHash('sha256').update(value).digest('hex');
const state = {
  purpose: config.purpose, host: config.host, port: config.port, pid: process.pid,
  startedAt: new Date().toISOString(), scriptSha256: hash(await fs.readFile(new URL(import.meta.url))),
  configSha256: hash(configBytes), accepted: 0, rejected: 0, activeConnections: 0,
  scope: 'Local SMTP message reconstructed with UTF-8/CRLF and dot unstuffing, captured privately; no external email provider or forwarding.',
};
let writes = Promise.resolve();
async function exclusive(file, bytes) {
  const handle = await fs.open(file, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}
function persistState() {
  writes = writes.then(async () => {
    const temp = path.join(output, 'state-' + randomUUID() + '.tmp');
    await exclusive(temp, JSON.stringify(state, null, 2) + '\n');
    await fs.rename(temp, path.join(output, 'state.private.json'));
    await syncDirectory(output);
  });
  return writes;
}
const sockets = new Set();
const server = net.createServer(socket => {
  if (!['127.0.0.1', '::ffff:127.0.0.1'].includes(socket.remoteAddress)) return socket.destroy();
  sockets.add(socket); state.activeConnections++; void persistState();
  socket.setTimeout(15_000, () => socket.destroy());
  const decoder = new StringDecoder('utf8');
  let buffer = '', inData = false, data = [], dataBytes = 0, sender = null, recipients = new Set(), draining = false;
  const reset = () => { sender = null; recipients = new Set(); inData = false; data = []; dataBytes = 0; };
  const reply = value => { if (!socket.destroyed) socket.write(value + '\r\n'); };
  const reject = value => { state.rejected++; void persistState(); reply(value); };
  socket.on('error', () => {}); // Never print command bytes, headers, links or tokens.
  socket.on('close', () => { sockets.delete(socket); state.activeConnections--; void persistState(); });
  async function line(value) {
    if (inData) {
      if (value === '.') {
        const id = randomUUID(), message = Buffer.from(data.join('\r\n') + '\r\n');
        const fileName = id + '.eml';
        await exclusive(path.join(output, fileName), message);
        await exclusive(path.join(output, id + '.receipt.private.json'), JSON.stringify({
          at: new Date().toISOString(), id, sender, recipients: [...recipients], fileName,
          bytes: message.length, messageSha256: hash(message), scope: state.scope,
        }, null, 2) + '\n');
        state.accepted++; await persistState(); reset(); reply('250 2.0.0 Captured locally ' + id);
        return;
      }
      const unstuffed = value.startsWith('..') ? value.slice(1) : value;
      dataBytes += Buffer.byteLength(unstuffed) + 2;
      if (dataBytes > 1_048_576) { reject('552 5.3.4 Local capture size limit'); socket.end(); return; }
      data.push(unstuffed); return;
    }
    if (/^(EHLO|HELO)\s+\S+$/i.test(value)) { reply('250-localhost\r\n250-8BITMIME\r\n250 SIZE 1048576'); return; }
    if (/^NOOP$/i.test(value)) { reply('250 2.0.0 OK'); return; }
    if (/^RSET$/i.test(value)) { reset(); reply('250 2.0.0 Reset'); return; }
    if (/^QUIT$/i.test(value)) { reply('221 2.0.0 Bye'); socket.end(); return; }
    const mail = /^MAIL FROM:\s*<([^<>\r\n]+)>(?:\s+SIZE=\d+)?(?:\s+BODY=8BITMIME)?$/i.exec(value);
    if (mail) {
      reset();
      if (!/^[a-z0-9._+-]+@example\.invalid$/i.test(mail[1])) { reject('550 5.7.1 Synthetic sender only'); return; }
      sender = mail[1]; reply('250 2.1.0 Sender accepted'); return;
    }
    const recipient = /^RCPT TO:\s*<([^<>\r\n]+)>$/i.exec(value);
    if (recipient) {
      if (!sender) { reject('503 5.5.1 MAIL required'); return; }
      if (!allowed.has(recipient[1].toLowerCase())) { reject('550 5.7.1 Recipient outside synthetic fixture'); return; }
      recipients.add(recipient[1].toLowerCase()); reply('250 2.1.5 Recipient accepted'); return;
    }
    if (/^DATA$/i.test(value)) {
      if (!sender || recipients.size === 0) { reject('503 5.5.1 Envelope required'); return; }
      inData = true; reply('354 End data with CRLF dot CRLF'); return;
    }
    reject('502 5.5.1 Command unsupported by local capture');
  }
  async function drain() {
    if (draining) return;
    draining = true;
    try {
      while (!socket.destroyed) {
        const end = buffer.indexOf('\r\n');
        if (end < 0) break;
        const value = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        await line(value);
      }
    } catch { state.rejected++; await persistState().catch(() => {}); socket.destroy(); }
    finally { draining = false; }
  }
  socket.on('data', bytes => {
    buffer += decoder.write(bytes);
    if (Buffer.byteLength(buffer) > 1_048_576) { socket.destroy(); return; }
    void drain();
  });
  reply('220 localhost ESMTP ZARIX local capture');
});
server.on('error', () => { console.error(JSON.stringify({ status: 'FAIL', reason: 'Local SMTP listener unavailable; no details or message content published' })); process.exitCode = 1; });
server.listen(config.port, config.host, async () => {
  state.listeningAt = new Date().toISOString(); await persistState();
  console.log(JSON.stringify({ status: 'READY', pid: process.pid, host: config.host, port: config.port, scope: state.scope }));
});
let stopping = false;
async function stop() {
  if (stopping) return; stopping = true;
  server.close(); for (const socket of sockets) socket.destroy();
  state.stoppedAt = new Date().toISOString(); await persistState();
}
process.on('SIGTERM', () => { void stop(); });
process.on('SIGINT', () => { void stop(); });
