/**
 * Presentation guidance from the stored strategy decision.
 *
 * Strategy and market context may guide the ORDER of sections that already hold proven content.
 * They never add, change or authorize a line of copy. Research text, observed benefits and
 * claims are not read here. An unknown or missing approach yields the default order.
 */

export type ShowcaseSectionKey = "composition" | "details" | "usage" | "offers";

export type PresentationGuidance = {
  /** Stored approach id, or null when none exists. */
  approach: string | null;
  /** Order of the movable sections. Sections without content are skipped by the renderer. */
  order: readonly ShowcaseSectionKey[];
  basis: "default" | "strategy-approach";
};

export const DEFAULT_SECTION_ORDER: readonly ShowcaseSectionKey[] = ["composition", "details", "usage", "offers"];

/** Decision-stage approaches put the purchase information before how-to-use. */
const DECISION_FIRST: readonly ShowcaseSectionKey[] = ["composition", "details", "offers", "usage"];
const DECISION_APPROACHES = new Set(["BUYER_GUIDE", "COMPARISON"]);

export function presentationGuidance(approach: string | null | undefined): PresentationGuidance {
  const id = typeof approach === "string" && approach.trim() ? approach.trim().toUpperCase() : null;
  if (id && DECISION_APPROACHES.has(id)) return { approach: id, order: DECISION_FIRST, basis: "strategy-approach" };
  return { approach: id, order: DEFAULT_SECTION_ORDER, basis: "default" };
}
