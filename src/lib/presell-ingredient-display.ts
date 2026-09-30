/**
 * Ingredient rows are already-authorized names. A presentation lead must not
 * hide the rest, and this layer does not invent a description for any row.
 */
export function displayedIngredientCards<T extends { title: string; body: string }>(
  cards: readonly T[],
  _visibleLeadCount?: number,
  _collapsed?: boolean,
): { shown: T[]; withheld: T[] } {
  return {
    shown: cards.map((card) => ({ ...card, title: card.title.trim(), body: card.body.trim() })),
    withheld: [],
  };
}

function normalizeFact(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/** A fact is represented when a shown row contains that fact's own text. */
export function representedIngredientFacts(
  shownTitles: readonly string[],
  facts: readonly string[],
): { represented: string[]; missing: string[] } {
  const rows = shownTitles.map(normalizeFact).filter(Boolean);
  const represented: string[] = [];
  const missing: string[] = [];
  for (const fact of facts) {
    const key = normalizeFact(fact);
    if (!key) continue;
    if (rows.some((row) => row.includes(key))) represented.push(fact);
    else missing.push(fact);
  }
  return { represented, missing };
}
