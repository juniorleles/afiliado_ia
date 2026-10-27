import type { ConversionBrief, SectionType } from "@/lib/conversion-strategy/types";
import type { ProductContract } from "@/lib/product-contract/types";
import type { SalesCopy } from "@/lib/page-blueprint/types";
import { classifySearchIntent } from "@/lib/search-intent/classify";
import { composeIntentHeadline } from "@/lib/search-intent/headline";
import { bofuSectionOrder, editorialSectionOrder, selectedBofuSlots } from "@/lib/search-intent/modes";
import { buildHopLinkReadiness } from "@/lib/search-intent/hoplink";
import { evaluateGoogleAdsReadiness } from "@/lib/search-intent/ads-readiness";
import type { BofuSlot, GoogleAdsReadiness, HopLinkReadiness, PresellMode, SearchIntentClassification } from "@/lib/search-intent/types";

const PRODUCER = "DETERMINISTIC_OFFLINE" as const;

function reorder(copy: SalesCopy, order: SectionType[]): SalesCopy {
  const rank = new Map(order.map((type, index) => [type, index]));
  const legal = copy.sections.filter((item) => item.sectionType === "legal");
  const rest = copy.sections
    .filter((item) => item.sectionType !== "legal")
    .sort((a, b) => (rank.get(a.sectionType) ?? 80) - (rank.get(b.sectionType) ?? 80));
  return { ...copy, sections: [...rest, ...legal] };
}

export type AppliedPresellMode = {
  classification: SearchIntentClassification;
  mode: PresellMode;
  copy: SalesCopy;
  headline: string;
  selectedSlots: BofuSlot[] | string[];
  hop: HopLinkReadiness;
  ads: GoogleAdsReadiness;
};

/**
 * Applies intent-aligned headline and editorial/BOFU section order.
 * It never invents prices, hops, or official-site claims.
 */
export function applyPresellMode(input: {
  query: string;
  contract: ProductContract;
  brief: ConversionBrief;
  copy: SalesCopy;
}): AppliedPresellMode {
  const classification = classifySearchIntent(input.query);
  const headline = composeIntentHeadline({
    contract: input.contract,
    intent: classification.intent,
    mode: classification.mode,
  });
  let copy: SalesCopy = {
    ...input.copy,
    headline: {
      text: headline,
      evidenceRefs: [],
      contractPaths: ["identity.productName"],
      producer: PRODUCER,
    },
  };
  copy = reorder(copy, classification.mode === "PRESELL_BOFU" ? bofuSectionOrder() : editorialSectionOrder());
  return {
    classification,
    mode: classification.mode,
    copy,
    headline,
    selectedSlots:
      classification.mode === "PRESELL_BOFU"
        ? selectedBofuSlots(input.contract, copy.sections.map((item) => item.sectionType))
        : copy.sections.map((item) => item.sectionType),
    hop: buildHopLinkReadiness(input.contract),
    ads: evaluateGoogleAdsReadiness(input.contract, copy),
  };
}
