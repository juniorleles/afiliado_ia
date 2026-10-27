import type { ProductContract } from "@/lib/product-contract/types";
import type { CoverageScore, CoverageSlot, PriceStatus, SlotScore } from "@/lib/research-coverage/types";
import { COVERAGE_WEIGHTS, RESEARCH_COVERAGE_VERSION } from "@/lib/research-coverage/types";

function slot(name: CoverageSlot, present: boolean, note: string): SlotScore {
  return {
    slot: name,
    weight: COVERAGE_WEIGHTS[name],
    present,
    points: present ? COVERAGE_WEIGHTS[name] : 0,
    note,
  };
}

export function scoreProductCoverage(input: {
  contract: ProductContract;
  priceStatus: PriceStatus;
  provenancePresent: boolean;
}): CoverageScore {
  const slots: SlotScore[] = [
    slot("identity", Boolean(input.contract.identity.productName), "Documented product name."),
    slot("category", Boolean(input.contract.identity.productKind), "Documented product kind or format."),
    slot(
      "composition",
      (input.contract.components?.length ?? 0) + (input.contract.specifications?.length ?? 0) > 0,
      "Listed ingredients or specifications.",
    ),
    slot("features", (input.contract.features?.length ?? 0) > 0, "Listed characteristics."),
    slot("usage", (input.contract.usage?.length ?? 0) > 0, "Documented directions."),
    slot("faq", (input.contract.faq?.length ?? 0) > 0, "Publishable source FAQ. Empty is not a technical error."),
    slot("guarantee", Boolean(input.contract.guarantee), "Seller-stated guarantee, if present."),
    slot(
      "price",
      input.priceStatus === "PRICE_RECORDED",
      input.priceStatus === "PRICE_UNVERIFIED"
        ? "A price mention is not confirmed for display."
        : input.priceStatus === "PRICE_RECORDED"
          ? "A current seller or manufacturer price was recorded."
          : "No confirmed price. Absence is not a fetch error.",
    ),
    slot(
      "commercial",
      Boolean(input.contract.offer?.packages.length || input.contract.operational?.returns?.length || input.contract.operational?.shipping?.length),
      "Packages, returns, or shipping from the source.",
    ),
    slot("cautions", (input.contract.cautions?.length ?? 0) > 0, "Documented cautions."),
    slot("provenance", input.provenancePresent, "Used facts keep a source URL and classification."),
  ];
  const total = slots.reduce((sum, item) => sum + item.points, 0);
  return {
    version: RESEARCH_COVERAGE_VERSION,
    total,
    max: 100,
    slots,
    unresolvedGaps: slots.filter((item) => !item.present).map((item) => item.slot),
  };
}
