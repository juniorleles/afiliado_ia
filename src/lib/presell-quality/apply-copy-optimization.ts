import type { V4Model } from "@/lib/product-showcase/v4/model";
import type { CopyRewriteProposal } from "@/lib/presell-quality/copy-validate";
import { informationalDisclosureLine, splitUsageSteps } from "@/lib/presell-quality/copy-rewrite";
import { emptyPatch, type AllowedFixCode, type QualityPresentationPatch } from "@/lib/presell-quality/patch";

export type CopyOptimizationResult = {
  model: V4Model;
  applied: CopyRewriteProposal[];
  rejected: CopyRewriteProposal[];
};

function rewriteGrounded<T extends { text: string }>(text: T, next: string): T {
  return { ...text, text: next };
}

export function applySafeCopyOptimization(
  model: V4Model,
  proposals: CopyRewriteProposal[],
): CopyOptimizationResult {
  const applied = proposals.filter((item) => item.status === "SAFE_REWRITE" && item.proposed !== item.original);
  const rejected = proposals.filter((item) => item.status !== "SAFE_REWRITE");
  let next: V4Model = { ...model };
  const description = applied.find((item) => item.field === "description");
  const usage = applied.find((item) => item.field === "howItWorks") ?? proposals.find((item) => item.field === "howItWorks" && item.status === "SAFE_REWRITE");
  const guarantee = applied.find((item) => item.field === "guarantee");

  if (description) {
    next = {
      ...next,
      copy: { ...next.copy, introduction: rewriteGrounded(next.copy.introduction, description.proposed) },
    };
  }
  const usageText = usage?.proposed ?? usage?.original;
  const usageSteps = usageText ? splitUsageSteps(usageText) : [];
  const guaranteeText = guarantee?.proposed;

  next = {
    ...next,
    blueprint: {
      ...next.blueprint,
      sections: next.blueprint.sections.map((section) => {
        if (section.sectionType === "how_it_works" && usageSteps.length) {
          return {
            ...section,
            body: usageSteps.map((text, index) => ({
              ...(section.body[index] ?? section.body[0] ?? { text, evidenceRefs: [], contractPaths: ["howItWorks"], producer: "DETERMINISTIC_OFFLINE" as const }),
              text,
            })),
            items: [],
          };
        }
        if (section.sectionType === "guarantee" && guaranteeText) {
          return {
            ...section,
            body: [
              {
                ...(section.body[0] ?? { text: guaranteeText, evidenceRefs: [], contractPaths: ["guarantee"], producer: "DETERMINISTIC_OFFLINE" as const }),
                text: guaranteeText,
              },
            ],
          };
        }
        if (section.sectionType === "legal") {
          const disclosure = informationalDisclosureLine();
          const existing = section.body.map((item) => item.text);
          const body = existing.some((item) => /commission/i.test(item))
            ? section.body.map((item) => (/commission/i.test(item.text) ? { ...item, text: disclosure } : item))
            : [
                ...section.body,
                { text: disclosure, evidenceRefs: [], contractPaths: ["legal"], producer: "DETERMINISTIC_OFFLINE" as const },
              ];
          return { ...section, body };
        }
        return section;
      }),
    },
  };

  const patch: QualityPresentationPatch = {
    ...(next.qualityPatch ?? emptyPatch()),
    titles: {
      ...(next.qualityPatch?.titles ?? {}),
      how_it_works: "Directions for Use",
      guarantee: "Seller-Stated Guarantee",
      specifications: "Ingredients",
      legal: "Affiliate Transparency",
    },
    disclosureBand: true,
    sellerAttribution: true,
    applied: [
      ...new Set<AllowedFixCode>([
        ...(next.qualityPatch?.applied ?? []),
        "IMPROVE_SECTION_TITLES",
        "RETITLE_USAGE_SECTION",
        "IMPROVE_DISCLOSURE_PLACEMENT",
        "SPLIT_USAGE_STEPS",
      ]),
    ],
  };
  return { model: { ...next, qualityPatch: patch }, applied, rejected };
}

export function restoreCopyOptimization(best: V4Model): V4Model {
  return best;
}
