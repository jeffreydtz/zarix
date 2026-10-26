/**
 * CAFCI stats HTML ficha via cheerio + parse5 (browser-compatible).
 * NAV/date are scoped to the single `#cuotaparte` section. `#cartera` is never
 * a date source. Comments and markup inside the NAV token fail closed.
 *
 * parse5 drops duplicate attributes on the same element (HTML first-wins) and
 * does not expose them via location info in cheerio's DOM, so duplicate attrs
 * cannot be rejected robustly here.
 *
 * parse5 exposes `<template>` content as a detached fragment (`$('form')` and
 * `$('[id=cuotaparte]')` can match nodes with no parent). Any `<template>` in
 * the document is unparseable. Every node used for identity, `#cuotaparte`,
 * and the NAV must have an unbroken parent chain through `<body>` then `<html>`.
 *
 * Currency: every `Moneda:` mention on the page (except `#cartera`) must agree
 * on ARS vs USD, and `#fichaRight` (Datos del Fondo on the live CAFCI ficha)
 * must contain at least one `Moneda`.
 *
 * Disabled fieldset: descendants of a `fieldset[disabled]` are skipped, except
 * descendants of that fieldset's first child `legend` (HTML disabled-fieldset
 * first-legend exception).
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
const NAV_TOKEN_CONTINUE = /[A-Za-z0-9.,]/;

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

/** Unbroken parent chain through `<body>` then `<html>` to the document root. */
function attachedToDocumentBody(el: Element): boolean {
  let node: AnyNode | null = el;
  let sawBody = false;
  let sawHtml = false;
  while (node) {
    if (isElement(node)) {
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

function remainderHasBareNavToken(remainder: string, token: string): boolean {
  const decoded = decodeCommaEntities(remainder).replace(/^\s+/, '').replace(/\s+$/, '');
  return decoded === token;
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

function parseIdentity(
  $: CheerioAPI,
  expected?: { fondoId: string; claseId: string }
): { fondoId: string; claseId: string } | { fail: CafciHtmlParseFail } {
  const fundForms = $('form').toArray()
    .map((el) => ({ el, fondoId: fondoIdFromAction($(el).attr('action')) }))
    .filter((row): row is { el: Element; fondoId: string } => Boolean(row.fondoId));
  if (fundForms.some((row) => aroundOrInsideRawTextOrFrame($, row.el))) {
    return { fail: 'unparseable_ficha' };
  }
  if (fundForms.some((row) => !attachedToDocumentBody(row.el))) {
    return { fail: 'unparseable_ficha' };
  }
  if (fundForms.length !== 1) return { fail: 'unparseable_ficha' };
  const fundForm = fundForms[0];
  if (insideDisabledFieldset($, fundForm.el)) {
    return { fail: 'unparseable_ficha' };
  }

  const selects = $('select[name=clase]').toArray().filter(isElement);
  if (selects.length !== 1) return { fail: 'unparseable_ficha' };
  const select = selects[0];
  if (!attachedToDocumentBody(select)) return { fail: 'unparseable_ficha' };
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
  if (!attachedToDocumentBody(selected[0])) return { fail: 'unparseable_ficha' };
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
  const mentions = text.match(/por cada cuotaparte/gi);
  if (!mentions || mentions.length !== 1) return null;
  const labelled = text.match(/Valor por cada cuotaparte:\s*/i);
  if (!labelled || labelled.index == null) return null;
  const rest = text.slice(labelled.index + labelled[0].length).trimStart();
  const token = rest.match(NAV_TOKEN_PREFIX);
  if (!token) return null;
  const next = rest[token[0].length];
  if (next && NAV_TOKEN_CONTINUE.test(next)) return null;
  return token[0];
}

function parseNavPrice($: CheerioAPI, section: Element): number | null {
  const nodes = innermostIn($, section, (el) => /Valor por cada cuotaparte:/i.test(collapsedText($, el)));
  if (nodes.length !== 1) return null;
  const el = nodes[0];
  if (!attachedToDocumentBody(el)) return null;
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
  const nodePrice = parseArgentineNumber(token);
  if (nodePrice == null || !Number.isFinite(nodePrice) || nodePrice <= 0) return null;

  const blockToken = navTokenFromSectionText(collapsedText($, section));
  if (!blockToken) return null;
  const blockPrice = parseArgentineNumber(blockToken);
  if (blockPrice == null || blockPrice !== nodePrice) return null;
  return nodePrice;
}

function parseValoresAl($: CheerioAPI, section: Element): string | null {
  const nodes = innermostIn($, section, (el) => /Valores al\s+/i.test(collapsedText($, el)));
  if (nodes.length !== 1) return null;
  const match = collapsedText($, nodes[0]).match(VALORES_AL);
  if (!match) return null;
  const timestamp = parseCafciDateLabel(match[1]);
  if (!timestamp) return null;

  const dates = [...collapsedText($, section).matchAll(DMY)]
    .map((row) => parseCafciDateLabel(row[1]))
    .filter((iso): iso is string => Boolean(iso));
  if (dates.length === 0) return null;
  if (dates.some((iso) => iso !== timestamp)) return null;
  return timestamp;
}

function parseChosenCurrency($: CheerioAPI): string | null {
  const nodes = innermost($, (el) => /Moneda:/i.test(collapsedText($, el)), '#cartera');
  if (nodes.length !== 1) return null;
  const el = nodes[0];
  if (aroundOrInsideRawTextOrFrame($, el)) return null;
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

function collectMonedaLabels($: CheerioAPI): string[] {
  const labels: string[] = [];
  $('*').each((_, el) => {
    if (!isElement(el)) return;
    if ($(el).closest(`script, style, noscript, template, #cartera, ${RAW_TEXT_OR_FRAME}`).length > 0) {
      return;
    }
    const own = directText($, el);
    const labelled = own.match(MONEDA_LABEL);
    if (labelled) {
      const value = labelled[1].trim();
      if (value) {
        labels.push(value);
        return;
      }
    }
    if (/^Moneda:\s*$/i.test(own)) {
      const rest = followingText($, el).replace(/\s+/g, ' ').trim();
      if (rest) labels.push(rest);
    }
  });
  return labels;
}

function currenciesAgree(chosen: string, mentions: string[]): boolean {
  const chosenKind = monedaKind(chosen);
  if (chosenKind === 'other') {
    return mentions.every((label) => label.replace(/\s+/g, ' ').trim() === chosen);
  }
  return mentions.every((label) => monedaKind(label) === chosenKind);
}

/** Live CAFCI fichas put Datos del Fondo (including Moneda) in `#fichaRight`. */
function hasMonedaInFichaMain($: CheerioAPI): boolean {
  const mains = $('[id="fichaRight"]').toArray().filter(isElement);
  if (mains.length !== 1) return false;
  const main = mains[0];
  if (!attachedToDocumentBody(main)) return false;
  let found = false;
  $(main)
    .find('*')
    .addBack()
    .each((_, el) => {
      if (!isElement(el)) return;
      if (/Moneda/i.test(directText($, el)) || /Moneda/i.test(collapsedText($, el))) {
        found = true;
      }
    });
  return found;
}

export function parseCafciHtmlFichaDetailed(
  html: string,
  expected?: { fondoId: string; claseId: string }
): CafciHtmlParseResult {
  if (!html || typeof html !== 'string') return { parsed: null, reason: 'unparseable_ficha' };
  const $ = load(html);

  if ($('template').toArray().some((el) => isElement(el))) {
    return { parsed: null, reason: 'unparseable_ficha' };
  }

  const identity = parseIdentity($, expected);
  if ('fail' in identity) return { parsed: null, reason: identity.fail };

  const sections = $('[id="cuotaparte"]').toArray().filter(isElement);
  if (sections.length !== 1) return { parsed: null, reason: 'unparseable_ficha' };
  const section = sections[0];
  if (!attachedToDocumentBody(section)) return { parsed: null, reason: 'unparseable_ficha' };
  if (aroundOrInsideRawTextOrFrame($, section)) return { parsed: null, reason: 'unparseable_ficha' };
  if (subtreeHasComment(section)) return { parsed: null, reason: 'unparseable_ficha' };

  const price = parseNavPrice($, section);
  if (price == null) return { parsed: null, reason: 'unparseable_ficha' };
  const timestamp = parseValoresAl($, section);
  if (!timestamp) return { parsed: null, reason: 'unparseable_ficha' };
  const monedaLabel = parseChosenCurrency($);
  if (!monedaLabel) return { parsed: null, reason: 'unparseable_ficha' };
  const mentions = collectMonedaLabels($);
  if (mentions.length === 0 || !currenciesAgree(monedaLabel, mentions)) {
    return { parsed: null, reason: 'unparseable_ficha' };
  }
  if (!hasMonedaInFichaMain($)) {
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
