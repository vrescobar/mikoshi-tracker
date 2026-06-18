/**
 * Fuzzy grouping for free-text meal names.
 *
 * Food is logged as free text (often AI-generated), so the same product shows
 * up under several names: "yfood Classic Choco — 1 ración", "2 raciones de
 * yfood Classic Choco preparado con agua", "yfood This Is Food Complete Meal
 * classic choco". Exact-name grouping leaves those as separate rows. We collapse
 * them by reducing each name to its *significant tokens* (dropping quantities,
 * units, and prep/stop words) and merging meals whose token sets are in a
 * subset/superset relationship — i.e. one name is a more verbose spelling of the
 * other. Distinct meals ("Ensalada de espinaca…" vs "Ensalada con pollo…") share
 * no containment and stay apart.
 */

const STOP_WORDS = new Set([
  // es articles / connectors / prepositions
  "de", "del", "al", "a", "con", "y", "e", "o", "u", "en", "la", "el", "los",
  "las", "un", "una", "unos", "unas", "por", "para", "sin", "mas", "más",
  // en articles / connectors
  "of", "with", "and", "the", "to", "in", "on",
  // portions / prep noise
  "racion", "ración", "raciones", "porcion", "porción", "porciones", "plato",
  "platos", "serving", "servings", "scoop", "scoops", "taza", "tazas", "vaso",
  "vasos", "agua", "water", "preparado", "preparada", "preparados", "preparadas",
  "casero", "casera", "aprox", "approx",
]);

const UNITS = new Set([
  "g", "gr", "gramo", "gramos", "kg", "mg", "ml", "cl", "l", "kcal", "cal",
  "oz", "lb", "lbs",
]);

/** Reduce a meal name to its set of meaningful, product-identifying tokens. */
export function significantTokens(name: string): Set<string> {
  const tokens = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // strip punctuation/dashes to spaces
    .split(/\s+/)
    .filter((t) => {
      if (t.length < 2) return false; // single letters, stray connectors
      if (/^\d/.test(t)) return false; // "2", "200g", "1.5" — quantities
      if (STOP_WORDS.has(t)) return false;
      if (UNITS.has(t)) return false;
      return true;
    });
  return new Set(tokens);
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/**
 * Cluster items whose names refer to the same product. Two names join the same
 * group when one's significant-token set contains the other's (transitively, so
 * a verbose middle spelling can bridge two terser ones). Returns the clusters in
 * first-seen order; items with no significant tokens are returned as singletons.
 */
export function groupSimilarMeals<T>(items: T[], getName: (item: T) => string): T[][] {
  const sets = items.map((it) => significantTokens(getName(it)));
  const parent = items.map((_, i) => i);

  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    while (parent[x] !== root) {
      const next = parent[x];
      parent[x] = root;
      x = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = sets[i];
      const b = sets[j];
      if (a.size === 0 || b.size === 0) continue;
      if (isSubset(a, b) || isSubset(b, a)) union(i, j);
    }
  }

  const groups = new Map<number, T[]>();
  const result: T[][] = [];
  items.forEach((item, idx) => {
    const root = find(idx);
    let bucket = groups.get(root);
    if (!bucket) {
      bucket = [];
      groups.set(root, bucket);
      result.push(bucket); // keep first-seen order
    }
    bucket.push(item);
  });
  return result;
}
