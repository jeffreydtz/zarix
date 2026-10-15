// Reads a token only from the delivered private MIME payload supplied by Native.
// No file, socket, URL fetch, command or secret output occurs at import/call.
import assert from 'node:assert/strict';

function mimeTexts(source, depth = 0) {
  assert.ok(depth < 8, 'Expected the bounded ordinary GoTrue email template');
  const split = source.search(/\r?\n\r?\n/);
  assert.ok(split >= 0, 'A complete delivered MIME message is required');
  const headers = source.slice(0, split).replace(/\r?\n[ \t]+/g, ' ');
  const body = source.slice(split).replace(/^\r?\n\r?\n/, '');
  const type = headers.match(/^content-type:\s*(.+)$/im)?.[1] || 'text/plain';
  const boundary = type.match(/boundary\s*=\s*(?:"([^\"]+)"|([^;\s]+))/i);
  if (/^multipart\//i.test(type)) {
    assert.ok(boundary, 'Multipart template boundary required');
    const marker = '--' + (boundary[1] || boundary[2]);
    return body.split(marker).slice(1).filter(part => !part.startsWith('--')).flatMap(part => mimeTexts(part.replace(/^\r?\n/, ''), depth + 1));
  }
  const transfer = headers.match(/^content-transfer-encoding:\s*(.+)$/im)?.[1]?.trim().toLowerCase();
  if (transfer === 'base64') return [Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf8')];
  if (transfer === 'quoted-printable') return [body.replace(/=\r?\n/g, '').replace(/=([a-f\d]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))];
  assert.ok(!transfer || ['7bit', '8bit', 'binary'].includes(transfer), 'Unknown mail encoding is not silently treated as plain text');
  return [body];
}

export function recoveryTokenFromDeliveredMime(raw, verificationOrigin) {
  const expected = new URL(verificationOrigin);
  assert.equal(expected.hostname, '127.0.0.1');
  assert.equal(expected.protocol, 'http:');
  assert.equal(expected.username, ''); assert.equal(expected.password, '');
  const tokens = new Set();
  for (const text of mimeTexts(Buffer.isBuffer(raw) ? raw.toString('utf8') : raw)) {
    const decoded = text.replace(/&amp;|&#38;|&#x26;/gi, '&');
    for (const candidate of decoded.match(/https?:\/\/[^<>\s"']+/g) || []) {
      let url;
      try { url = new URL(candidate); } catch { continue; }
      if (url.origin !== expected.origin || url.pathname !== '/auth/v1/verify' || url.searchParams.get('type') !== 'recovery') continue;
      const token = url.searchParams.get('token_hash') || url.searchParams.get('token');
      assert.ok(token && /^[a-z\d_-]{32,512}$/i.test(token), 'Delivered recovery token must match the actual bounded token format');
      tokens.add(token);
    }
  }
  assert.equal(tokens.size, 1, 'Exactly one unambiguous delivered recovery token for the pinned loopback Auth origin is required');
  return { tokenHash: [...tokens][0], recoveryTypeMatched: true, verificationOriginMatched: true };
}
