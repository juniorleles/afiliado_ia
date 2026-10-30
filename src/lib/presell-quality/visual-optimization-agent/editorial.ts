import type { ApprovedCopyInventory, CommercialCopyState, CopyChange, LayoutChange } from "./types.ts";
import { editorialSubheadline, editorialSubheadlineFacts } from "./editorial-gate.ts";

export function buildEditorialCopy(input: ApprovedCopyInventory & { executionId: string; iteration?: number }): CommercialCopyState {
  const name = input.productName.trim() || "This product";
  const subheadline = editorialSubheadline(input);
  const heroBody = input.packages.length
    ? "Compare bottle counts, per-bottle prices, totals, shipping terms, and extras as listed by the seller."
    : "Review the seller-listed details in the sections below.";
  return {
    version: 1,
    executionId: input.executionId,
    iteration: input.iteration ?? 1,
    headline: {
      text: `Discover ${name}`,
      supportingFactIds: ["identity.productName"],
    },
    subheadline: {
      text: subheadline,
      supportingFactIds: editorialSubheadlineFacts(input),
    },
    heroBody: {
      text: heroBody,
      supportingFactIds: input.packages.length ? ["pricing.packages"] : ["identity.productName"],
    },
    ctaLabel: input.packages.length ? "See packages" : "See product details",
  };
}

export function confirmedEditorialPlan(iteration: number, inventory: ApprovedCopyInventory, current: CommercialCopyState): {
  layout_changes: LayoutChange[];
  copy_changes: CopyChange[];
} {
  const seed = buildEditorialCopy({ ...inventory, executionId: current.executionId, iteration });
  if (iteration <= 1) {
    return {
      layout_changes: [
        { op: "SET_COPY_TONE", value: "commercial" },
        { op: "SET_SANDBOX_PLACEMENT", value: "admin" },
        { op: "SET_COMPLIANCE_PLACEMENT", value: "aside" },
        { op: "SET_PRODUCT_PRESENTATION", value: "none" },
        { op: "SET_MERGE_FULFILLMENT", value: true },
        { op: "SET_TYPOGRAPHY_SCALE", value: "readable" },
        { op: "SET_INGREDIENT_LAYOUT", value: "distinct" },
        { op: "SET_FAQ_MODE", value: "interactive" },
        { op: "SET_PACKAGES_IN_FOLD", value: false },
        { op: "SET_SECTION_JOURNEY", value: "packages-first" },
      ],
      copy_changes: [
        { op: "REWRITE_HEADLINE", value: seed.headline.text },
        { op: "REWRITE_SUBHEADLINE", value: seed.subheadline.text },
        { op: "REMOVE_EMPTY_SECTION", value: "none" },
        { op: "MERGE_DUPLICATE_SECTIONS", value: "true" },
        { op: "ADJUST_TYPOGRAPHY", value: "readable" },
        { op: "REFINE_INGREDIENT_LAYOUT", value: "distinct" },
        { op: "COMPLETE_GROUNDED_FAQ", value: "interactive" },
        { op: "SET_CTA_LABEL", value: seed.ctaLabel },
      ],
    };
  }
  if (iteration === 2) {
    return {
      layout_changes: [
        { op: "SET_PACKSHOT_SCALE", value: "xl" },
        { op: "SET_HERO_DENSITY", value: "compact" },
        { op: "SET_HERO_MIN_HEIGHT", value: "content" },
        { op: "SET_PRICE_EMPHASIS", value: "display" },
        { op: "SET_PACKAGE_DENSITY", value: "featured" },
        { op: "SET_PACKAGE_HIGHLIGHT", value: "best-value" },
        { op: "SET_CARD_ELEVATION", value: "raised" },
        { op: "SET_BUTTON_WEIGHT", value: "strong" },
        { op: "SET_RADIUS", value: "crisp" },
      ],
      copy_changes: [
        { op: "IMPROVE_OFFER_HIERARCHY", value: "true" },
        { op: "SET_HERO_BODY", value: seed.heroBody.text },
      ],
    };
  }
  return {
    layout_changes: [
      { op: "SET_HIDE_HERO_CHIPS", value: true },
      { op: "SET_OFFER_COMPARE", value: true },
    ],
    copy_changes: [{ op: "HIDE_HERO_CHIPS" }],
  };
}
