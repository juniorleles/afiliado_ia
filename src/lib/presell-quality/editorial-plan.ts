import { acceptedProposals } from "@/lib/product-research/approved-facts";
import type { ProductResearchRun } from "@/lib/product-research/types";
import type { ReviewMediaSelection } from "@/lib/product-research/media-contract";

export type EditorialPlanSection = {
  type: string;
  title: string;
  sourceFields: string[];
  notes: string[];
};

export type EditorialPlan = {
  composition: "information-first" | "product-hero" | "editorial-premium";
  heroMode: "EDITORIAL_NO_IMAGE" | "PACKSHOT_SPLIT";
  sections: EditorialPlanSection[];
  blockedPadding: string[];
  canRegenerateFromAcceptedFacts: boolean;
};

export function proposeEditorialPlan(input: {
  run: ProductResearchRun | null;
  media: ReviewMediaSelection;
}): EditorialPlan {
  const accepted = acceptedProposals(input.run);
  const fields = new Set(accepted.map((item) => item.field));
  const heroMode = input.media.heroStatus === "SELECTED" ? "PACKSHOT_SPLIT" : "EDITORIAL_NO_IMAGE";
  const composition = heroMode === "PACKSHOT_SPLIT" && fields.size >= 5 ? "editorial-premium" : heroMode === "PACKSHOT_SPLIT" ? "product-hero" : "information-first";
  const sections: EditorialPlanSection[] = [];
  if (fields.has("description")) {
    sections.push({
      type: "hero",
      title: "Product Overview",
      sourceFields: ["description"],
      notes: ["Lead with the accepted description. Do not invent a benefit headline."],
    });
  }
  if (fields.has("ingredients")) {
    sections.push({
      type: "specifications",
      title: "Ingredients",
      sourceFields: ["ingredients"],
      notes: ["List declared composition only. Do not attach clinical effects to ingredient names."],
    });
  }
  if (fields.has("howItWorks")) {
    sections.push({
      type: "how_it_works",
      title: "Directions for Use",
      sourceFields: ["howItWorks"],
      notes: ["Keep operational directions. Do not retitle this as a mechanism of action."],
    });
  }
  if (fields.has("guarantee")) {
    sections.push({
      type: "guarantee",
      title: "Seller-Stated Guarantee",
      sourceFields: ["guarantee"],
      notes: ["Restate the accepted return window. Do not strengthen it into a promise."],
    });
  }
  if (fields.has("warnings")) {
    sections.push({ type: "trust", title: "Cautions", sourceFields: ["warnings"], notes: [] });
  }
  if (fields.has("faq")) {
    sections.push({ type: "faq", title: "Frequently asked questions", sourceFields: ["faq"], notes: [] });
  }
  sections.push({
    type: "legal",
    title: "Affiliate Transparency",
    sourceFields: [],
    notes: ["Keep the page informational. Do not treat a SANDBOX label as a live commercial hop."],
  });
  const blockedPadding = [
    "Do not add generic wellness copy to raise the quality score.",
    "Do not invent testimonials, scarcity, or clinical results.",
  ];
  if (!fields.has("benefits")) blockedPadding.push("Benefits stay absent until an accepted fact exists.");
  return {
    composition,
    heroMode,
    sections,
    blockedPadding,
    canRegenerateFromAcceptedFacts: accepted.length > 0,
  };
}
