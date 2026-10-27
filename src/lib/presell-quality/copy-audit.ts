import type { V4Model } from "@/lib/product-showcase/v4/model";
import { publicSectionTitle } from "@/lib/product-showcase/v4/presentation";
import { renderedCopyFromModel } from "@/lib/presell-quality/context";

export type CopyAuditFinding = {
  id: string;
  kind:
    | "GENERIC_TITLE"
    | "REPEATED_TEXT"
    | "BROKEN_SENTENCE"
    | "UNCLEAR_USAGE"
    | "MISSING_SELLER_ATTRIBUTION"
    | "WEAK_DISCLOSURE"
    | "UNGROUNDED_TEXT"
    | "EDITORIAL_SPACE";
  section: string;
  detail: string;
};

export type CopyAudit = {
  campaignId: number;
  generationId: string | null;
  acceptedFields: string[];
  renderedCopy: string;
  findings: CopyAuditFinding[];
};

export function auditApprovedCopy(input: {
  campaignId: number;
  generationId?: string | null;
  model: V4Model;
  accepted: Array<{ field: string; value: string; factId?: string }>;
}): CopyAudit {
  const findings: CopyAuditFinding[] = [];
  const acceptedValues = input.accepted.map((item) => item.value.replace(/\s+/g, " ").trim().toLowerCase());
  const titles = input.model.qualityPatch?.titles;
  for (const section of input.model.blueprint.sections) {
    const title = publicSectionTitle(section.sectionType, section.headline.text, titles);
    if (/^(how it works|guarantee|disclosure|overview)$/i.test(section.headline.text) && title === section.headline.text) {
      findings.push({
        id: `title-${section.sectionType}`,
        kind: "GENERIC_TITLE",
        section: section.sectionType,
        detail: `Stored title "${section.headline.text}" is generic.`,
      });
    }
    for (const body of section.body) {
      const text = body.text.trim();
      if (/method$|another method$/i.test(text) && !text.endsWith(".")) {
        findings.push({
          id: `broken-${section.sectionType}`,
          kind: "BROKEN_SENTENCE",
          section: section.sectionType,
          detail: "A usage sentence is cut off before the alternative method.",
        });
      }
      if (section.sectionType === "guarantee" && !/seller/i.test(text) && !/seller/i.test(title)) {
        findings.push({
          id: "guarantee-attribution",
          kind: "MISSING_SELLER_ATTRIBUTION",
          section: "guarantee",
          detail: "Guarantee is not visibly attributed to the seller.",
        });
      }
    }
  }
  const intro = input.model.copy.introduction.text;
  const ingredientFact = input.accepted.find((item) => item.field === "ingredients")?.value ?? "";
  if (intro && ingredientFact && intro.toLowerCase().includes("maca") && /specifications/.test(input.model.blueprint.sections.map((item) => item.sectionType).join(","))) {
    findings.push({
      id: "hero-ingredient-repeat",
      kind: "REPEATED_TEXT",
      section: "hero",
      detail: "Hero description restates the full ingredient list that already has its own section.",
    });
  }
  const legal = input.model.blueprint.sections.find((item) => item.sectionType === "legal");
  const legalText = (legal?.body ?? []).map((item) => item.text).join(" ");
  if (!/commission|affiliate/i.test(legalText) || !input.model.qualityPatch?.disclosureBand) {
    findings.push({
      id: "disclosure-visibility",
      kind: "WEAK_DISCLOSURE",
      section: "legal",
      detail: "Affiliate disclosure is footer-only or easy to miss.",
    });
  }
  const usage = input.accepted.find((item) => item.field === "howItWorks")?.value ?? "";
  if (usage && /maximize absorption/i.test(usage)) {
    findings.push({
      id: "usage-clarity",
      kind: "UNCLEAR_USAGE",
      section: "how_it_works",
      detail: "Usage is a single block. Splitting the two accepted methods would improve scanability without changing quantities.",
    });
  }
  const rendered = renderedCopyFromModel(input.model);
  for (const section of input.model.blueprint.sections) {
    for (const body of section.body) {
      const blob = body.text.toLowerCase();
      if (section.sectionType === "legal" || section.sectionType === "hero") continue;
      const grounded = acceptedValues.some((value) => !value || blob.includes(value.slice(0, 24)) || value.includes(blob.slice(0, 24)));
      if (blob.length > 40 && !grounded && !/seller states|commission|affiliate|sandbox/i.test(blob)) {
        findings.push({
          id: `ungrounded-${section.sectionType}`,
          kind: "UNGROUNDED_TEXT",
          section: section.sectionType,
          detail: "Rendered text is not clearly traceable to an accepted fact.",
        });
      }
    }
  }
  findings.push({
    id: "editorial-space",
    kind: "EDITORIAL_SPACE",
    section: "page",
    detail: "Accepted facts can be shown as distinct titled sections without inventing new claims.",
  });
  return {
    campaignId: input.campaignId,
    generationId: input.generationId ?? null,
    acceptedFields: input.accepted.map((item) => item.field),
    renderedCopy: rendered,
    findings,
  };
}
