import type { ConversionBrief } from "@/lib/conversion-strategy/types";
import type { ProductContract } from "@/lib/product-contract/types";
import type { GroundingReport, SalesCopy } from "@/lib/page-blueprint/types";
import { validateSalesCopy } from "@/lib/page-blueprint/validate";
import type { AiCommercialCopyDraft } from "@/lib/lp-generator/ai-copy/types";

export function buildAiCommercialCopy(
  copy: SalesCopy,
  draft: AiCommercialCopyDraft,
): SalesCopy {
  return {
    ...copy,
    producer: "AI_COMMERCIAL",
    headline: { ...copy.headline, text: draft.headline, producer: "AI_COMMERCIAL" },
    subheadline: draft.subheadline
      ? { text: draft.subheadline, evidenceRefs: copy.subheadline?.evidenceRefs ?? [], contractPaths: copy.subheadline?.contractPaths ?? ["identity.productKind"], producer: "AI_COMMERCIAL" }
      : copy.subheadline,
    introduction: { ...copy.introduction, text: draft.introduction, producer: "AI_COMMERCIAL" },
    sections: copy.sections.map((section) => ({
      ...section,
      headline: draft.sectionHeadlines[section.sectionType]
        ? { ...section.headline, text: draft.sectionHeadlines[section.sectionType], producer: "AI_COMMERCIAL" }
        : section.headline,
      items: draft.features.length && (section.sectionType === "differentiators" || section.sectionType === "benefits")
        ? draft.features.slice(0, section.items.length || draft.features.length).map((text, index) => ({
          text: {
            text,
            evidenceRefs: section.items[index]?.text.evidenceRefs ?? section.items[0]?.text.evidenceRefs ?? [],
            contractPaths: section.items[index]?.text.contractPaths ?? ["features"],
            producer: "AI_COMMERCIAL" as const,
          },
        }))
        : section.items,
    })),
    faq: draft.faq.length
      ? draft.faq.map((item, index) => ({
        question: {
          text: item.question,
          evidenceRefs: copy.faq[index]?.question.evidenceRefs ?? [],
          contractPaths: ["faq"],
          producer: "AI_COMMERCIAL" as const,
        },
        answer: {
          text: item.answer,
          evidenceRefs: copy.faq[index]?.answer.evidenceRefs ?? copy.faq[0]?.answer.evidenceRefs ?? [],
          contractPaths: ["faq"],
          producer: "AI_COMMERCIAL" as const,
        },
      }))
      : copy.faq,
    cta: {
      ...copy.cta,
      label: draft.ctaMicrocopy && copy.cta.action === "AUTHORIZED_HOP"
        ? { text: draft.ctaMicrocopy, evidenceRefs: copy.cta.label?.evidenceRefs ?? [], contractPaths: ["cta"], producer: "AI_COMMERCIAL" }
        : copy.cta.label,
    },
  };
}

export function inspectAiCommercialDraft(
  copy: SalesCopy,
  draft: AiCommercialCopyDraft,
  contract: ProductContract,
  brief: ConversionBrief,
): { copy: SalesCopy; report: GroundingReport } {
  const next = buildAiCommercialCopy(copy, draft);
  return { copy: next, report: validateSalesCopy(next, contract, brief) };
}

export function applyAiCommercialDraft(
  copy: SalesCopy,
  draft: AiCommercialCopyDraft,
  contract: ProductContract,
  brief: ConversionBrief,
): SalesCopy | null {
  const { copy: next, report } = inspectAiCommercialDraft(copy, draft, contract, brief);
  return report.ok ? next : null;
}
