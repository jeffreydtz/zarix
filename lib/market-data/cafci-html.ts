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
 * candidate (two raw `Valores al`, of which one is `#cartera`). Extra identical
 * `Moneda:` values count as one; conflicting values skip. Any extra identity,
 * NAV, date, or cuotaparte id skips.
 * The single candidate must then sit on an HTML-namespace allowlist chain
 * through `<body>` then `<html>` and must not be hidden (`hidden`,
 * `aria-hidden="true"`, `inert`, closed `details`/`dialog`, or an inline style
 * whose winning `display`/`visibility` declaration (comments stripped;
 * `!important` beats a later non-important) is `none` / `hidden`/`collapse`).
 * External and class-based CSS cannot be checked and is an accepted limit.
 *
 * Text values come only from text nodes whose direct parent is allowlisted and
 * visible. One rendered visible-text string is built for `#cuotaparte` (and for
 * each Moneda block): the same visibility rules, with block boundaries and
 * `<br>` as whitespace. After a NAV token skip `[\p{Zs}\s\p{Cf}]*`; a following
 * letter, digit, `.`, `,` or `-` skips. Only `(` or end-of-string is allowed,
 * wrapper-independent. The same tail rule runs on the `Valores al` date's
 * containing block; leftover digits after the date in the section also skip.
 * Hidden/non-allowlisted nodes never terminate a token: if one sits inside the
 * token (or between it and further visible digits/letters), skip. The
 * unfiltered descendant-text cross-check must yield the same token. That
 * unfiltered string includes comment data and the raw text of `template`
 * (its inner document), `noscript`, `script`, `style`, `iframe`, `textarea`,
 * `xmp` and `plaintext`. The same tail rule runs on it: a letter, digit, `.`
 * or `,` after the token skips. `#cuotaparte` and the Moneda block also skip
 * when they contain `template`, `noscript`, `iframe`, `object`, `embed`,
 * `script` or `style` (none of the 28 live fichas captured 2026-10-26 have
 * those inside either block). Unicode Cf/format characters (ZWSP, BOM/U+FEFF,
 * bidi, soft hyphens) are stripped before any whitespace normalization so they
 * never become a space. `<base href>`, `<meta http-equiv=refresh>`, and
 * non-whitespace after `</html>` fail closed (live fichas have none of those
 * except a trailing newline after `</html>`).
 *
 * Accepted limits (not checked): CSS from `<style>` or external stylesheets
 * (pseudo-element replacement, class hiding); parse5 hoisting a hidden wrapper
 * out of `<select>`; first-wins duplicate attributes; fichas without identity
 * controls skip.
 */

import { load, type CheerioAPI } from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import { parseArgentineNumber } from '@/lib/market-data/argentine-number';
import { parseCafciDateLabel } from '@/lib/market-data/fci-nav-freshness';

export const CAFCI_NAV_TOKEN = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/;
const NAV_TOKEN_PREFIX = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?/;
const CUOTAPARTE_LABEL = /^Valor por cada cuotaparte:\s*(.*)$/i;
const RAW_TEXT_OR_FRAME = 'iframe, noembed, noframes, plaintext, xmp, textarea, title';
const DMY = /(?<!\d)(\d{2}\/\d{2}\/\d{4})(?!\d)/g;
const FORMAT_CHARS = /\p{Cf}/gu;
const HTML_NS = 'http://www.w3.org/1999/xhtml';
const DATE_TAIL_CONTINUE = /[\p{N}.,\-\/]/u;
/** Present in neither `#cuotaparte` nor the Moneda block on the 28 live fichas. */
const INERT_CARRIERS = new Set([
  'template', 'noscript', 'iframe', 'object', 'embed', 'script', 'style',
]);

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

function stripCssComments(style: string): string {
  return style.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, '');
}

/**
 * Inline cascade: comments stripped first; `!important` beats a later
 * non-important declaration of the same property; later `!important` still wins.
 * Not a substring match.
 */
export function parseInlineStyleDeclarations(style: string): Map<string, string> {
  const decls = new Map<string, string>();
  const important = new Map<string, boolean>();
  for (const raw of stripCssComments(style).split(';')) {
    const part = raw.trim();
    if (!part) continue;
    const colon = part.indexOf(':');
    if (colon <= 0) continue;
    const prop = part.slice(0, colon).trim().toLowerCase();
    let value = part.slice(colon + 1).trim();
    const isImportant = /!\s*important\s*$/i.test(value);
    value = value.replace(/!\s*important\s*$/i, '').trim().toLowerCase();
    if (!prop) continue;
    if (important.get(prop) && !isImportant) continue;
    if (!isValidInlineValue(prop, value)) continue;
    decls.set(prop, value);
    important.set(prop, isImportant);
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

/** Strip Cf/BOM/soft-hyphen before whitespace so U+FEFF never becomes a space. */
function normalizeFichaText(text: string): string {
  return stripFormatChars(text).replace(/\s+/g, ' ').trim();
}

const TAIL_GAP = /[\s\p{Zs}\p{Cf}]/u;
/** CSS Display 3 keywords, including two-value `outside inside` tokens. */
const DISPLAY_KEYWORDS = new Set([
  'none', 'contents',
  'block', 'inline', 'run-in',
  'flow', 'flow-root', 'table', 'flex', 'grid', 'ruby',
  'list-item',
  'table-row-group', 'table-header-group', 'table-footer-group',
  'table-row', 'table-cell', 'table-column-group', 'table-column', 'table-caption',
  'ruby-base', 'ruby-text', 'ruby-base-container', 'ruby-text-container',
  'inline-block', 'inline-table', 'inline-flex', 'inline-grid',
  'initial', 'inherit', 'unset', 'revert', 'revert-layer',
]);
const VALID_VISIBILITY = new Set([
  'visible', 'hidden', 'collapse', 'initial', 'inherit', 'unset', 'revert', 'revert-layer',
]);
const BLOCK_TAGS = new Set([
  'html', 'body', 'div', 'section', 'main', 'header', 'article', 'aside', 'nav', 'footer',
  'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'hr', 'fieldset', 'address',
]);
const MONEDA_WHITELIST_FOLD = new Set([
  'PESO ARGENTINA',
  'DOLAR ESTADOUNIDENSE',
  'DOLAR ESTADOUNIDENSE BILLETE',
]);

function isValidDisplay(value: string): boolean {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  if (tokens.some((token) => !DISPLAY_KEYWORDS.has(token))) return false;
  if (tokens.includes('none') || tokens.includes('contents')) return tokens.length === 1;
  return true;
}

function isValidInlineValue(prop: string, value: string): boolean {
  if (prop === 'display') return isValidDisplay(value);
  if (prop === 'visibility') return VALID_VISIBILITY.has(value);
  return true;
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
  return normalizeFichaText(bits.join(''));
}

type RenderedText = { text: string; skips: number[] };

function isBlockElement(el: Element): boolean {
  return isBlockTag(el.name.toLowerCase());
}

function isBlockTag(name: string): boolean {
  return BLOCK_TAGS.has(name);
}

function containingBlock(el: Element): Element {
  let node: AnyNode | null = el;
  while (node) {
    if (isElement(node) && isBlockTag(node.name.toLowerCase())) return node;
    node = parentOf(node);
  }
  return el;
}

function elementChildren(node: AnyNode): AnyNode[] {
  return 'children' in node && Array.isArray(node.children) ? node.children : [];
}

/**
 * Document-order visible (or unfiltered) text. Block boundaries and `<br>`
 * become a space. Cf is stripped on emit. `skips` are visible-string offsets
 * where a hidden or non-allowlisted subtree sat.
 */
function renderedText($: CheerioAPI, root: AnyNode, mode: 'visible' | 'unfiltered'): RenderedText {
  const bits: string[] = [];
  const skips: number[] = [];
  let length = 0;

  const emit = (chunk: string): void => {
    if (!chunk) return;
    bits.push(chunk);
    length += chunk.length;
  };

  const walk = (node: AnyNode): void => {
    if (node.type === 'text') {
      if (mode === 'visible' && !textParentAllowed($, node)) return;
      emit(stripFormatChars(textData(node)));
      return;
    }
    if (node.type === 'comment' || node.type === 'script' || node.type === 'style') {
      if (mode === 'visible') {
        skips.push(length);
        return;
      }
      if (node.type === 'comment') {
        emit(stripFormatChars(textData(node)));
        return;
      }
      for (const child of elementChildren(node)) walk(child);
      return;
    }
    if (!isElement(node)) {
      for (const child of elementChildren(node)) walk(child);
      return;
    }
    const name = node.name.toLowerCase();
    if (name === 'br') {
      emit(' ');
      return;
    }
    if (mode === 'visible' && (!isAllowedElement(node) || hiddenChain($, node))) {
      skips.push(length);
      return;
    }
    const block = isBlockElement(node) && node !== root;
    if (block) emit(' ');
    for (const child of elementChildren(node)) walk(child);
    if (block) emit(' ');
  };

  walk(root);
  return { text: bits.join(''), skips };
}

function renderedVisible($: CheerioAPI, root: AnyNode): RenderedText {
  return renderedText($, root, 'visible');
}

function renderedUnfiltered($: CheerioAPI, root: AnyNode): RenderedText {
  return renderedText($, root, 'unfiltered');
}

function tailIsParenOrEof(text: string, index: number): boolean {
  const i = skipTailGap(text, index);
  if (i >= text.length) return true;
  return nextCodePoint(text, i) === '(';
}

function skipInsideToken(skips: number[], tokenStart: number, tokenEnd: number): boolean {
  return skips.some((offset) => offset > tokenStart && offset < tokenEnd);
}

function containsInertCarrier(root: AnyNode): boolean {
  let found = false;
  walkEveryNode(root, (node) => {
    if (found) return 'skip-children';
    if (node.type === 'script' || node.type === 'style') {
      found = true;
      return 'skip-children';
    }
    if (isElement(node) && INERT_CARRIERS.has(node.name.toLowerCase())) {
      found = true;
      return 'skip-children';
    }
  });
  return found;
}

function descendantTextRaw(root: AnyNode): string {
  const bits: string[] = [];
  walkEveryNode(root, (node) => {
    if (node.type === 'text') bits.push(textData(node));
  });
  return bits.join('');
}

function directText($: CheerioAPI, el: Element): string {
  return normalizeFichaText(
    $(el)
      .contents()
      .toArray()
      .filter((node) => node.type === 'text' && textParentAllowed($, node))
      .map((node) => $(node).text())
      .join(''),
  );
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

function skipTailGap(text: string, index: number): number {
  let i = index;
  while (i < text.length) {
    const cp = nextCodePoint(text, i);
    if (!cp || !TAIL_GAP.test(cp)) break;
    i += cp.length;
  }
  return i;
}

function foldMoneda(label: string): string {
  return stripFormatChars(label)
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase();
}

function monedaKind(label: string): 'ARS' | 'USD' | 'other' {
  const folded = foldMoneda(label);
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

function extractMonedaValues(blob: string, skips: number[] = []): string[] {
  const labels = [...blob.matchAll(/Moneda:/gi)];
  const values: string[] = [];
  for (let i = 0; i < labels.length; i++) {
    const start = (labels[i].index ?? 0) + labels[i][0].length;
    const end = i + 1 < labels.length ? (labels[i + 1].index ?? blob.length) : blob.length;
    if (skips.some((offset) => offset >= start && offset <= end)) {
      values.push('\u0000');
      continue;
    }
    const value = normalizeFichaText(blob.slice(start, end));
    if (value) values.push(value);
  }
  return values;
}

function isWhitelistedMoneda(label: string): boolean {
  return MONEDA_WHITELIST_FOLD.has(foldMoneda(label));
}

function documentMonedaValues($: CheerioAPI): string[] {
  const values: string[] = [];
  const seen = new Set<Element>();
  const root = $.root()[0];
  walkEveryNode(root, (node) => {
    if (isElement(node) && attrCi($, node, 'id') === 'cartera') return 'skip-children';
    if (node.type === 'script' || node.type === 'style') {
      values.push(...extractMonedaValues(textData(node) || $(node).text()));
      return 'skip-children';
    }
    if (node.type === 'comment') {
      values.push(...extractMonedaValues(textData(node)));
      return;
    }
    if (node.type !== 'text') return;
    const raw = textData(node);
    if (!/Moneda:/i.test(raw)) return;
    const parent = parentOf(node);
    if (!parent || !isElement(parent)) {
      values.push(...extractMonedaValues(raw));
      return;
    }
    const block = containingBlock(parent);
    if (seen.has(block)) return;
    seen.add(block);
    values.push(...extractMonedaValues(descendantTextRaw(block)));
  });
  return values;
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
  const root = $.root()[0];
  walkEveryNode(root, (node) => {
    if (isElement(node) && attrCi($, node, 'id') === 'cartera') return 'skip-children';
    if (node.type === 'script' || node.type === 'style') {
      const raw = textData(node) || $(node).text();
      navDom += countRe(raw, /por cada cuotaparte/gi);
      valoresDom += countRe(raw, /Valores al\s+/gi);
      return 'skip-children';
    }
    if (node.type !== 'text' && node.type !== 'comment') return;
    const raw = textData(node);
    if (!raw) return;
    navDom += countRe(raw, /por cada cuotaparte/gi);
    valoresDom += countRe(raw, /Valores al\s+/gi);
  });
  if (navDom !== 1 || countRaw(html, /por cada cuotaparte/gi) !== 1) return false;
  if (valoresDom !== 1) return false;
  const monedaValues = documentMonedaValues($);
  if (monedaValues.length === 0) return false;
  const uniqueMoneda = uniqueMonedaLabels(monedaValues);
  if (uniqueMoneda.length === 0 || uniqueMoneda.some((label) => !isWhitelistedMoneda(label))) return false;
  if (!currenciesAgree(uniqueMoneda[0], uniqueMoneda)) return false;
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

/**
 * NAV token from rendered (or unfiltered) text. After the match, skip Zs/Cf/`\s`.
 * Only `(` or end-of-string is allowed. A skip offset inside the token means a
 * hidden/non-allowlisted node sat between digits and is not a terminator.
 */
function navTokenFromRendered(text: string, skips: number[] = []): string | null {
  const stripped = stripFormatChars(text);
  const mentions = stripped.match(/por cada cuotaparte/gi);
  if (!mentions || mentions.length !== 1) return null;
  const labelled = stripped.match(/Valor por cada cuotaparte:\s*/i);
  if (!labelled || labelled.index == null) return null;
  const tokenAt = skipTailGap(stripped, labelled.index + labelled[0].length);
  const token = stripped.slice(tokenAt).match(NAV_TOKEN_PREFIX);
  if (!token) return null;
  const tokenEnd = tokenAt + token[0].length;
  if (skipInsideToken(skips, tokenAt, tokenEnd)) return null;
  if (!tailIsParenOrEof(stripped, tokenEnd)) return null;
  return token[0];
}

function dateFromRendered(
  text: string,
  skips: number[],
  tail: 'paren-or-eof' | 'no-numeric-continue',
): string | null {
  const stripped = stripFormatChars(text);
  const mentions = stripped.match(/Valores al\s+/gi);
  if (!mentions || mentions.length !== 1) return null;
  const labelled = stripped.match(/Valores al\s+(\d{2}\/\d{2}\/\d{4})/i);
  if (!labelled || labelled.index == null) return null;
  const date = labelled[1];
  const dateStart = labelled.index + labelled[0].length - date.length;
  const dateEnd = labelled.index + labelled[0].length;
  if (skipInsideToken(skips, dateStart, dateEnd)) return null;
  const nextAt = skipTailGap(stripped, dateEnd);
  const next = nextCodePoint(stripped, nextAt);
  if (tail === 'paren-or-eof') {
    if (next != null && next !== '(') return null;
  } else if (next && DATE_TAIL_CONTINUE.test(next)) {
    return null;
  }
  return date;
}

function sectionHasCssContentReplacement($: CheerioAPI, root: Element): boolean {
  let found = false;
  walkEveryNode(root, (node) => {
    if (found || !isElement(node)) return;
    const decls = parseInlineStyleDeclarations($(node).attr('style') ?? '');
    const content = decls.get('content');
    if (!content || content === 'none' || content === 'normal' || content === 'initial'
      || content === 'inherit' || content === 'unset' || content === 'revert' || content === 'revert-layer') {
      return;
    }
    found = true;
  });
  return found;
}

function parseNavPrice($: CheerioAPI, section: Element): number | null {
  if (containsInertCarrier(section)) return null;
  const nodes = innermostIn($, section, (el) => /Valor por cada cuotaparte:/i.test(allowlistedText($, el)));
  if (nodes.length !== 1) return null;
  const el = nodes[0];
  const visible = renderedVisible($, section);
  const token = navTokenFromRendered(visible.text, visible.skips);
  if (!token || !CAFCI_NAV_TOKEN.test(token)) return null;
  const unfiltered = navTokenFromRendered(renderedUnfiltered($, section).text);
  if (!unfiltered || unfiltered !== token) return null;
  if (sectionHasCssContentReplacement($, section)) return null;

  const own = stripFormatChars(directText($, el));
  const labelled = own.match(CUOTAPARTE_LABEL);
  let nodeToken = labelled ? labelled[1].trim() : '';
  let remainder = '';
  const inner = decodeCommaEntities($(el).html() ?? '');
  const innerMatch = inner.match(/Valor por cada cuotaparte:\s*/i);
  if (innerMatch && innerMatch.index != null) {
    remainder = inner.slice(innerMatch.index + innerMatch[0].length);
  }
  if (!nodeToken) {
    nodeToken = normalizeFichaText(followingText($, el));
    remainder = followingSiblingHtml($, el);
  }
  if (nodeToken) {
    if (!CAFCI_NAV_TOKEN.test(nodeToken) || nodeToken !== token) return null;
    if (!remainderHasBareNavToken(remainder, nodeToken)) return null;
  } else {
    const blockInner = decodeCommaEntities($(containingBlock(el)).html() ?? '');
    const blockMatch = blockInner.match(/Valor por cada cuotaparte:\s*/i);
    if (!blockMatch || blockMatch.index == null) return null;
    if (!remainderHasBareNavToken(blockInner.slice(blockMatch.index + blockMatch[0].length), token)) {
      return null;
    }
  }

  const price = parseArgentineNumber(token);
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  return price;
}

function parseValoresAl($: CheerioAPI, section: Element): string | null {
  if (containsInertCarrier(section)) return null;
  const nodes = innermostIn($, section, (el) => /Valores al\s+/i.test(allowlistedText($, el)));
  if (nodes.length !== 1) return null;
  const block = containingBlock(nodes[0]);
  const blockVisible = renderedVisible($, block);
  const blockDate = dateFromRendered(blockVisible.text, blockVisible.skips, 'paren-or-eof');
  if (!blockDate) return null;
  const sectionVisible = renderedVisible($, section);
  const sectionDate = dateFromRendered(sectionVisible.text, sectionVisible.skips, 'no-numeric-continue');
  if (sectionDate !== blockDate) return null;
  const unfilteredDate = dateFromRendered(renderedUnfiltered($, section).text, [], 'no-numeric-continue');
  if (unfilteredDate !== blockDate) return null;
  const timestamp = parseCafciDateLabel(blockDate);
  if (!timestamp) return null;

  const dates = [...normalizeFichaText(sectionVisible.text).matchAll(DMY)]
    .map((row) => parseCafciDateLabel(row[1]))
    .filter((iso): iso is string => Boolean(iso));
  if (dates.length === 0) return null;
  if (dates.some((iso) => iso !== timestamp)) return null;
  return timestamp;
}

function monedaValuesFromBlock($: CheerioAPI, block: Element, mode: 'visible' | 'unfiltered'): string[] {
  const rendered = renderedText($, block, mode);
  return extractMonedaValues(rendered.text, mode === 'visible' ? rendered.skips : []);
}

function collectMonedaBlocks($: CheerioAPI): Element[] {
  const rootEl = ($('body')[0] ?? $.root()[0]) as Element | undefined;
  if (!rootEl || !isElement(rootEl)) return [];
  const seen = new Set<Element>();
  const blocks: Element[] = [];
  for (const el of innermostIn($, rootEl, (node) => /Moneda:/i.test(allowlistedText($, node)))) {
    if ($(el).closest(`script, style, noscript, template, #cartera, ${RAW_TEXT_OR_FRAME}`).length > 0) {
      continue;
    }
    const block = containingBlock(el);
    if (seen.has(block)) continue;
    seen.add(block);
    blocks.push(block);
  }
  return blocks;
}

function uniqueMonedaLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const label of labels) {
    const stored = normalizeFichaText(label);
    const key = foldMoneda(stored);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(stored);
  }
  return unique;
}

function currenciesAgree(chosen: string, mentions: string[]): boolean {
  const key = foldMoneda(chosen);
  return Boolean(key) && mentions.every((label) => foldMoneda(label) === key);
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
  const monedaBlocks = collectMonedaBlocks($);
  const visibleValues: string[] = [];
  for (const block of monedaBlocks) {
    if (containsInertCarrier(block)) return { parsed: null, reason: 'unparseable_ficha' };
    const visible = monedaValuesFromBlock($, block, 'visible');
    const unfiltered = monedaValuesFromBlock($, block, 'unfiltered');
    if (visible.length === 0 || visible.length !== unfiltered.length) {
      return { parsed: null, reason: 'unparseable_ficha' };
    }
    for (let i = 0; i < visible.length; i++) {
      if (!isWhitelistedMoneda(visible[i]) || !isWhitelistedMoneda(unfiltered[i])) {
        return { parsed: null, reason: 'unparseable_ficha' };
      }
      if (foldMoneda(visible[i]) !== foldMoneda(unfiltered[i])) {
        return { parsed: null, reason: 'unparseable_ficha' };
      }
      visibleValues.push(visible[i]);
    }
  }
  const mentions = uniqueMonedaLabels(visibleValues);
  if (mentions.length === 0) return { parsed: null, reason: 'unparseable_ficha' };
  const monedaLabel = mentions[0];
  if (!isWhitelistedMoneda(monedaLabel) || !currenciesAgree(monedaLabel, mentions)) {
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
