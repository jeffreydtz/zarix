import { createServiceClientSync } from '@/lib/supabase/server';
import { userHasOwnGeminiKey } from '@/lib/secrets/user-secrets';

const HEURISTICS: Array<{ re: RegExp; names: string[] }> = [
  { re: /super|coto|disco|jumbo|carrefour|dia |vea |makro/i, names: ['supermercado', 'alimentos', 'comida'] },
  { re: /uber|cabify|didi|subte|bondi|nafta|ypf|shell|axion/i, names: ['transporte', 'nafta', 'auto'] },
  { re: /netflix|spotify|youtube|disney|hbo|max |flow /i, names: ['suscripciones', 'entretenimiento'] },
  { re: /farmacia|farmacity|dr.? a|osde|swiss medical/i, names: ['salud', 'farmacia'] },
  { re: /mc.?donald|burger|mostaza|starbucks|cafe|pizzer/i, names: ['restaurantes', 'delivery', 'comida'] },
  { re: /mercadolibre|amazon|fravega|garbarino/i, names: ['compras', 'tecnología', 'hogar'] },
];

function normalizeMerchant(value: string | null | undefined): string {
  return (value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export async function suggestCategoryFromMerchant(input: {
  userId: string;
  merchant: string | null;
}): Promise<{ categoryId: string | null; categoryName: string | null; source: 'history' | 'heuristic' | 'none' }> {
  const merchant = normalizeMerchant(input.merchant);
  if (!merchant) return { categoryId: null, categoryName: null, source: 'none' };

  const supabase = createServiceClientSync();
  const { data: history } = await supabase
    .from('transactions')
    .select('category_id, description, category:categories(id, name)')
    .eq('user_id', input.userId)
    .eq('type', 'expense')
    .not('category_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(80);

  const counts = new Map<string, { n: number; name: string | null }>();
  for (const row of history ?? []) {
    const desc = normalizeMerchant((row as { description?: string | null }).description);
    if (!desc) continue;
    if (!desc.includes(merchant) && !merchant.includes(desc.slice(0, 12))) continue;
    const cat = row as { category_id: string; category?: { name?: string } | { name?: string }[] | null };
    const name = Array.isArray(cat.category) ? cat.category[0]?.name : cat.category?.name;
    const cur = counts.get(cat.category_id) || { n: 0, name: name ?? null };
    cur.n += 1;
    counts.set(cat.category_id, cur);
  }
  let best: { id: string; n: number; name: string | null } | null = null;
  for (const [id, v] of counts) {
    if (!best || v.n > best.n) best = { id, n: v.n, name: v.name };
  }
  if (best && best.n >= 1) {
    return { categoryId: best.id, categoryName: best.name, source: 'history' };
  }

  const { data: cats } = await supabase
    .from('categories')
    .select('id, name')
    .or(`user_id.eq.${input.userId},is_system.eq.true`);

  const heuristic = HEURISTICS.find((h) => h.re.test(merchant));
  if (heuristic && cats?.length) {
    const match = cats.find((c) => heuristic.names.some((n) => String(c.name).toLowerCase().includes(n)));
    if (match) return { categoryId: match.id, categoryName: match.name, source: 'heuristic' };
  }

  // Optional Gemini is intentionally not called here. Callers may invoke it
  // only when the user has a BYO key; the ingest path stays heuristic-first.
  await userHasOwnGeminiKey(input.userId);
  return { categoryId: null, categoryName: null, source: 'none' };
}
