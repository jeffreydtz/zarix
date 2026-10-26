/**
 * CAFCI stats HTML ficha via a real HTML parser (cheerio/parse5).
 * Comments, scripts, style and CDATA are not identity/NAV sources.
 */

import * as cheerio from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import { parseArgentineNumber } from '@/lib/market-data/argentine-number';
import { parseCafciDateLabel } from '@/lib/market-data/fci-nav-freshness';

export const CAFCI_NAV_TOKEN = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/;
const VALORES_AL = /^Valores al\s+(\d{2}\/\d{2}\/\d{4})$/i;
const CUOTAPARTE_LABEL = /^Valor por cada cuotaparte:\s*(.*)$/i;

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

function collapsedText($: cheerio.CheerioAPI, el: AnyNode): string {
  return $(el).text().replace(/\s+/g, ' ').trim();
}

function innermost($: cheerio.CheerioAPI, predicate: (el: Element) => boolean): Element[] {
  const hits: Element[] = [];
  $('*').each((_, el) => {
    if (!predicate(el)) return;
    const nested = $(el).find('*').toArray().some((child) => predicate(child));
    if (!nested) hits.push(el);
  });
  return hits;
}

function fondoIdFromAction(action: string | undefined): string | null {
  if (!action) return null;
  const trimmed = action.trim();
  try {
    const url = new URL(trimmed, 'https://estadisticas.cafci.org.ar');
    const match = url.pathname.match(/^\/fondos\/(\d+)$/);
    return match ? match[1] : null;
  } catch {
    const match = trimmed.match(/^\/fondos\/(\d+)\/?$/);
    return match ? match[1] : null;
  }
}

function followingText($: cheerio.CheerioAPI, el: Element): string {
  const nodes = $(el).parent().contents().toArray();
  const idx = nodes.indexOf(el);
  if (idx < 0) return '';
  const bits: string[] = [];
  for (let i = idx + 1; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.type === 'comment') continue;
    if (node.type === 'text') {
      bits.push($(node).text());
      continue;
    }
    break;
  }
  return bits.join('');
}

function parseIdentity(
  $: cheerio.CheerioAPI,
  expected?: { fondoId: string; claseId: string }
): { fondoId: string; claseId: string } | { fail: CafciHtmlParseFail } {
  const fundForms = $('form').toArray()
    .map((el) => ({ el, fondoId: fondoIdFromAction($(el).attr('action')) }))
    .filter((row): row is { el: Element; fondoId: string } => Boolean(row.fondoId));
  if (fundForms.length !== 1) return { fail: 'unparseable_ficha' };
  const fondoId = fundForms[0].fondoId;

  const selects = $('select[name=clase]').toArray();
  if (selects.length !== 1) return { fail: 'unparseable_ficha' };
  const selected = $(selects[0]).find('option[selected]').toArray();
  if (selected.length !== 1) return { fail: 'unparseable_ficha' };
  const claseId = ($(selected[0]).attr('value') ?? '').trim();
  if (!claseId) return { fail: 'unparseable_ficha' };

  if (expected && (fondoId !== expected.fondoId || claseId !== expected.claseId)) {
    return { fail: 'class_mismatch' };
  }
  return { fondoId, claseId };
}

function parseNavPrice($: cheerio.CheerioAPI): number | null {
  const nodes = innermost($, (el) => /Valor por cada cuotaparte:/i.test(collapsedText($, el)));
  if (nodes.length !== 1) return null;
  const match = collapsedText($, nodes[0]).match(CUOTAPARTE_LABEL);
  if (!match) return null;
  let token = match[1].trim();
  if (!token) token = followingText($, nodes[0]).replace(/\s+/g, ' ').trim();
  if (!CAFCI_NAV_TOKEN.test(token)) return null;
  const price = parseArgentineNumber(token);
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  return price;
}

function parseValoresAl($: cheerio.CheerioAPI): string | null {
  const nodes = innermost($, (el) => /Valores al\s+/i.test(collapsedText($, el)));
  if (nodes.length !== 1) return null;
  const match = collapsedText($, nodes[0]).match(VALORES_AL);
  if (!match) return null;
  return parseCafciDateLabel(match[1]);
}

function parseCurrencyLabel($: cheerio.CheerioAPI): string | null {
  const nodes = innermost($, (el) => /Moneda:/i.test(collapsedText($, el)));
  if (nodes.length !== 1) return null;
  const el = nodes[0];
  const own = collapsedText($, el);
  const withValue = own.match(/^Moneda:\s*(.+)$/i);
  if (withValue) {
    const label = withValue[1].trim();
    return label || null;
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
  const $ = cheerio.load(html);
  $('script, style, noscript, template').remove();

  const identity = parseIdentity($, expected);
  if ('fail' in identity) return { parsed: null, reason: identity.fail };

  const price = parseNavPrice($);
  if (price == null) return { parsed: null, reason: 'unparseable_ficha' };
  const timestamp = parseValoresAl($);
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
