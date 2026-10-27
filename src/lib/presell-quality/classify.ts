import type { PresellQualityAssessment } from "@/lib/presell-quality/types";
import {
  emptyPatch,
  type AllowedFixCode,
  type ForbiddenFixCode,
  type QualityPresentationPatch,
} from "@/lib/presell-quality/patch";

const FORBIDDEN_PATTERNS: Array<{ code: ForbiddenFixCode; re: RegExp }> = [
  { code: "INVENT_BENEFIT", re: /\binvent\b.*\b(benefit|claim)|add (new )?benefits?|unverified benefit/i },
  { code: "INVENT_TESTIMONIAL", re: /testimonial|review quote|customer stor(y|ies)/i },
  { code: "INVENT_HEALTH_CLAIM", re: /clinical claim|\bcure\b|treat diabetes|fda.?approv|medical (claim|proof)/i },
  { code: "GENERATE_PACKSHOT", re: /generat(e|ed) (a )?(fake )?packshot|ai[- ]generat(ed|e) (product )?image|synthetic packshot/i },
  { code: "APPROVE_ASSET", re: /auto-?approve (the )?(asset|image)|approve (this|the) (asset|image)/i },
  { code: "CHANGE_INGREDIENT", re: /change ingredient|add ingredient|alter (the )?formula/i },
  { code: "CHANGE_GUARANTEE", re: /change (the )?guarantee|extend (the )?refund|invent (a )?warranty/i },
  { code: "AUTHORIZE_COMMERCIAL", re: /authoriz(e|ation).{0,24}commercial|enable (the )?hop|live affiliate/i },
  { code: "PUBLISH", re: /\bpublish\b|google ads|activate ads/i },
  { code: "PROMOTE_UNELIGIBLE_HERO", re: /promot(e|ing).{0,40}hero|use gallery.{0,24}hero|move .{0,24}to (the )?hero/i },
];

function blobOf(assessment: PresellQualityAssessment): string {
  return [
    ...assessment.findings.map((item) => `${item.id} ${item.message} ${item.evidence.join(" ")}`),
    ...assessment.recommendedActions.map((item) => `${item.id} ${item.action} ${item.reason}`),
  ].join("\n");
}

function already(applied: AllowedFixCode[], code: AllowedFixCode): boolean {
  return applied.includes(code);
}

export function classifyQualityFixes(input: {
  assessment: PresellQualityAssessment;
  heroEligible: boolean;
  previous?: QualityPresentationPatch | null;
}): QualityPresentationPatch {
  const previous = input.previous ?? emptyPatch();
  const applied = [...previous.applied];
  const rejected = [...previous.rejected];
  const blob = blobOf(input.assessment);
  const titles = { ...previous.titles };

  const markForbidden = (code: ForbiddenFixCode, reason: string) => {
    if (!rejected.some((item) => item.code === code)) rejected.push({ code, reason });
  };

  for (const action of input.assessment.recommendedActions) {
    const text = `${action.action} ${action.reason}`;
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.re.test(text) || action.allowed === false && pattern.re.test(text)) {
        if (pattern.code === "PROMOTE_UNELIGIBLE_HERO" && input.heroEligible) continue;
        markForbidden(pattern.code, action.reason || action.action);
      }
    }
    if (!action.allowed) {
      markForbidden(
        FORBIDDEN_PATTERNS.find((item) => item.re.test(text))?.code ?? "INVENT_BENEFIT",
        action.reason || "Model marked this action as not allowed.",
      );
    }
  }

  if (!input.heroEligible && /hero/i.test(blob) && /image|packshot|photo|gallery/i.test(blob)) {
    markForbidden("PROMOTE_UNELIGIBLE_HERO", "No asset is eligible for the hero. Gallery images stay in the gallery.");
  }

  const allow = (code: AllowedFixCode) => {
    if (!already(applied, code)) applied.push(code);
  };

  if (/how it works|directions for use|usage title|instructions title/i.test(blob)) {
    allow("RETITLE_USAGE_SECTION");
    titles.how_it_works = "Directions for Use";
  }
  if (/section title|editorial title|headline mismatch/i.test(blob)) {
    allow("IMPROVE_SECTION_TITLES");
  }
  if (/gallery|composition|rank(ed)? image|more images/i.test(blob) && !input.heroEligible) {
    allow("RANK_GALLERY");
  }
  if (/empty hero|hero (is )?(empty|sparse)|spacing|hierarch|typography|layout/i.test(blob)) {
    allow("TIGHTEN_HERO_LAYOUT");
  }
  if (/sandbox|cta badge|lab cta/i.test(blob)) {
    allow("QUIET_SANDBOX_CTA");
  }

  return {
    titles: Object.keys(titles).length ? titles : previous.titles,
    galleryLead: applied.includes("RANK_GALLERY") || previous.galleryLead,
    tightenHero: applied.includes("TIGHTEN_HERO_LAYOUT") || previous.tightenHero,
    sandboxQuiet: applied.includes("QUIET_SANDBOX_CTA") || previous.sandboxQuiet,
    applied,
    rejected,
  };
}

export function hasNewAllowedFix(previous: QualityPresentationPatch | null | undefined, next: QualityPresentationPatch): boolean {
  const before = new Set(previous?.applied ?? []);
  return next.applied.some((code) => !before.has(code));
}
