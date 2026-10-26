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
 * `<br>` as whitespace. Boundaries are recorded beside the text, not as a
 * source character. A boundary is a block tag or an element whose inline
 * display has a non-inline outer value (block, flex, grid, table, list-item,
 * flow-root, including two-value syntax). A C0/C1 control other than tab, LF,
 * CR, or FF in `#cuotaparte` or the Moneda block skips. After a NAV token skip
 * `[\p{Zs}\s\p{Cf}]*`; a following letter, digit, `.`, `,` or `-` skips. Only
 * `(` or end-of-string is allowed, wrapper-independent. The `Valores al` date
 * is read only from the label's own element (whitespace plus at most one
 * `<br>` or block child) or from the immediately next `td`/`th` in the same
 * row. A later `p`, heading, footer, row, or empty cell is not a date source.
 * Leftover digits after the date in the section also skip.
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
  'table', 'tbody', 'tr', 'td', 'th',
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
/** C0/C1 controls other than tab, LF, CR, and FF. These are never line boundaries. */
const DISALLOWED_CONTROL = /[\u0000-\u0008\u000B\u000E-\u001F\u0080-\u009F]/;
const DISPLAY_OUTSIDE = new Set(['block', 'inline', 'run-in']);
const DISPLAY_INSIDE = new Set(['flow', 'flow-root', 'table', 'flex', 'grid', 'ruby']);
const DISPLAY_LIST_FLOW = new Set(['flow', 'flow-root']);
const DISPLAY_INTERNAL = new Set([
  'table-row-group', 'table-header-group', 'table-footer-group',
  'table-row', 'table-cell', 'table-column-group', 'table-column', 'table-caption',
  'ruby-base', 'ruby-text', 'ruby-base-container', 'ruby-text-container',
]);
const DISPLAY_LEGACY = new Set([
  'inline-block', 'inline-table', 'inline-flex', 'inline-grid', 'inline-list-item',
]);
const DISPLAY_BOX = new Set(['none', 'contents']);
const DISPLAY_WIDE = new Set(['initial', 'inherit', 'unset', 'revert', 'revert-layer']);
const LEGACY_INLINE = new Set([
  'inline-block', 'inline-table', 'inline-flex', 'inline-grid', 'inline-list-item',
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

/**
 * CSS Display 3 grammar only. Invalid combinations (`flex grid`, `block block`,
 * `inline table-cell`) are rejected so a previous `display:none` keeps winning.
 */
function isValidDisplay(value: string): boolean {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || new Set(tokens).size !== tokens.length) return false;
  if (tokens.length === 1) {
    const token = tokens[0];
    return DISPLAY_OUTSIDE.has(token) || DISPLAY_INSIDE.has(token) || token === 'list-item'
      || DISPLAY_INTERNAL.has(token) || DISPLAY_LEGACY.has(token) || DISPLAY_BOX.has(token)
      || DISPLAY_WIDE.has(token);
  }
  if (tokens.some((token) => DISPLAY_BOX.has(token) || DISPLAY_WIDE.has(token) || DISPLAY_LEGACY.has(token) || DISPLAY_INTERNAL.has(token))) {
    return false;
  }
  if (tokens.includes('list-item')) {
    let outside = 0;
    let flow = 0;
    for (const token of tokens) {
      if (token === 'list-item') continue;
      if (DISPLAY_OUTSIDE.has(token)) outside += 1;
      else if (DISPLAY_LIST_FLOW.has(token)) flow += 1;
      else return false;
    }
    return outside <= 1 && flow <= 1;
  }
  let outside = 0;
  let inside = 0;
  for (const token of tokens) {
    if (DISPLAY_OUTSIDE.has(token)) outside += 1;
    else if (DISPLAY_INSIDE.has(token)) inside += 1;
    else return false;
  }
  return outside <= 1 && inside === 1 && tokens.length === outside + inside;
}

/** Non-inline outer display generates a block boundary. `contents` does not. */
function displayCreatesBlockBoundary(value: string): boolean {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 1) {
    const token = tokens[0];
    if (token === 'none' || token === 'contents' || token === 'inline' || LEGACY_INLINE.has(token)) return false;
    if (DISPLAY_WIDE.has(token)) return false;
    return true;
  }
  if (tokens.includes('inline')) return false;
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

type RenderedText = {
  text: string;
  skips: number[];
  boundaries: number[];
  /** Offset of `anchor`'s children in `text`, when an anchor element was requested. */
  anchorStart: number | null;
};

function isBlockTag(name: string): boolean {
  return BLOCK_TAGS.has(name);
}

function specifiedDisplay($: CheerioAPI, el: Element): string | null {
  const value = parseInlineStyleDeclarations($(el).attr('style') ?? '').get('display');
  return value ?? null;
}

/** Tag default, overridden by a valid inline display (CSS-wide keywords included). */
function isBlockBox($: CheerioAPI, el: Element): boolean {
  const specified = specifiedDisplay($, el);
  if (!specified) return isBlockTag(el.name.toLowerCase());
  if (specified === 'inherit') {
    const parent = parentOf(el);
    return Boolean(parent && isElement(parent) && isBlockBox($, parent));
  }
  if (specified === 'initial' || specified === 'unset') return false;
  if (specified === 'revert' || specified === 'revert-layer') return isBlockTag(el.name.toLowerCase());
  if (specified === 'contents' || specified === 'none') return false;
  return displayCreatesBlockBoundary(specified);
}

function containingBlock($: CheerioAPI, el: Element): Element {
  let node: AnyNode | null = el;
  while (node) {
    if (isElement(node) && isBlockBox($, node)) return node;
    node = parentOf(node);
  }
  return el;
}

function elementChildren(node: AnyNode): AnyNode[] {
  return 'children' in node && Array.isArray(node.children) ? node.children : [];
}

/**
 * Document-order visible (or unfiltered) text. Block boundaries and `<br>`
 * become a space, and their offsets are recorded out of band so a source
 * control character cannot impersonate a boundary. Cf is stripped on emit.
 * `skips` are visible-string offsets where a hidden or non-allowlisted subtree sat.
 */
function renderedText(
  $: CheerioAPI,
  root: AnyNode,
  mode: 'visible' | 'unfiltered',
  anchor?: Element,
): RenderedText {
  const bits: string[] = [];
  const skips: number[] = [];
  const boundaries: number[] = [];
  let anchorStart: number | null = anchor === root ? 0 : null;
  let length = 0;

  const emit = (chunk: string): void => {
    if (!chunk) return;
    bits.push(chunk);
    length += chunk.length;
  };

  const markBoundary = (): void => {
    boundaries.push(length);
    emit(' ');
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
      markBoundary();
      return;
    }
    if (mode === 'visible' && (!isAllowedElement(node) || hiddenChain($, node))) {
      skips.push(length);
      return;
    }
    if (specifiedDisplay($, node) === 'contents') {
      for (const child of elementChildren(node)) walk(child);
      return;
    }
    const block = node !== root && isBlockBox($, node);
    if (block) markBoundary();
    if (anchor && node === anchor) anchorStart = length;
    for (const child of elementChildren(node)) walk(child);
    if (block) markBoundary();
  };

  walk(root);
  return { text: bits.join(''), skips, boundaries, anchorStart };
}

function renderedVisible($: CheerioAPI, root: AnyNode, anchor?: Element): RenderedText {
  return renderedText($, root, 'visible', anchor);
}

function renderedUnfiltered($: CheerioAPI, root: AnyNode, anchor?: Element): RenderedText {
  return renderedText($, root, 'unfiltered', anchor);
}

function subtreeHasDisallowedControl(root: AnyNode): boolean {
  let found = false;
  walkEveryNode(root, (node) => {
    if (found) return;
    if ((node.type === 'text' || node.type === 'comment') && DISALLOWED_CONTROL.test(textData(node))) {
      found = true;
    }
  });
  return found;
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
    const block = monedaScope($, parent);
    if (seen.has(block)) return;
    seen.add(block);
    values.push(...monedaValuesFor(block, renderedUnfiltered($, block)));
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
      valoresDom += countRe(raw, /Valores al(?![\p{L}\p{N}])/giu);
      return 'skip-children';
    }
    if (node.type !== 'text' && node.type !== 'comment') return;
    const raw = textData(node);
    if (!raw) return;
    navDom += countRe(raw, /por cada cuotaparte/gi);
    valoresDom += countRe(raw, /Valores al(?![\p{L}\p{N}])/giu);
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

/** After the date, whitespace may continue the line. A recorded boundary or `(` ends it. */
function dateLineEnds(text: string, index: number, boundaries: Set<number>): boolean {
  let i = index;
  while (i < text.length) {
    if (boundaries.has(i)) return true;
    const cp = nextCodePoint(text, i);
    if (!cp) return true;
    if (!TAIL_GAP.test(cp)) return cp === '(';
    i += cp.length;
  }
  return true;
}

/**
 * Date inside the label element. At most one `<br>` or block-child boundary
 * may sit between the label and the date. `lookNextCell` is set only when the
 * element has no date and no other visible remainder.
 */
function dateFromLabelRender(rendered: RenderedText): { date: string | null; dateStart: number; lookNextCell: boolean } {
  const text = rendered.text;
  const mentions = text.match(/Valores al/gi);
  if (!mentions || mentions.length !== 1) return { date: null, dateStart: -1, lookNextCell: false };
  const labelled = /Valores al/i.exec(text);
  if (!labelled || labelled.index == null) return { date: null, dateStart: -1, lookNextCell: false };
  const bounds = new Set(rendered.boundaries);
  let i = labelled.index + labelled[0].length;
  let boundariesUsed = 0;
  while (i < text.length) {
    if (bounds.has(i)) {
      boundariesUsed += 1;
      if (boundariesUsed > 1) return { date: null, dateStart: -1, lookNextCell: false };
      i += 1;
      continue;
    }
    const cp = nextCodePoint(text, i);
    if (!cp || !TAIL_GAP.test(cp)) break;
    i += cp.length;
  }
  if (i >= text.length) return { date: null, dateStart: -1, lookNextCell: boundariesUsed === 0 };
  const dateMatch = text.slice(i).match(/^(\d{2}\/\d{2}\/\d{4})/);
  if (!dateMatch) return { date: null, dateStart: -1, lookNextCell: false };
  const dateEnd = i + dateMatch[1].length;
  if (skipInsideToken(rendered.skips, i, dateEnd)) return { date: null, dateStart: -1, lookNextCell: false };
  if (!dateLineEnds(text, dateEnd, bounds)) return { date: null, dateStart: -1, lookNextCell: false };
  return { date: dateMatch[1], dateStart: i, lookNextCell: false };
}

function nextElementSibling(el: Element): Element | null {
  const parent = parentOf(el);
  if (!parent) return null;
  const children = elementChildren(parent);
  const idx = children.indexOf(el);
  if (idx < 0) return null;
  for (let i = idx + 1; i < children.length; i++) {
    const child = children[i];
    if (isElement(child)) return child;
  }
  return null;
}

function ancestorCell(el: Element): Element | null {
  let node: AnyNode | null = el;
  while (node) {
    if (isElement(node)) {
      const name = node.name.toLowerCase();
      if (name === 'td' || name === 'th') return node;
      if (name === 'tr' || name === 'table' || name === 'tbody') return null;
    }
    node = parentOf(node);
  }
  return null;
}

function textWithoutBoundaryChars(rendered: RenderedText): string {
  const bounds = new Set(rendered.boundaries);
  let kept = '';
  for (let i = 0; i < rendered.text.length; i++) {
    if (!bounds.has(i)) kept += rendered.text[i];
  }
  return normalizeFichaText(kept);
}

/** The label cell is only the label. Extra visible or unfiltered text skips. */
function cellIsExactValoresAl($: CheerioAPI, cell: Element): boolean {
  const visible = textWithoutBoundaryChars(renderedVisible($, cell));
  const unfiltered = textWithoutBoundaryChars(renderedUnfiltered($, cell));
  return visible === unfiltered && /^Valores al:?$/i.test(visible);
}

/** The cell's text is exactly one date. `dateStart` is its offset in `rendered.text`. */
function exactCellDate(rendered: RenderedText): { date: string; dateStart: number } | null {
  const bounds = new Set(rendered.boundaries);
  let i = 0;
  while (i < rendered.text.length) {
    if (bounds.has(i)) {
      i += 1;
      continue;
    }
    const cp = nextCodePoint(rendered.text, i);
    if (!cp || !TAIL_GAP.test(cp)) break;
    i += cp.length;
  }
  const match = rendered.text.slice(i).match(/^(\d{2}\/\d{2}\/\d{4})/);
  if (!match) return null;
  let rest = i + match[1].length;
  while (rest < rendered.text.length) {
    if (bounds.has(rest)) {
      rest += 1;
      continue;
    }
    const cp = nextCodePoint(rendered.text, rest);
    if (!cp || !TAIL_GAP.test(cp)) return null;
    rest += cp.length;
  }
  return { date: match[1], dateStart: i };
}

function dateFromNextCell($: CheerioAPI, labelEl: Element): { date: string; dateStart: number; cell: Element } | null {
  const cell = ancestorCell(labelEl);
  if (!cell || !cellIsExactValoresAl($, cell)) return null;
  const row = parentOf(cell);
  if (!row || !isElement(row) || row.name.toLowerCase() !== 'tr') return null;
  const next = nextElementSibling(cell);
  if (!next) return null;
  const nextName = next.name.toLowerCase();
  if ((nextName !== 'td' && nextName !== 'th') || parentOf(next) !== row) return null;
  const visible = exactCellDate(renderedVisible($, next));
  const unfiltered = exactCellDate(renderedUnfiltered($, next));
  if (!visible || !unfiltered || visible.date !== unfiltered.date || visible.dateStart !== unfiltered.dateStart) {
    return null;
  }
  return { date: visible.date, dateStart: visible.dateStart, cell: next };
}

/** Tail and numeric-continuation checks at the selected date's offset, not the first copy. */
function selectedDateHolds(text: string, boundaries: number[], offset: number, date: string): boolean {
  if (offset < 0 || text.slice(offset, offset + date.length) !== date) return false;
  const bounds = new Set(boundaries);
  if (!dateLineEnds(text, offset + date.length, bounds)) return false;
  const nextAt = skipTailGap(text, offset + date.length);
  const next = nextCodePoint(text, nextAt);
  return !(next && DATE_TAIL_CONTINUE.test(next));
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
    const blockInner = decodeCommaEntities($(containingBlock($, el)).html() ?? '');
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
  if (containsInertCarrier(section) || subtreeHasDisallowedControl(section)) return null;
  const nodes = innermostIn($, section, (el) => /Valores al(?![\p{L}\p{N}])/iu.test(allowlistedText($, el)));
  if (nodes.length !== 1) return null;
  const labelEl = nodes[0];
  const visibleLabel = renderedVisible($, labelEl);
  const visibleRead = dateFromLabelRender(visibleLabel);
  let blockDate: string | null = null;
  let dateStart = -1;
  let anchor: Element = labelEl;
  if (visibleRead.date) {
    const unfilteredLabel = renderedUnfiltered($, labelEl);
    const unfilteredRead = dateFromLabelRender(unfilteredLabel);
    if (unfilteredRead.date !== visibleRead.date) return null;
    if (!selectedDateHolds(visibleLabel.text, visibleLabel.boundaries, visibleRead.dateStart, visibleRead.date)) {
      return null;
    }
    if (!selectedDateHolds(unfilteredLabel.text, unfilteredLabel.boundaries, unfilteredRead.dateStart, visibleRead.date)) {
      return null;
    }
    blockDate = visibleRead.date;
    dateStart = visibleRead.dateStart;
  } else if (visibleRead.lookNextCell) {
    const next = dateFromNextCell($, labelEl);
    if (!next) return null;
    const visibleCell = renderedVisible($, next.cell);
    const unfilteredCell = renderedUnfiltered($, next.cell);
    if (!selectedDateHolds(visibleCell.text, visibleCell.boundaries, next.dateStart, next.date)) return null;
    if (!selectedDateHolds(unfilteredCell.text, unfilteredCell.boundaries, next.dateStart, next.date)) return null;
    blockDate = next.date;
    dateStart = next.dateStart;
    anchor = next.cell;
  }
  if (!blockDate) return null;
  const sectionVisible = renderedVisible($, section, anchor);
  const sectionUnfiltered = renderedUnfiltered($, section, anchor);
  if (sectionVisible.anchorStart == null || sectionUnfiltered.anchorStart == null) return null;
  if (!selectedDateHolds(sectionVisible.text, sectionVisible.boundaries, sectionVisible.anchorStart + dateStart, blockDate)) {
    return null;
  }
  if (!selectedDateHolds(sectionUnfiltered.text, sectionUnfiltered.boundaries, sectionUnfiltered.anchorStart + dateStart, blockDate)) {
    return null;
  }
  const timestamp = parseCafciDateLabel(blockDate);
  if (!timestamp) return null;

  const dates = [...normalizeFichaText(sectionVisible.text).matchAll(DMY)]
    .map((row) => parseCafciDateLabel(row[1]))
    .filter((iso): iso is string => Boolean(iso));
  if (dates.length === 0) return null;
  if (dates.some((iso) => iso !== timestamp)) return null;
  return timestamp;
}

function renderedLines(rendered: RenderedText): string[] {
  const cuts = [...new Set(rendered.boundaries)].sort((a, b) => a - b);
  const parts: string[] = [];
  let cursor = 0;
  for (const cut of cuts) {
    if (cut > cursor) parts.push(rendered.text.slice(cursor, cut));
    cursor = Math.max(cursor, cut + 1);
  }
  if (cursor < rendered.text.length) parts.push(rendered.text.slice(cursor));
  return parts.map((part) => normalizeFichaText(part)).filter((part) => part.length > 0);
}

/** Longest adjacent run that is a whitelist value. A non-matching segment stops the run. */
function longestAdjacentWhitelist(parts: string[]): string | null {
  let best: string | null = null;
  let acc = '';
  for (const part of parts) {
    acc = normalizeFichaText(`${acc} ${part}`);
    if (!acc) continue;
    if (isWhitelistedMoneda(acc)) {
      best = acc;
      continue;
    }
    if (best) break;
  }
  return best;
}

/** Inside an li/tr the whole remainder after Moneda: is one whitelist value, or nothing. */
function strictRowMoneda(rendered: RenderedText): string | null {
  const labels = [...rendered.text.matchAll(/Moneda:/gi)];
  if (labels.length !== 1 || labels[0].index == null) return null;
  const value = normalizeFichaText(rendered.text.slice(labels[0].index + labels[0][0].length));
  if (!isWhitelistedMoneda(value)) return null;
  return value;
}

function monedaValuesFor(block: Element, rendered: RenderedText): string[] {
  const name = block.name.toLowerCase();
  if (name === 'li' || name === 'tr') {
    const value = strictRowMoneda(rendered);
    return value ? [value] : [];
  }
  return adjacentMonedaValues(rendered);
}

function adjacentMonedaValues(rendered: RenderedText): string[] {
  const lines = renderedLines(rendered);
  const values: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const pieces = lines[i].split(/Moneda:/i);
    if (pieces.length < 2) continue;
    for (let piece = 1; piece < pieces.length; piece++) {
      const parts: string[] = [];
      const head = normalizeFichaText(pieces[piece]);
      if (head) parts.push(head);
      if (piece === pieces.length - 1) {
        for (let next = i + 1; next < lines.length; next++) {
          if (/Moneda:/i.test(lines[next])) break;
          parts.push(lines[next]);
        }
      }
      const chosen = longestAdjacentWhitelist(parts);
      if (chosen) values.push(chosen);
      else if (head) values.push(head);
    }
  }
  return values;
}

/**
 * The li or tr that holds the label. A value may sit in that row's next
 * segment, and the scope never climbs to `#fichaRight` or beyond the row.
 */
function monedaScope($: CheerioAPI, el: Element): Element {
  let node: AnyNode | null = el;
  while (node) {
    if (isElement(node)) {
      const name = node.name.toLowerCase();
      if (name === 'li' || name === 'tr') return node;
      if (attrCi($, node, 'id') === 'ficharight') return node;
    }
    node = parentOf(node);
  }
  return containingBlock($, el);
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
    const block = monedaScope($, el);
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
  if (subtreeHasDisallowedControl(section)) return { parsed: null, reason: 'unparseable_ficha' };
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
    if (containsInertCarrier(block) || subtreeHasDisallowedControl(block)) {
      return { parsed: null, reason: 'unparseable_ficha' };
    }
    const visible = monedaValuesFor(block, renderedVisible($, block));
    const unfiltered = monedaValuesFor(block, renderedUnfiltered($, block));
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
