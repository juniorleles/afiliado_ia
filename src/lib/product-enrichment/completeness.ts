import type { ConversionBrief } from "@/lib/conversion-strategy/types";
import type { ProductContract } from "@/lib/product-contract/types";
import type { CompletenessSnapshot } from "@/lib/product-enrichment/types";

export function completenessOf(contract: ProductContract, brief: ConversionBrief): CompletenessSnapshot {
  return {
    hasIdentity: Boolean(contract.identity.productName),
    hasDescription: Boolean(contract.description?.text || contract.valueProposition?.headline?.text),
    hasBrand: Boolean(contract.identity.brand),
    featureCount: contract.features?.length ?? 0,
    specCount: contract.specifications?.length ?? 0,
    componentCount: contract.components?.length ?? 0,
    usageCount: contract.usage?.length ?? 0,
    packageCount: contract.offer?.packages.length ?? 0,
    hasPrice: Boolean(contract.offer?.packages.some((item) => item.totalPrice || item.unitPrice)),
    hasGuarantee: Boolean(contract.guarantee),
    returnsCount: contract.operational?.returns?.length ?? 0,
    shippingCount: contract.operational?.shipping?.length ?? 0,
    faqCount: contract.faq?.length ?? 0,
    authorizedImage: Boolean(contract.images?.hero),
    authorizedHop: contract.cta.state === "AUTHORIZED" && contract.gates.link === "PASS",
    missingPaths: brief.missingEvidence.map((item) => item.path),
  };
}

export function completenessDelta(before: CompletenessSnapshot, after: CompletenessSnapshot): string[] {
  const out: string[] = [];
  const counts: Array<keyof CompletenessSnapshot> = [
    "featureCount",
    "specCount",
    "componentCount",
    "usageCount",
    "packageCount",
    "returnsCount",
    "shippingCount",
    "faqCount",
  ];
  for (const key of counts) {
    const a = after[key] as number;
    const b = before[key] as number;
    if (a > b) out.push(`${key}+${a - b}`);
  }
  if (after.hasGuarantee && !before.hasGuarantee) out.push("guarantee");
  if (after.hasPrice && !before.hasPrice) out.push("price");
  if (after.hasBrand && !before.hasBrand) out.push("brand");
  if (after.authorizedImage && !before.authorizedImage) out.push("authorizedImage");
  return out;
}
