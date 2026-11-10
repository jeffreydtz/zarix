/**
 * Own-category duplicates are exact names only (case/accents insensitive).
 * Synonym groups are a non-blocking hint against system categories.
 */

export interface CategoryIdentity {
  id: string;
  name: string;
  type: string;
  is_system?: boolean | null;
  user_id?: string | null;
}

const SYNONYM_GROUPS: string[][] = [
  ['otros', 'other', 'others', 'misc', 'miscellaneous', 'miscelaneo', 'misceláneos', 'miscelaneos'],
  ['comida', 'food', 'alimentacion', 'alimentación', 'groceries', 'supermercado', 'alimentos'],
  ['transporte', 'transport', 'transportation', 'mobility'],
  ['hogar', 'home', 'housing', 'casa'],
  ['salud', 'health', 'healthcare', 'medical'],
  ['ocio', 'entertainment', 'fun', 'leisure'],
  ['suscripciones', 'subscriptions', 'subscription'],
  ['ropa', 'clothing', 'clothes', 'apparel'],
  ['educacion', 'educación', 'education'],
  ['trabajo', 'work', 'job'],
  ['viajes', 'travel', 'trips'],
  ['mascotas', 'pets'],
  ['regalos', 'gifts', 'gift'],
  ['impuestos', 'taxes', 'tax'],
  ['mantenimiento', 'maintenance'],
  ['salidas', 'dining out', 'restaurants'],
  ['deporte', 'sports', 'sport', 'fitness'],
  ['sueldo', 'salary', 'paycheck', 'wage', 'wages'],
  ['inversiones', 'investments', 'investment'],
  ['alquiler', 'rent', 'rental'],
  ['reembolso', 'refund', 'reimbursement'],
  ['venta', 'sale', 'sales'],
];

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const CANONICAL = new Map<string, string>();
for (const group of SYNONYM_GROUPS) {
  const canon = fold(group[0]);
  for (const alias of group) CANONICAL.set(fold(alias), canon);
}

export function foldedCategoryName(name: string): string {
  return fold(name);
}

export function categoryMatchKey(name: string): string {
  const folded = fold(name);
  return CANONICAL.get(folded) ?? folded;
}

function isSystemCategory(category: CategoryIdentity): boolean {
  return category.is_system === true;
}

/** Exact name match of the caller's own categories (folded: case and accents). */
export function findOwnExactCategory(
  name: string,
  type: string,
  existing: readonly CategoryIdentity[]
): CategoryIdentity | null {
  const key = fold(name);
  if (!key) return null;
  for (const category of existing) {
    if (category.type !== type) continue;
    if (isSystemCategory(category)) continue;
    if (fold(category.name) === key) return category;
  }
  return null;
}

/** Synonym or exact name of a system category — hint only, never blocks create. */
export function findSimilarSystemCategory(
  name: string,
  type: string,
  existing: readonly CategoryIdentity[]
): CategoryIdentity | null {
  const key = categoryMatchKey(name);
  if (!key) return null;
  for (const category of existing) {
    if (category.type !== type) continue;
    if (!isSystemCategory(category)) continue;
    if (categoryMatchKey(category.name) === key) return category;
  }
  return null;
}

/** @deprecated Prefer findOwnExactCategory. Kept for callers that pass only user rows. */
export function findDuplicateCategory(
  name: string,
  type: string,
  existing: readonly CategoryIdentity[]
): CategoryIdentity | null {
  return findOwnExactCategory(name, type, existing);
}
