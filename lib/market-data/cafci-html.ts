/**
 * CAFCI stats HTML ficha via cheerio/slim (htmlparser2).
 * NAV/date are scoped to the single `#cuotaparte` section. `#cartera` is never
 * a date source. Comments and markup inside the NAV token fail closed.
 */

import { load, type CheerioAPI } from 'cheerio/slim';
import type { AnyNode, Element } from 'domhandler';
import { parseArgentineNumber } from '@/lib/market-data/argentine-number';
import { parseCafciDateLabel } from '@/lib/market-data/fci-nav-freshness';

export const CAFCI_NAV_TOKEN = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/;
const VALORES_AL = /^Valores al\s+(\d{2}\/\d{2}\/\d{4})$/i;
const CUOTAPARTE_LABEL = /^Valor por cada cuotaparte:\s*(.*)$/i;
const MONEDA_LABEL = /^Moneda:\s*(.*)$/i;

export type CafciHtmlParseFail = 'unparseable_ficha' | 'class_mismatch';

export type CafciHtmlParsed = {
  price: number;
  monedaLabel: string;
  timestamp: string;
  fondoId: string;
  claseId: string;
};

export type CafciHtmlParseResult =
  | { parsed: CafciHtmlParsed }
  | { parsed: null; reason: CafciHtmlParseFail };

function isElement(node: AnyNode): node is Element {
  return node.type === 'tag';
}

function collapsedText($: CheerioAPI, el: AnyNode): string {
  return $(el).text().replace(/\s+/g, ' ').trim();
}

function directText($: CheerioAPI, el: Element): string {
  return $(el)
    .contents()
    .toArray()
    .filter((node) => node.type === 'text')
    .map((node) => $(node).text())
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function subtreeHasComment(root: AnyNode): boolean {
  const stack: AnyNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (node.type === 'comment') return true;
    if ('children' in node && Array.isArray(node.children)) {
      for (const child of node.children) stack.push(child);
    }
  }
  return false;
}

function innermostIn(
  $: CheerioAPI,
  root: Element,
  predicate: (el: Element) => boolean
): Element[] {
  const hits: Element[] = [];
  $(root)
    .find('*')
    .addBack()
    .each((_, el) => {
      if (!isElement(el) || !predicate(el)) return;
      const nested = $(el).find('*').toArray().some((child) => isElement(child) && predicate(child));
      if (!nested) hits.push(el);
    });
  return hits;
}

function innermost(
  $: CheerioAPI,
  predicate: (el: Element) => boolean,
  excludeClosest?: string
): Element[] {
  const hits: Element[] = [];
  $('*').each((_, el) => {
    if (!isElement(el) || !predicate(el)) return;
    if (excludeClosest && $(el).closest(excludeClosest).length > 0) return;
    const nested = $(el).find('*').toArray().some((child) => isElement(child) && predicate(child));
    if (!nested) hits.push(el);
  });
  return hits;
}

/** Trailing slash, query string, and pathname case are not identity. */
export function fondoIdFromAction(action: string | undefined): string | null {
  if (!action) return null;
  const trimmed = action.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed, 'https://estadisticas.cafci.org.ar');
    const path = url.pathname.replace(/\/+$/, '').toLowerCase();
    const match = path.match(/^\/fondos\/(\d+)$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function decodeCommaEntities(raw: string): string {
  return raw.replace(/&#44;/gi, ',').replace(/&#x2c;/gi, ',');
}

function followingSiblingHtml($: CheerioAPI, el: Element): string {
  const nodes = $(el).parent().contents().toArray();
  const idx = nodes.indexOf(el);
  if (idx < 0) return '';
  return nodes.slice(idx + 1).map((node) => $.html(node) ?? '').join('');
}

function followingText($: CheerioAPI, el: Element): string {
  const nodes = $(el).parent().contents().toArray();
  const idx = nodes.indexOf(el);
  if (idx < 0) return '';
  const bits: string[] = [];
  for (let i = idx + 1; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.type === 'comment') return '';
    if (node.type === 'text') {
      bits.push($(node).text());
      continue;
    }
    break;
  }
  return bits.join('');
}

/**
 * Concatenating siblings is only allowed when the raw HTML has no markup
 * inside the number token. Remainder after the label must be exactly the token.
 */
function remainderHasBareNavToken(remainder: string, token: string): boolean {
  const decoded = decodeCommaEntities(remainder).replace(/^\s+/, '').replace(/\s+$/, '');
  return decoded === token;
}

function parseIdentity(
  $: CheerioAPI,
  expected?: { fondoId: string; claseId: string }
): { fondoId: string; claseId: string } | { fail: CafciHtmlParseFail } {
  const fundForms = $('form').toArray()
    .map((el) => ({ el, fondoId: fondoIdFromAction($(el).attr('action')) }))
    .filter((row): row is { el: Element; fondoId: string } => Boolean(row.fondoId));
  if (fundForms.length !== 1) return { fail: 'unparseable_ficha' };
  const fundForm = fundForms[0];

  const selects = $('select[name=clase]').toArray();
  if (selects.length !== 1) return { fail: 'unparseable_ficha' };
  const select = selects[0];
  if ($(select).closest('form')[0] !== fundForm.el) return { fail: 'unparseable_ficha' };

  const options = $(select).find('option').toArray();
  const values = options.map((opt) => ($(opt).attr('value') ?? '').trim());
  if (values.some((value) => !value) || new Set(values).size !== values.length) {
    return { fail: 'unparseable_ficha' };
  }

  const selected = $(select).find('option[selected]').toArray();
  if (selected.length !== 1) return { fail: 'unparseable_ficha' };
  if ($(selected[0]).closest('optgroup[disabled]').length > 0) {
    return { fail: 'unparseable_ficha' };
  }
  const claseId = ($(selected[0]).attr('value') ?? '').trim();
  if (!claseId) return { fail: 'unparseable_ficha' };

  if (expected && (fundForm.fondoId !== expected.fondoId || claseId !== expected.claseId)) {
    return { fail: 'class_mismatch' };
  }
  return { fondoId: fundForm.fondoId, claseId };
}

function parseNavPrice($: CheerioAPI, section: Element): number | null {
  const nodes = innermostIn($, section, (el) => /Valor por cada cuotaparte:/i.test(collapsedText($, el)));
  if (nodes.length !== 1) return null;
  const el = nodes[0];
  const own = directText($, el);
  const labelled = own.match(CUOTAPARTE_LABEL);
  let token = labelled ? labelled[1].trim() : '';
  let remainder = '';
  const inner = decodeCommaEntities($(el).html() ?? '');
  const innerMatch = inner.match(/Valor por cada cuotaparte:\s*/i);
  if (innerMatch && innerMatch.index != null) {
    remainder = inner.slice(innerMatch.index + innerMatch[0].length);
  }
  if (!token) {
    token = followingText($, el).replace(/\s+/g, ' ').trim();
    remainder = followingSiblingHtml($, el);
  }
  if (!token || !CAFCI_NAV_TOKEN.test(token)) return null;
  if (!remainderHasBareNavToken(remainder, token)) return null;
  const price = parseArgentineNumber(token);
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  return price;
}

function parseValoresAl($: CheerioAPI, section: Element): string | null {
  const nodes = innermostIn($, section, (el) => /Valores al\s+/i.test(collapsedText($, el)));
  if (nodes.length !== 1) return null;
  const match = collapsedText($, nodes[0]).match(VALORES_AL);
  if (!match) return null;
  return parseCafciDateLabel(match[1]);
}

function parseCurrencyLabel($: CheerioAPI): string | null {
  const nodes = innermost($, (el) => /Moneda:/i.test(collapsedText($, el)), '#cartera');
  if (nodes.length !== 1) return null;
  const el = nodes[0];
  const own = directText($, el) || collapsedText($, el);
  const withValue = own.match(MONEDA_LABEL);
  if (withValue) {
    const label = withValue[1].trim();
    if (label) return label;
  }
  if (/^Moneda:\s*$/i.test(own)) {
    const rest = followingText($, el).replace(/\s+/g, ' ').trim();
    return rest || null;
  }
  return null;
}

export function parseCafciHtmlFichaDetailed(
  html: string,
  expected?: { fondoId: string; claseId: string }
): CafciHtmlParseResult {
  if (!html || typeof html !== 'string') return { parsed: null, reason: 'unparseable_ficha' };
  const $ = load(html);
  $('script, style, noscript, template').remove();

  const identity = parseIdentity($, expected);
  if ('fail' in identity) return { parsed: null, reason: identity.fail };

  const sections = $('[id="cuotaparte"]').toArray().filter(isElement);
  if (sections.length !== 1) return { parsed: null, reason: 'unparseable_ficha' };
  const section = sections[0];
  if (subtreeHasComment(section)) return { parsed: null, reason: 'unparseable_ficha' };

  const price = parseNavPrice($, section);
  if (price == null) return { parsed: null, reason: 'unparseable_ficha' };
  const timestamp = parseValoresAl($, section);
  if (!timestamp) return { parsed: null, reason: 'unparseable_ficha' };
  const monedaLabel = parseCurrencyLabel($);
  if (!monedaLabel) return { parsed: null, reason: 'unparseable_ficha' };

  return {
    parsed: {
      price,
      monedaLabel,
      timestamp,
      fondoId: identity.fondoId,
      claseId: identity.claseId,
    },
  };
}

export function parseCafciHtmlFicha(
  html: string,
  expected?: { fondoId: string; claseId: string }
): CafciHtmlParsed | null {
  return parseCafciHtmlFichaDetailed(html, expected).parsed;
}
