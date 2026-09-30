/**
 * POLICY SEMANTICS REVALIDATION
 * Revalidates persisted replay content against today's policy and gate
 * semantics. No network, no model call, no regeneration.
 *
 * npx tsx scripts/run-policy-semantics-v1.ts --dir=data/generic-lp-engine/v1/<replay>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import { createEvidenceSlotPlan, type EvidenceSlot } from "../src/lib/ai/evidence-slot-plan.ts";
import { validatePropositionBindings } from "../src/lib/ai/authorized-propositions.ts";
import { validateModelSlotAuthority } from "../src/lib/ai/model-slot-authority.ts";
import { validateModelWordingConstraint } from "../src/lib/ai/model-wording-constraint.ts";
import { evaluateSlotGeneration, type SlotFill } from "../src/lib/ai/slot-generation.ts";
import { pageFaqAuthorityBindings } from "../src/lib/ai/structured-generation.ts";
import { composeContentReadiness, validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import { lintCampaign, type Campaign } from "../src/lib/policy-linter.ts";
import { decidePublish } from "../src/lib/publication.ts";
import { VALIDATION_SAFE_AFFILIATE } from "../src/lib/validation/constants.ts";
import { buildGenerationFactManifest, type ProductFacts } from "../src/lib/product-facts.ts";

const replayDir = process.argv.find((item) => item.startsWith("--dir="))?.slice(6);
if (!replayDir) throw new Error("--dir is required");
const outDir = path.join(replayDir, "policy-semantics-v1");
mkdirSync(outDir, { recursive: true });
const write = (name: string, value: unknown) => writeFileSync(path.join(outDir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");

const facts = (JSON.parse(readFileSync(path.join(replayDir, "product-facts.json"), "utf8")) as { facts: ProductFacts }).facts;
const generated = JSON.parse(readFileSync(path.join(replayDir, "generation-raw.json"), "utf8")) as {
  ctaLabel: string;
  fills: SlotFill[];
};

const plan = createGenerationPlan(facts);
const manifest = buildGenerationFactManifest(facts);
const projection = projectEvidenceClaims(facts, plan, manifest);
const slotPlan = createEvidenceSlotPlan(facts, plan, manifest, projection);
const byFill = new Map(generated.fills.map((fill) => [fill.slotId, fill]));

const boundWording = (rows: SlotFill["propositions"]) => (rows || []).map((item) => item.wording.trim()).filter(Boolean).join(" ");
const slotWording = (slot: EvidenceSlot, fill: SlotFill | undefined) => {
  if (!fill) return "";
  if (slot.type === "FAQ") {
    const answer = (fill.answer || "").trim() || boundWording(fill.answerPropositions);
    return `${fill.question || ""} ${answer}`.trim();
  }
  return boundWording(fill.propositions) || (fill.content || "").trim();
};

const evaluation = evaluateSlotGeneration(
  { variants: [{ cta: { label: generated.ctaLabel }, slots: generated.fills }] },
  facts,
  facts.productName,
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);

const bindingViolations = slotPlan.slots.flatMap((slot) => {
  const fill = byFill.get(slot.slotId);
  if (!fill) return [];
  return validatePropositionBindings({ fill, slot, slots: slotPlan.slots, plan, productName: facts.productName });
});
const authorityViolations = slotPlan.slots.flatMap((slot) => {
  const copy = slotWording(slot, byFill.get(slot.slotId));
  if (!copy) return [];
  return validateModelSlotAuthority({ copy, slot, plan, productName: facts.productName });
});
const wordingViolations = slotPlan.slots.flatMap((slot) => {
  const generatedCopy = slotWording(slot, byFill.get(slot.slotId));
  if (!generatedCopy) return [];
  return validateModelWordingConstraint({ generated: generatedCopy, slot }).violations;
});
const unauthorizedSlotFills = generated.fills.filter((fill) => !slotPlan.slots.some((slot) => slot.slotId === fill.slotId));
const pageGrounding = evaluation.page
  ? validateGrounding(`${evaluation.inspectionCopy.headline}\n${evaluation.inspectionCopy.body}`, facts, {
      faqAuthorities: pageFaqAuthorityBindings(evaluation.page, { closedTopics: plan.closedTopics }),
    })
  : { status: "GROUNDED" as const, unsupportedClaims: [] as Array<{ claim: string; reason: string }> };

const lint = lintCampaign({
  id: 0,
  name: facts.productName,
  slug: "policy-semantics-revalidation",
  headline: evaluation.inspectionCopy.headline,
  body: evaluation.inspectionCopy.body,
  ctaLabel: evaluation.inspectionCopy.ctaLabel,
  affiliateUrl: VALIDATION_SAFE_AFFILIATE,
  headScript: null,
  adHeadline: null,
  publicationStatus: "draft",
  publishedAt: null,
  createdAt: "",
  updatedAt: "",
  pageTemplate: null,
  pageComposition: null,
  productImageSrc: null,
  productImageProvenance: null,
  subheadline: null,
  sourceFactsJson: null,
} as unknown as Campaign);

const semanticAuthority =
  authorityViolations.length === 0 && unauthorizedSlotFills.length === 0 && wordingViolations.length === 0 ? "PASS" : "FAIL";
const contentReadiness = composeContentReadiness({
  grounding: evaluation.grounding.status,
  policyFindings: lint.findings,
  structuralViolations: evaluation.structuralViolations.length,
  propositionBindingViolations: bindingViolations.length,
});
const publicationGate = evaluation.finalGate;
const publishDecision = decidePublish(publicationGate, true);

const result = {
  revalidationVersion: "policy-semantics-v1",
  source: replayDir,
  contentRegenerated: false,
  anthropicContentCalls: 0,
  openAiImageCalls: 0,
  semanticAuthority,
  grounding: evaluation.grounding.status,
  unsupportedClaims: evaluation.grounding.unsupportedClaims.length + pageGrounding.unsupportedClaims.length,
  propositionBindingViolations: bindingViolations.length,
  structuralViolations: evaluation.structuralViolations.length,
  policyGate: lint.gate,
  policyFindings: lint.findings
    .filter((finding) => finding.status !== "pass")
    .map((finding) => ({
      ruleId: finding.ruleId,
      status: finding.status,
      blocking: finding.blocking,
      evidence: finding.evidence ?? "",
      message: finding.message,
    })),
  contentReadiness,
  publicationGate,
  publishDecisionWithConfirmedWarnings: publishDecision,
  humanReviewRequired: publicationGate !== "READY",
  humanReviewApproved: false,
};

write("revalidation.json", result);
write("copy.json", {
  headline: evaluation.inspectionCopy.headline,
  body: evaluation.inspectionCopy.body,
  ctaLabel: evaluation.inspectionCopy.ctaLabel,
});

console.log(
  `CONTENT_READINESS=${contentReadiness} PUBLICATION_GATE=${publicationGate} POLICY=${lint.gate} GROUNDING=${evaluation.grounding.status} ` +
    `UNSUPPORTED=${result.unsupportedClaims} BINDING=${bindingViolations.length} AUTHORITY=${semanticAuthority} CALLS=0`,
);
for (const finding of result.policyFindings) {
  console.log(`POLICY ${finding.status.toUpperCase()} ${finding.ruleId} blocking=${finding.blocking} evidence=${JSON.stringify(finding.evidence)}`);
}
