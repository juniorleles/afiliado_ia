import type { ProductFacts } from "@/lib/product-facts";
import { distinctiveNameTokens } from "@/lib/market-research/classify";
import type { MarketQuery, QueryFamilyId } from "@/lib/market-research/types";

const CATEGORY_HINTS = [
  "joint",
  "immune",
  "probiotic",
  "skin",
  "hair",
  "sleep",
  "weight",
  "vision",
  "energy",
  "dental",
  "oral",
  "heart",
  "brain",
  "digestive",
  "collagen",
  "vitamin",
];

export function categorySearchPhrase(facts: ProductFacts): string | null {
  const blob = [
    facts.productName,
    facts.description || "",
    facts.features.join(" "),
    facts.ingredientsOrComponents.join(" "),
  ]
    .join(" ")
    .toLowerCase();
  const hits = CATEGORY_HINTS.filter((hint) => blob.includes(hint));
  if (hits.length === 0) return null;
  const brandedCategory =
    CATEGORY_HINTS.some((hint) => facts.productName.toLowerCase().includes(hint)) &&
    distinctiveNameTokens(facts.productName).length > 0;
  const health =
    brandedCategory ||
    facts.ingredientsOrComponents.length > 0 ||
    /\b(supplement|capsule|tablet|gummies|vitamin|probiotic)\b/i.test(blob);
  if (health) return `${hits[0]} supplement`;
  return hits[0];
}

export function marketResearchQueryFamilies(facts: ProductFacts): Array<{ family: QueryFamilyId; queries: string[] }> {
  const name = facts.productName.trim();
  const category = categorySearchPhrase(facts);
  const pluralCategory = category ? `${category}s` : null;
  const product = [name, `${name} review`, `${name} ingredients`];
  const purchase = [`${name} worth it`, `${name} alternatives`, `${name} complaints`, `${name} reviews`];
  const categoryQueries = category
    ? [category, `${category} buying guide`, `${category} ingredients`]
    : [];
  const questions = category
    ? [
        `what to look for in ${pluralCategory || `${category}s`}`,
        `${category} side effects`,
        `${category} effectiveness`,
      ]
    : [`what is ${name}`, `${name} side effects`];

  return [
    { family: "PRODUCT" as const, queries: uniqueQueries(product) },
    { family: "PURCHASE_INTENT" as const, queries: uniqueQueries(purchase) },
    { family: "CATEGORY_INTENT" as const, queries: uniqueQueries(categoryQueries) },
    { family: "QUESTIONS_OBJECTIONS" as const, queries: uniqueQueries(questions) },
  ].filter((group) => group.queries.length > 0);
}

export function marketResearchQueries(facts: ProductFacts): string[] {
  return flattenMarketQueries(facts).map((item) => item.query);
}

export function flattenMarketQueries(facts: ProductFacts, max = 10): MarketQuery[] {
  return takeBalancedQueries(marketResearchQueryFamilies(facts), max);
}

/** Round-robin: every family gets a slot before extras consume the budget. */
export function takeBalancedQueries(
  families: Array<{ family: QueryFamilyId; queries: string[] }>,
  max: number,
): MarketQuery[] {
  const out: MarketQuery[] = [];
  const seen = new Set<string>();
  let index = 0;
  let added = true;
  while (added && out.length < max) {
    added = false;
    for (const family of families) {
      const query = family.queries[index];
      if (!query) continue;
      const key = query.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ family: family.family, query });
      added = true;
      if (out.length >= max) break;
    }
    index += 1;
  }
  return out;
}

function uniqueQueries(items: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const query = item.trim();
    const key = query.toLowerCase();
    if (!query || seen.has(key)) continue;
    seen.add(key);
    out.push(query);
  }
  return out;
}
