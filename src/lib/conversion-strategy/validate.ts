import type { ProductContract } from "@/lib/product-contract/types";
import type { ConversionBrief, TracedClaim } from "@/lib/conversion-strategy/types";

export type BriefViolation = { rule: string; path: string; message: string };

const FORBIDDEN = /clinically proven|doctors worldwide|verified buyer|★★|testimonial|limited time|%\s*off|best greens|immune support complex/i;

function claims(brief: ConversionBrief): Array<{ path: string; claim: TracedClaim }> {
  const out: Array<{ path: string; claim: TracedClaim }> = [];
  const add = (path: string, claim: TracedClaim | undefined) => {
    if (claim) out.push({ path, claim });
  };
  add("audienceHypothesis", brief.audienceHypothesis);
  add("valueProposition", brief.valueProposition);
  add("primaryMessage", brief.primaryMessage);
  brief.keyDifferentiators.forEach((claim, i) => add(`keyDifferentiators[${i}]`, claim));
  brief.objections.forEach((claim, i) => add(`objections[${i}]`, claim));
  brief.benefitCandidates.forEach((claim, i) => add(`benefitCandidates[${i}]`, claim));
  brief.offerStrategy.notes.forEach((claim, i) => add(`offerStrategy.notes[${i}]`, claim));
  brief.trustSignals.forEach((claim, i) => add(`trustSignals[${i}]`, claim));
  brief.creativeBrief.notes.forEach((claim, i) => add(`creativeBrief.notes[${i}]`, claim));
  return out;
}

export function validateConversionBrief(brief: ConversionBrief, contract: ProductContract): { ok: boolean; violations: BriefViolation[] } {
  const violations: BriefViolation[] = [];
  const evidenceIds = new Set(contract.evidence.map((entry) => entry.id));
  const contractTexts = new Set<string>();
  const remember = (text: string | undefined) => {
    if (text) contractTexts.add(text.trim());
  };
  remember(contract.identity.productName);
  remember(contract.valueProposition?.headline?.text);
  remember(contract.description?.text);
  (contract.features ?? []).forEach((item) => remember(item.text));
  (contract.benefits ?? []).forEach((item) => remember(item.text));
  (contract.specifications ?? []).forEach((item) => remember(`${item.name} ${item.value}`));
  (contract.components ?? []).forEach((item) => remember(item.name));
  (contract.usage ?? []).forEach((item) => remember(item.text));
  (contract.cautions ?? []).forEach((item) => remember(item.text));
  (contract.offer?.packages ?? []).forEach((item) => {
    remember(item.label);
    remember(item.totalPrice);
    remember(item.quantity?.text);
  });
  if (contract.guarantee) remember(contract.guarantee.text);
  (contract.operational?.returns ?? []).forEach((item) => remember(item.statement));
  (contract.operational?.shipping ?? []).forEach((item) => remember(item.statement));
  (contract.cautions ?? []).forEach((item) => remember(item.text));
  (contract.faq ?? []).forEach((item) => remember(item.question));

  if (brief.publication.approval !== "REQUIRED") {
    violations.push({ rule: "PUBLICATION", path: "publication.approval", message: "approval must stay REQUIRED" });
  }

  for (const { path, claim } of claims(brief)) {
    if (claim.class === "FACT" && claim.restriction === "PUBLISHABLE") {
      if (claim.evidenceRefs.length === 0 && !["offer-missing", "offer-partial"].includes(claim.id)) {
        violations.push({ rule: "GROUNDING", path, message: "publishable fact has no evidence refs" });
      }
      for (const ref of claim.evidenceRefs) {
        if (!evidenceIds.has(ref)) violations.push({ rule: "EVIDENCE_REF", path, message: `unknown evidence ${ref}` });
      }
      if (claim.text && !contractTexts.has(claim.text.trim()) && !/^No verified price|^A price was mentioned/.test(claim.text)) {
        violations.push({ rule: "TRACE", path, message: "publishable text is not in the contract" });
      }
    }
    if ((claim.class === "HYPOTHESIS" || claim.class === "EDITORIAL_SUGGESTION") && claim.restriction !== "INTERNAL_ONLY") {
      violations.push({ rule: "CLASS", path, message: "hypothesis/suggestion must stay INTERNAL_ONLY" });
    }
    if (FORBIDDEN.test(claim.text)) {
      violations.push({ rule: "POLICY", path, message: "forbidden commercial invention" });
    }
  }

  if (brief.ctaStrategy.action === "AUTHORIZED_HOP") {
    if (contract.cta.state !== "AUTHORIZED" || contract.gates.link !== "PASS") {
      violations.push({ rule: "CTA", path: "ctaStrategy", message: "hop is not allowed by the contract gates" });
    }
    if (brief.ctaStrategy.href !== contract.cta.href) {
      violations.push({ rule: "CTA", path: "ctaStrategy.href", message: "href does not match the contract" });
    }
  } else if (brief.ctaStrategy.href) {
    violations.push({ rule: "CTA", path: "ctaStrategy.href", message: "blocked CTA must not carry a href" });
  }

  const inventedOffer = brief.packagePresentation.some((pack) => !(contract.offer?.packages ?? []).some((real) => real.label === pack.label));
  if (inventedOffer) violations.push({ rule: "OFFER", path: "packagePresentation", message: "package was not in the contract" });

  if (brief.benefitCandidates.length !== (contract.benefits?.length ?? 0)) {
    violations.push({ rule: "BENEFIT", path: "benefitCandidates", message: "benefit count drifted from the contract" });
  }

  const included = brief.sectionPlan.filter((item) => item.include);
  if (!included.some((item) => item.type === "legal")) {
    violations.push({ rule: "SECTION", path: "sectionPlan", message: "legal section must remain included" });
  }
  if (!included.some((item) => item.type === "hero")) {
    violations.push({ rule: "SECTION", path: "sectionPlan", message: "hero section must remain included" });
  }

  return { ok: violations.length === 0, violations };
}
