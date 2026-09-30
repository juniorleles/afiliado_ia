/**
 * Presentation-only structure recovery.
 *
 * Composed copy sometimes arrives as one run-on line where the underlying
 * evidence was already a list. When the line is exactly that list joined by
 * whitespace, the same tokens in the same order can be shown as separate rows.
 * Nothing is rewritten, reordered, split heuristically, or described.
 */
import type { ProductFacts } from "@/lib/product-facts";

const collapse = (value: string) => value.replace(/\s+/g, " ").trim();

/** Arrays the importer already stores as discrete values. */
export function structuredFactGroups(facts: ProductFacts | null): string[][] {
  if (!facts) return [];
  const groups = [facts.ingredientsOrComponents, facts.features, facts.usageInformation, facts.cautions];
  return groups
    .filter((group): group is string[] => Array.isArray(group))
    .map((group) => group.map(collapse).filter(Boolean))
    .filter((group) => group.length > 1);
}

/**
 * Returns the original values when `text` is exactly one of the groups joined
 * by whitespace. Any other text returns null and stays a paragraph.
 */
export function structuredSplit(text: string, groups: ReadonlyArray<ReadonlyArray<string>>): string[] | null {
  const target = collapse(text);
  if (!target) return null;
  for (const group of groups) {
    if (group.length < 2) continue;
    if (collapse(group.join(" ")) === target) return [...group];
  }
  return null;
}
