import { MAX_EMAIL_ATTACHMENT_BYTES } from '@/lib/integrations/statement-parse';

export type InboundAttachment = {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
};

export type InboundEmailPayload = {
  mailboxToken: string | null;
  toAddresses: string[];
  from: string;
  subject: string;
  text: string;
  messageId: string;
  attachments: InboundAttachment[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function collectAddresses(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === 'string') return [item];
      const rec = asRecord(item);
      return rec ? [str(rec.email || rec.address || rec.to)] : [];
    });
  }
  const rec = asRecord(value);
  if (rec) return collectAddresses(rec.email || rec.address);
  return [];
}

function decodeBase64(raw: string, maxBytes: number): Uint8Array | null {
  const compact = raw.replace(/\s/g, '');
  if (!compact) return null;
  let buf: Buffer;
  try {
    buf = Buffer.from(compact, 'base64');
  } catch {
    return null;
  }
  if (buf.length === 0 || buf.length > maxBytes) return null;
  return new Uint8Array(buf);
}

function parseAttachments(value: unknown): InboundAttachment[] {
  if (!Array.isArray(value)) return [];
  const out: InboundAttachment[] = [];
  for (const item of value) {
    const rec = asRecord(item);
    if (!rec) continue;
    const filename = str(rec.filename || rec.name).slice(0, 120) || 'adjunto';
    const contentType = str(rec.content_type || rec.contentType || rec.mimeType || rec.type) || 'application/octet-stream';
    const b64 = str(rec.contentBase64 || rec.content || rec.data);
    // Remote download URLs are ignored on purpose (SSRF). Providers must send inline bytes.
    if (!b64) continue;
    const bytes = decodeBase64(b64, MAX_EMAIL_ATTACHMENT_BYTES);
    if (!bytes) continue;
    out.push({ filename, contentType, bytes });
    if (out.length >= 4) break;
  }
  return out;
}

function localPart(address: string): string | null {
  const trimmed = address.trim().toLowerCase();
  const match = trimmed.match(/^<?([^@\s>]+)@/);
  return match?.[1] || null;
}

/** Resend inbound (`email.received`) or generic JSON `{ mailboxToken, to, text, attachments }`. */
export function parseInboundEmailPayload(body: unknown): InboundEmailPayload {
  const root = asRecord(body) ?? {};
  const data = asRecord(root.data) ?? root;
  const toAddresses = [
    ...collectAddresses(data.to),
    ...collectAddresses(data.To),
    ...collectAddresses(root.to),
  ].filter(Boolean);
  const mailboxToken =
    str(root.mailboxToken || data.mailboxToken || root.token) ||
    toAddresses.map(localPart).find((part) => part?.startsWith('zrxm_')) ||
    null;
  const text =
    str(data.text || data.body || data.plain || root.text) ||
    str(data.html || root.html).replace(/<[^>]+>/g, ' ');
  const messageId =
    str(data.email_id || data.messageId || data.message_id || root.messageId || root.id) ||
    `${str(data.from)}|${str(data.subject)}|${text.slice(0, 80)}`;
  return {
    mailboxToken,
    toAddresses,
    from: str(data.from || data.sender || root.from).slice(0, 200),
    subject: str(data.subject || root.subject).slice(0, 200),
    text: text.slice(0, 12_000),
    messageId: messageId.slice(0, 200),
    attachments: parseAttachments(data.attachments || root.attachments),
  };
}

export function mailboxTokenFromAddresses(addresses: string[]): string | null {
  for (const address of addresses) {
    const part = localPart(address);
    if (part?.startsWith('zrxm_')) return part;
  }
  return null;
}
