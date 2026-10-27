import type { ConversionBrief, TracedClaim } from "@/lib/conversion-strategy/types";
import type { ProductContract } from "@/lib/product-contract/types";
import type { StructuredResearch } from "@/lib/lp-generator/structure";

function publishableFacts(items: TracedClaim[] | undefined): string[] {
  return (items ?? [])
    .filter((item) => item.class === "FACT" && item.restriction === "PUBLISHABLE")
    .map((item) => item.text);
}

export type CommercialCategory = "SUPPLEMENTS" | "ELECTRONICS" | "BEAUTY" | "GENERAL";

export function commercialCategoryOf(input: { category?: string; productKind?: string }): CommercialCategory {
  const blob = `${input.category ?? ""} ${input.productKind ?? ""}`.toLowerCase();
  if (/\b(supplement|vitamin|capsule|dietary|probiotic|greens)\b/.test(blob)) return "SUPPLEMENTS";
  if (/\b(earbud|headphone|electronic|wireless|battery|bluetooth|charger)\b/.test(blob)) return "ELECTRONICS";
  if (/\b(balm|serum|cream|beauty|cosmetic|skincare|lip)\b/.test(blob)) return "BEAUTY";
  return "GENERAL";
}

export function categoryGuidance(category: CommercialCategory): string {
  switch (category) {
    case "SUPPLEMENTS":
      return "Open with the product identity. Cover stated characteristics and ingredients, usage when present, manufacturer claims clearly attributed, FAQ, and a verified offer only if packages exist.";
    case "ELECTRONICS":
      return "Lead with functions, specifications, practical uses and verifiable differences. Show verified packages when they exist.";
    case "BEAUTY":
      return "Cover stated characteristics, ingredients, how to apply, and only source-supported use experience. Show a verified offer only if packages exist.";
    default:
      return "State the relevant need only if the source supports it, then present the product, characteristics, differences and purchase information that exist.";
  }
}

export function buildCommercialCopyPrompt(input: {
  contract: ProductContract;
  brief: ConversionBrief;
  research: StructuredResearch;
  language: string;
  market: string;
}): { system: string; user: string } {
  const category = commercialCategoryOf({
    category: input.research.category,
    productKind: input.contract.identity.productKind,
  });
  const absent = Object.entries(input.contract.dataStates ?? {})
    .filter(([, entry]) => entry.state === "ABSENT" || entry.state === "WITHHELD_POLICY")
    .map(([path, entry]) => ({ path, state: entry.state, reason: entry.reason }));
  return {
    system: [
      "You are a professional landing-page copywriter.",
      "Write clear commercial English. Do not invent facts, reviews, prices, discounts, scarcity, certificates, clinical results or testimonials.",
      "The product name is the commercial identity and must appear in the headline. When verified facts exist, the headline also states a specific commercial proposition; do not use the product name alone. An ingredient must never become the headline.",
      "Do not use audit language such as what the source states, seller-stated claims, or questions the source answered.",
      "Attribute manufacturer claims as claims. Do not upgrade them into proven science.",
      "Use only Product Contract facts, FACT-class Conversion Brief items, and verified research evidence.",
      "Closed, absent, withheld or NOT_FOUND fields must stay omitted.",
      "If a field has no supporting fact, omit it.",
      "Return JSON only.",
      categoryGuidance(category),
    ].join(" "),
    user: JSON.stringify(
      {
        language: input.language,
        market: input.market,
        category,
        productContract: {
          identity: input.contract.identity,
          description: input.contract.description?.text ?? input.research.description ?? null,
          features: (input.contract.features ?? []).map((item) => item.text),
          components: (input.contract.components ?? []).map((item) => item.name),
          usage: (input.contract.usage ?? []).map((item) => item.text),
          specifications: (input.contract.specifications ?? []).map((item) => `${item.name}: ${item.value}${item.unit ? ` ${item.unit}` : ""}`),
          faq: (input.contract.faq ?? []).map((item) => ({ question: item.question, answer: item.answer })),
          offers: (input.contract.offer?.packages ?? []).map((item) => item.label),
          cta: { state: input.contract.cta.state, authorized: input.contract.cta.state === "AUTHORIZED" },
          absentFields: absent,
        },
        conversionBrief: {
          conversionGoal: input.brief.conversionGoal,
          productCategory: input.brief.productCategory,
          ctaStrategy: { action: input.brief.ctaStrategy?.action ?? "NONE", reason: input.brief.ctaStrategy?.reason ?? null },
          offerMode: input.brief.offerStrategy?.mode ?? "INSUFFICIENT_CONTEXT",
          sectionPlan: (input.brief.sectionPlan ?? []).filter((item) => item.include).map((item) => item.type),
          differentiators: publishableFacts(input.brief.keyDifferentiators),
          benefits: publishableFacts(input.brief.benefitCandidates),
        },
        verifiedEvidence: {
          facts: input.research.verifiedFacts,
          ingredients: input.research.ingredients,
          sellerClaims: input.research.sellerClaims,
          usage: input.research.usage,
          sourceUrls: (input.contract.evidence ?? []).map((item) => item.sourceUrl).filter(Boolean),
          dropped: input.research.dropped.map((item) => ({ slot: item.slot, reason: item.reason })),
        },
      },
      null,
      2,
    ),
  };
}
