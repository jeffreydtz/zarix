/**
 * CAFCI stats HTML ficha via cheerio + parse5 (browser-compatible).
 * NAV/date are scoped to the single `#cuotaparte` section. `#cartera` is never
 * a date source. Comments and markup inside the NAV token fail closed.
 *
 * parse5 drops duplicate attributes on the same element (HTML first-wins) and
 * does not expose them via location info in cheerio's DOM, so duplicate attrs
 * cannot be rejected robustly here.
 *
 * Uniqueness is document-wide and runs before trust: every identity control,
 * `por cada cuotaparte`, `Valores al` (except `#cartera`), `Moneda:` label, and
 * case-insensitive `cuotaparte` id counts, whether allowlisted, hidden, foreign
 * namespace, or raw-text. Live fichas (2026-10-26) have one of each countable
 * candidate (two raw `Valores al`, of which one is `#cartera`). Any extra skips.
 * The single candidate must then sit on an HTML-namespace allowlist chain
 * through `<body>` then `<html>` and must not be hidden (`hidden`,
 * `aria-hidden="true"`, `inert`, closed `details`/`dialog`, or an inline style
 * whose last `display`/`visibility` declaration is `none` / `hidden`/`collapse`).
 * External and class-based CSS cannot be checked and is an accepted limit.
 *
 * Text values come only from text nodes whose direct parent is allowlisted and
 * visible. Unicode Cf/format characters are stripped before the node-vs-block
 * NAV cross-check. iframe/raw-text, `<base href>`, `<meta http-equiv=refresh>`,
 * and non-whitespace after `</html>` fail closed (live fichas have none of those
 * except a trailing newline after `</html>`).
 */

import { load, type CheerioAPI } from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import { parseArgentineNumber } from '@/lib/market-data/argentine-number';
import { parseCafciDateLabel } from '@/lib/market-data/fci-nav-freshness';

export const CAFCI_NAV_TOKEN = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/;
const NAV_TOKEN_PREFIX = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?/;
const VALORES_AL = /^Valores al\s+(\d{2}\/\d{2}\/\d{4})$/i;
const CUOTAPARTE_LABEL = /^Valor por cada cuotaparte:\s*(.*)$/i;
const MONEDA_LABEL = /^Moneda:\s*(.*)$/i;
const RAW_TEXT_OR_FRAME = 'iframe, noembed, noframes, plaintext, xmp, textarea, title';
const DMY = /(?<!\d)(\d{2}\/\d{2}\/\d{4})(?!\d)/g;
const FORMAT_CHARS = /\p{Cf}/gu;
const BOUNDARY_CONTINUE = /[\p{L}\p{N}\p{M}.,]/u;
const HTML_NS = 'http://www.w3.org/1999/xhtml';

/**
 * Live-ficha ancestor tags plus equivalent visible HTML content wrappers.
 * Walked 2026-10-26 from 227/784, 622/1255, 1570/5100, 750/1645, plus harmless
 * visible wrappers (article/aside/nav/footer/h2/em/small/a).
 */
export const CAFCI_HTML_ALLOWLIST = [
  'html', 'body', 'div', 'section', 'main', 'header',
  'article', 'aside', 'nav', 'footer',
  'form', 'select', 'optgroup', 'option', 'label',
  'h2', 'h3', 'p', 'span', 'strong', 'b', 'em', 'small', 'a',
  'table', 'tbody', 'tr', 'td',
  'ul', 'li',
] as const;

const ALLOWED = new Set<string>(CAFCI_HTML_ALLOWLIST);

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

function parentOf(node: AnyNode): AnyNode | null {
  return 'parent' in node && node.parent ? node.parent : null;
}

function elementNamespace(el: Element): string | undefined {
  return (el as Element & { namespace?: string }).namespace;
}

function isHtmlNamespace(el: Element): boolean {
  const ns = elementNamespace(el);
  return ns === HTML_NS || ns == null;
}

function isAllowedElement(el: Element): boolean {
  return isHtmlNamespace(el) && ALLOWED.has(el.name.toLowerCase());
}

function attrCi($: CheerioAPI, el: Element, name: string): string {
  return ($(el).attr(name) ?? '').trim().toLowerCase();
}

function hasAttr($: CheerioAPI, el: Element, name: string): boolean {
  return $(el).attr(name) != null;
}

/** Last declaration wins; case/whitespace/!important-tolerant. Not a substring match. */
export function parseInlineStyleDeclarations(style: string): Map<string, string> {
  const decls = new Map<string, string>();
  for (const raw of style.split(';')) {
    const part = raw.trim();
    if (!part) continue;
    const colon = part.indexOf(':');
    if (colon <= 0) continue;
    const prop = part.slice(0, colon).trim().toLowerCase();
    let value = part.slice(colon + 1).trim();
    value = value.replace(/!important\s*$/i, '').trim().toLowerCase();
    if (prop) decls.set(prop, value);
  }
  return decls;
}

function inlineStyleHides(style: string | undefined): boolean {
  if (!style) return false;
  const decls = parseInlineStyleDeclarations(style);
  const display = decls.get('display');
  const visibility = decls.get('visibility');
  return display === 'none' || visibility === 'hidden' || visibility === 'collapse';
}

function elementHides($: CheerioAPI, el: Element): boolean {
  if (hasAttr($, el, 'hidden')) return true;
  if (hasAttr($, el, 'inert')) return true;
  if (attrCi($, el, 'aria-hidden') === 'true') return true;
  if (inlineStyleHides($(el).attr('style'))) return true;
  const name = el.name.toLowerCase();
  if ((name === 'details' || name === 'dialog') && !hasAttr($, el, 'open')) return true;
  return false;
}

function hiddenChain($: CheerioAPI, el: Element): boolean {
  let node: AnyNode | null = el;
  while (node) {
    if (isElement(node) && elementHides($, node)) return true;
    node = parentOf(node);
  }
  return false;
}

/** HTML-namespace allowlisted chain through `<body>` then `<html>`. */
function allowlistedAncestry(el: Element): boolean {
  let node: AnyNode | null = el;
  let sawBody = false;
  let sawHtml = false;
  while (node) {
    if (isElement(node)) {
      if (!isAllowedElement(node)) return false;
      const name = node.name.toLowerCase();
      if (name === 'body') {
        if (sawHtml) return false;
        sawBody = true;
      }
      if (name === 'html') sawHtml = true;
    }
    node = parentOf(node);
  }
  return sawBody && sawHtml;
}

function usableAncestry($: CheerioAPI, el: Element): boolean {
  return allowlistedAncestry(el) && !hiddenChain($, el);
}

function textParentAllowed($: CheerioAPI, node: AnyNode): boolean {
  const parent = parentOf(node);
  return Boolean(parent && isElement(parent) && isAllowedElement(parent) && usableAncestry($, parent));
}

function isDescendantOrSelf(el: Element, ancestor: Element): boolean {
  let node: AnyNode | null = el;
  while (node) {
    if (node === ancestor) return true;
    node = parentOf(node);
  }
  return false;
}

/**
 * HTML: a disabled fieldset disables its descendants except those of its
 * first child `legend`.
 */
function insideDisabledFieldset($: CheerioAPI, el: Element): boolean {
  let node: AnyNode | null = el;
  while (node) {
    if (isElement(node) && node.name.toLowerCase() === 'fieldset' && $(node).attr('disabled') != null) {
      const firstLegend = $(node).children('legend').first()[0];
      const exempt = firstLegend && isElement(firstLegend) && isDescendantOrSelf(el, firstLegend);
      if (!exempt) return true;
    }
    node = parentOf(node);
  }
  return false;
}

function textData(node: AnyNode): string {
  return 'data' in node && typeof (node as { data?: unknown }).data === 'string'
    ? (node as { data: string }).data
    : '';
}

function stripFormatChars(text: string): string {
  return text.replace(FORMAT_CHARS, '');
}

function countRe(text: string, re: RegExp): number {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  return (text.match(new RegExp(re.source, flags)) || []).length;
}

function walkEveryNode(root: AnyNode | null, visit: (node: AnyNode) => 'skip-children' | void): void {
  if (!root) return;
  const stack: AnyNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (visit(node) === 'skip-children') continue;
    if ('children' in node && Array.isArray(node.children)) {
      for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
    }
  }
}

/** Concatenate descendant text nodes whose direct parent is allowlisted and visible. */
function allowlistedText($: CheerioAPI, root: AnyNode): string {
  const bits: string[] = [];
  const stack: AnyNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (node.type === 'text') {
      if (textParentAllowed($, node)) bits.push($(node).text());
      continue;
    }
    if (!isElement(node) || !isAllowedElement(node) || hiddenChain($, node)) continue;
    if ('children' in node && Array.isArray(node.children)) {
      for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
    }
  }
  return bits.join('').replace(/\s+/g, ' ').trim();
}

function directText($: CheerioAPI, el: Element): string {
  return $(el)
    .contents()
    .toArray()
    .filter((node) => node.type === 'text' && textParentAllowed($, node))
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

function aroundOrInsideRawTextOrFrame($: CheerioAPI, el: Element): boolean {
  const node = $(el);
  return node.closest(RAW_TEXT_OR_FRAME).length > 0 || node.find(RAW_TEXT_OR_FRAME).length > 0;
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
      if (!isElement(el) || !usableAncestry($, el) || !predicate(el)) return;
      const nested = $(el).find('*').toArray().some((child) => isElement(child) && usableAncestry($, child) && predicate(child));
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
      if (!textParentAllowed($, node)) return '';
      bits.push($(node).text());
      continue;
    }
    break;
  }
  return bits.join('');
}

function remainderHasBareNavToken(remainder: string, token: string): boolean {
  const decoded = decodeCommaEntities(remainder).replace(/^\s+/, '').replace(/\s+$/, '');
  return decoded === token;
}

function nextCodePoint(text: string, index: number): string | undefined {
  if (index >= text.length) return undefined;
  const cp = text.codePointAt(index);
  if (cp == null) return undefined;
  return String.fromCodePoint(cp);
}

function tokenContinues(next: string | undefined): boolean {
  return Boolean(next && BOUNDARY_CONTINUE.test(next));
}

function monedaKind(label: string): 'ARS' | 'USD' | 'other' {
  const folded = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  const usd = /DOLAR|DOLLAR|USD|U\$S|US\$/.test(folded);
  const ars = /PESO|ARS/.test(folded);
  if (usd && !ars) return 'USD';
  if (ars && !usd) return 'ARS';
  return 'other';
}

function isClaseControl($: CheerioAPI, el: Element): boolean {
  const name = el.name.toLowerCase();
  if (name !== 'select' && name !== 'input') return false;
  return attrCi($, el, 'name') === 'clase' || attrCi($, el, 'id') === 'clase';
}

function countRaw(html: string, re: RegExp): number {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  return (html.match(new RegExp(re.source, flags)) || []).length;
}

function hasBaseHref(html: string): boolean {
  const tags = html.match(/<base\b[^>]*>/gi) || [];
  return tags.some((tag) => /\bhref\s*=/i.test(tag));
}

function hasMetaRefresh(html: string): boolean {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  return tags.some((tag) => /\bhttp-equiv\s*=\s*(["']?)refresh\1/i.test(tag));
}

function hasNonWhitespaceAfterHtml(html: string): boolean {
  const close = html.toLowerCase().lastIndexOf('</html>');
  if (close < 0) return false;
  return html.slice(close + '</html>'.length).trim() !== '';
}

function documentUniquenessOk($: CheerioAPI, html: string): boolean {
  const fundForms = $('form').toArray().filter(isElement).filter((el) => Boolean(fondoIdFromAction($(el).attr('action'))));
  const claseControls = $('*').toArray().filter(isElement).filter((el) => isClaseControl($, el));
  const cuotaIds = $('*').toArray().filter(isElement).filter((el) => attrCi($, el, 'id') === 'cuotaparte');
  if (fundForms.length !== 1) return false;
  if (claseControls.length !== 1) return false;
  if (cuotaIds.length !== 1) return false;
  if (countRaw(html, /<form\b[^>]*\baction\s*=\s*["'][^"']*fondos\/\d+/i) !== 1) return false;
  if (countRaw(html, /<select\b[^>]*\b(?:name|id)\s*=\s*(["']?)clase\1/i) !== 1) return false;
  if (countRaw(html, /\bid\s*=\s*(["']?)cuotaparte\1/i) !== 1) return false;

  let navDom = 0;
  let valoresDom = 0;
  let monedaDom = 0;
  const root = $.root()[0];
  walkEveryNode(root, (node) => {
    if (isElement(node) && attrCi($, node, 'id') === 'cartera') return 'skip-children';
    if (node.type === 'script' || node.type === 'style') {
      const raw = textData(node) || $(node).text();
      navDom += countRe(raw, /por cada cuotaparte/gi);
      valoresDom += countRe(raw, /Valores al\s+/gi);
      monedaDom += countRe(raw, /Moneda:/g);
      return 'skip-children';
    }
    if (node.type !== 'text' && node.type !== 'comment') return;
    const raw = textData(node);
    if (!raw) return;
    navDom += countRe(raw, /por cada cuotaparte/gi);
    valoresDom += countRe(raw, /Valores al\s+/gi);
    monedaDom += countRe(raw, /Moneda:/g);
  });
  if (navDom !== 1 || countRaw(html, /por cada cuotaparte/gi) !== 1) return false;
  if (valoresDom !== 1) return false;
  if (monedaDom !== 1 || countRaw(html, /Moneda:/g) !== 1) return false;
  return true;
}

function parseIdentity(
  $: CheerioAPI,
  expected?: { fondoId: string; claseId: string }
): { fondoId: string; claseId: string } | { fail: CafciHtmlParseFail } {
  const fundForms = $('form').toArray()
    .filter(isElement)
    .filter((el) => usableAncestry($, el))
    .map((el) => ({ el, fondoId: fondoIdFromAction($(el).attr('action')) }))
    .filter((row): row is { el: Element; fondoId: string } => Boolean(row.fondoId));
  if (fundForms.some((row) => aroundOrInsideRawTextOrFrame($, row.el))) {
    return { fail: 'unparseable_ficha' };
  }
  if (fundForms.length !== 1) return { fail: 'unparseable_ficha' };
  const fundForm = fundForms[0];
  if (insideDisabledFieldset($, fundForm.el)) {
    return { fail: 'unparseable_ficha' };
  }

  const selects = $('select').toArray()
    .filter(isElement)
    .filter((el) => isClaseControl($, el) && usableAncestry($, el));
  if (selects.length !== 1) return { fail: 'unparseable_ficha' };
  const select = selects[0];
  if ($(select).closest('form')[0] !== fundForm.el) return { fail: 'unparseable_ficha' };
  if (aroundOrInsideRawTextOrFrame($, select)) return { fail: 'unparseable_ficha' };
  if ($(select).attr('disabled') != null) return { fail: 'unparseable_ficha' };
  if (insideDisabledFieldset($, select)) return { fail: 'unparseable_ficha' };

  const options = $(select).find('option').toArray().filter(isElement);
  const values = options.map((opt) => ($(opt).attr('value') ?? '').trim());
  if (values.some((value) => !value) || new Set(values).size !== values.length) {
    return { fail: 'unparseable_ficha' };
  }

  const selected = $(select).find('option[selected]').toArray().filter(isElement);
  if (selected.length !== 1) return { fail: 'unparseable_ficha' };
  if (!usableAncestry($, selected[0])) return { fail: 'unparseable_ficha' };
  if ($(selected[0]).attr('disabled') != null) return { fail: 'unparseable_ficha' };
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

function navTokenFromSectionText(text: string): string | null {
  const stripped = stripFormatChars(text);
  const mentions = stripped.match(/por cada cuotaparte/gi);
  if (!mentions || mentions.length !== 1) return null;
  const labelled = stripped.match(/Valor por cada cuotaparte:\s*/i);
  if (!labelled || labelled.index == null) return null;
  const rest = stripped.slice(labelled.index + labelled[0].length).trimStart();
  const token = rest.match(NAV_TOKEN_PREFIX);
  if (!token) return null;
  const next = nextCodePoint(rest, token[0].length);
  if (tokenContinues(next)) return null;
  return token[0];
}

function parseNavPrice($: CheerioAPI, section: Element): number | null {
  const nodes = innermostIn($, section, (el) => /Valor por cada cuotaparte:/i.test(allowlistedText($, el)));
  if (nodes.length !== 1) return null;
  const el = nodes[0];
  const own = stripFormatChars(directText($, el));
  const labelled = own.match(CUOTAPARTE_LABEL);
  let token = labelled ? labelled[1].trim() : '';
  let remainder = '';
  const inner = decodeCommaEntities($(el).html() ?? '');
  const innerMatch = inner.match(/Valor por cada cuotaparte:\s*/i);
  if (innerMatch && innerMatch.index != null) {
    remainder = inner.slice(innerMatch.index + innerMatch[0].length);
  }
  if (!token) {
    token = stripFormatChars(followingText($, el).replace(/\s+/g, ' ').trim());
    remainder = followingSiblingHtml($, el);
  }
  if (!token || !CAFCI_NAV_TOKEN.test(token)) return null;
  if (!remainderHasBareNavToken(remainder, token)) return null;
  const nodePrice = parseArgentineNumber(token);
  if (nodePrice == null || !Number.isFinite(nodePrice) || nodePrice <= 0) return null;

  const blockToken = navTokenFromSectionText(allowlistedText($, section));
  if (!blockToken) return null;
  const blockPrice = parseArgentineNumber(blockToken);
  if (blockPrice == null || blockPrice !== nodePrice) return null;
  return nodePrice;
}

function parseValoresAl($: CheerioAPI, section: Element): string | null {
  const nodes = innermostIn($, section, (el) => /Valores al\s+/i.test(allowlistedText($, el)));
  if (nodes.length !== 1) return null;
  const match = allowlistedText($, nodes[0]).match(VALORES_AL);
  if (!match) return null;
  const timestamp = parseCafciDateLabel(match[1]);
  if (!timestamp) return null;

  const dates = [...allowlistedText($, section).matchAll(DMY)]
    .map((row) => parseCafciDateLabel(row[1]))
    .filter((iso): iso is string => Boolean(iso));
  if (dates.length === 0) return null;
  if (dates.some((iso) => iso !== timestamp)) return null;
  return timestamp;
}

function monedaValueFromLabelEl($: CheerioAPI, el: Element): string | null {
  const own = directText($, el);
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

function collectMonedaLabels($: CheerioAPI): string[] {
  const labels: string[] = [];
  $('*').each((_, el) => {
    if (!isElement(el) || !usableAncestry($, el)) return;
    if ($(el).closest(`script, style, noscript, template, #cartera, ${RAW_TEXT_OR_FRAME}`).length > 0) {
      return;
    }
    const value = monedaValueFromLabelEl($, el);
    if (value) labels.push(value);
  });
  return labels;
}

function uniqueMonedaLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const label of labels) {
    const key = label.replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(label);
  }
  return unique;
}

function currenciesAgree(chosen: string, mentions: string[]): boolean {
  const chosenKind = monedaKind(chosen);
  if (chosenKind === 'other') {
    return mentions.every((label) => label.replace(/\s+/g, ' ').trim() === chosen.replace(/\s+/g, ' ').trim());
  }
  return mentions.every((label) => monedaKind(label) === chosenKind);
}

function hasExactMonedaLabelText($: CheerioAPI, root: Element): boolean {
  const stack: AnyNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (node.type === 'text') {
      if (textParentAllowed($, node) && textData(node).trim() === 'Moneda:') return true;
      continue;
    }
    if (!isElement(node) || !isAllowedElement(node) || hiddenChain($, node)) continue;
    if ('children' in node && Array.isArray(node.children)) {
      for (const child of node.children) stack.push(child);
    }
  }
  return false;
}

/** Live CAFCI fichas put Datos del Fondo (including an exact `Moneda:` label) in `#fichaRight`. */
function hasMonedaInFichaMain($: CheerioAPI): boolean {
  const mains = $('*').toArray()
    .filter(isElement)
    .filter((el) => attrCi($, el, 'id') === 'ficharight' && usableAncestry($, el));
  if (mains.length !== 1) return false;
  return hasExactMonedaLabelText($, mains[0]);
}

export function parseCafciHtmlFichaDetailed(
  html: string,
  expected?: { fondoId: string; claseId: string }
): CafciHtmlParseResult {
  if (!html || typeof html !== 'string') return { parsed: null, reason: 'unparseable_ficha' };
  if (hasBaseHref(html) || hasMetaRefresh(html) || hasNonWhitespaceAfterHtml(html)) {
    return { parsed: null, reason: 'unparseable_ficha' };
  }
  const $ = load(html);
  if (!documentUniquenessOk($, html)) return { parsed: null, reason: 'unparseable_ficha' };

  const identity = parseIdentity($, expected);
  if ('fail' in identity) return { parsed: null, reason: identity.fail };

  const sections = $('*').toArray()
    .filter(isElement)
    .filter((el) => attrCi($, el, 'id') === 'cuotaparte' && usableAncestry($, el));
  if (sections.length !== 1) return { parsed: null, reason: 'unparseable_ficha' };
  const section = sections[0];
  if (aroundOrInsideRawTextOrFrame($, section)) return { parsed: null, reason: 'unparseable_ficha' };
  if (subtreeHasComment(section)) return { parsed: null, reason: 'unparseable_ficha' };

  const price = parseNavPrice($, section);
  if (price == null) return { parsed: null, reason: 'unparseable_ficha' };
  const timestamp = parseValoresAl($, section);
  if (!timestamp) return { parsed: null, reason: 'unparseable_ficha' };
  if (!hasMonedaInFichaMain($)) {
    return { parsed: null, reason: 'unparseable_ficha' };
  }
  const mentions = uniqueMonedaLabels(collectMonedaLabels($));
  if (mentions.length === 0) return { parsed: null, reason: 'unparseable_ficha' };
  const monedaLabel = mentions[0];
  if (!currenciesAgree(monedaLabel, mentions)) {
    return { parsed: null, reason: 'unparseable_ficha' };
  }

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
