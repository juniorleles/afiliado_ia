import { PRODUCT_CONTRACT_VERSION } from "@/lib/product-contract/types";
import { acceptedProposals } from "@/lib/product-research/approved-facts";
import type { ProductResearchRun } from "@/lib/product-research/types";
import type { ApprovedGenerationFacts } from "@/lib/presell-quality/approved-generation-facts";
import { SSL_PLATFORM_QUALIFIER } from "@/lib/presell-quality/approved-generation-facts";
import { readCandidateLedger } from "@/lib/presell-quality/candidate-ledger";
import type { ContractIntegrityReport } from "@/lib/presell-quality/contract-integrity";

export type ContentManifest = {
  campaignId: number;
  contractVersion: typeof PRODUCT_CONTRACT_VERSION;
  researchRunId: string | null;
  allowedFacts: Array<{
    field: string;
    evidenceIds: string[];
    sourceUrl: string | null;
    verification: string | null;
    value: string;
  }>;
  blockedClaims: Array<{ candidateId: string; reason: string; excerpt: string }>;
  requiredQualifiers: string[];
  sourceEvidence: Array<{ evidenceId: string; sourceUrl: string; field: string }>;
  generationConstraints: string[];
};

export function buildContentManifest(input: {
  campaignId: number;
  run: ProductResearchRun | null;
  integrity: ContractIntegrityReport;
  generation: ApprovedGenerationFacts;
}): ContentManifest {
  const accepted = acceptedProposals(input.run);
  const ledger = readCandidateLedger(input.campaignId);
  const blocked = (ledger?.candidates ?? [])
    .filter((item) => item.blockReason)
    .filter((item) => !input.integrity.autoApproved.some((row) => row.candidateId === item.candidateId))
    .map((item) => ({
      candidateId: item.candidateId,
      reason: item.blockReason ?? "blocked",
      excerpt: (item.originalExcerpt || item.extractedValue).slice(0, 180),
    }));
  const requiredQualifiers = [
    "Seller-stated facts stay attributed to the source page. They are not independent verification.",
    "Delivery windows stay estimates. Do not restate them as guaranteed arrival times.",
    "Do not invent price, discount, free shipping, manufacturer, testimonials, or clinical results.",
    ...(input.generation.sslQualified
      ? ["Seller SSL language is not an independent security certification.", SSL_PLATFORM_QUALIFIER]
      : []),
  ];
  return {
    campaignId: input.campaignId,
    contractVersion: input.integrity.contractVersion,
    researchRunId: input.run?.runId ?? null,
    allowedFacts: accepted.map((item) => ({
      field: item.field,
      evidenceIds: item.evidenceIds,
      sourceUrl: item.sourceUrl,
      verification: item.verification,
      value: item.currentValue || item.suggestedValue,
    })),
    blockedClaims: blocked,
    requiredQualifiers,
    sourceEvidence: input.integrity.autoApproved.map((item) => ({
      evidenceId: item.candidateId,
      sourceUrl: item.sourceUrl ?? "",
      field: accepted.find((row) => row.evidenceIds.includes(item.candidateId))?.field ?? "faq",
    })),
    generationConstraints: [
      "Use only accepted Product Contract facts.",
      "Do not overwrite the four core accepted fields.",
      "Do not reopen human rejections.",
      "Do not accept blocked medical or promotional candidates.",
      "Do not use botanical images as composition proof.",
      "Do not enable a commercial CTA, affiliate hop, ads, or publication.",
      "English presell copy must use English source excerpts, not Portuguese review previews.",
      ...input.generation.notes,
    ],
  };
}
