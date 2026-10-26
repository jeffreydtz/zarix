/**
 * Decode entities and drop inactive HTML before regex identity/NAV extraction.
 * Comments, scripts and styles must not count as a CAFCI form or cuotaparte.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  comma: ',',
  minus: '\u2212',
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  ntilde: 'ñ',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  Ntilde: 'Ñ',
};

function fromCodePoint(code: number): string {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => NAMED_ENTITIES[name] ?? match)
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex: string) => fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => fromCodePoint(Number(dec)));
}

/** Remove comments, script and style so regex parsers only see visible markup. */
export function stripInactiveHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?(-->|$)/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
}

/**
 * Visible text of an HTML fragment. Tags become spaces, then spaces between
 * digits/separators are removed so `1<span>,097744</span>` is still `1,097744`.
 */
export function htmlToVisibleText(html: string): string {
  return decodeHtmlEntities(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/(?<=[\d.,])\s+(?=[\d.,])/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Inner HTML of the element whose `id` matches, using balanced tags so a nested
 * `</div>` does not truncate `#cuotaparte`.
 */
export function extractElementById(html: string, id: string): string | null {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const open = html.match(new RegExp(`<([a-zA-Z][\\w:-]*)\\b[^>]*\\bid=["']${escaped}["'][^>]*>`, 'i'));
  if (!open || open.index == null) return null;
  const tag = open[1];
  const start = open.index;
  if (/\/>\s*$/.test(open[0])) return html.slice(start, start + open[0].length);
  const tagRe = new RegExp(`</?${tag}\\b[^>]*>`, 'gi');
  tagRe.lastIndex = start + open[0].length;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(html))) {
    if (match[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0) return html.slice(start, match.index + match[0].length);
    } else if (!/\/>\s*$/.test(match[0])) {
      depth += 1;
    }
  }
  return null;
}
