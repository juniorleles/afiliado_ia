/**
 * Policy severity and gate semantics. Fictional products only.
 * Content readiness and publication readiness are separate questions, a review
 * warning never becomes a pass, and human review is never auto-approved.
 */
import { readFileSync } from "node:fs";
import { lintCampaign, type Campaign } from "../src/lib/policy-linter.ts";
import { composeContentReadiness, composePublicationGate } from "../src/lib/ai/grounding-validator.ts";
import { decidePublish, isPublishableContentGate } from "../src/lib/publication.ts";
import { VALIDATION_SAFE_AFFILIATE } from "../src/lib/validation/constants.ts";

let failed = 0;
function assert(condition: unknown, message: string) {
  if (!condition) {
    failed += 1;
    console.error("FAIL: " + message);
  } else {
    console.log("OK: " + message);
  }
}

function lint(body: string) {
  return lintCampaign({
    id: 0,
    name: "Aurelia Drops",
    slug: "aurelia-drops",
    headline: "Aurelia Drops",
    body,
    ctaLabel: "View Product Details",
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
}

function statusOf(body: string, ruleId: string): string {
  return lint(body).findings.find((finding) => finding.ruleId === ruleId)?.status ?? "MISSING";
}

// --- MEDICATION ------------------------------------------------------------
const medication = "health.medication_advice";
assert(statusOf("Consult your doctor before use if you take prescription medication.", medication) === "warn", "A: medication advice warns");
assert(statusOf("If you take prescription medication, show the bottle to your doctor.", medication) === "warn", "B: the sourced caution wording warns");
assert(statusOf("Contains Ingredient Alpha.", medication) === "pass", "C: a composition line does not warn");
assert(statusOf("Take one capsule daily.", medication) === "pass", "D: a usage line does not warn");
const medicationRule = lint("If you take prescription medication, show the bottle to your doctor.").findings.find(
  (finding) => finding.ruleId === medication,
);
assert(medicationRule?.blocking === false, "the medication rule stays non-blocking");
assert(Boolean(medicationRule?.evidence), "the medication warning keeps its evidence for audit");

// --- REFUND DURATION -------------------------------------------------------
const refund = "health.refund_duration";
const refundWarns = [
  "Your order is covered by a 60-day money-back guarantee.",
  "Your order is covered by a 60-day 100% money-back guarantee.",
  "Your order is covered by a 60 day money back guarantee.",
  "Your order is covered by a money-back guarantee for 60 days.",
  "Your order is covered by a 100% money-back guarantee for 60 days.",
  "Your order is covered by a 60-day refund policy.",
  "The seller publishes a 12-week warranty.",
];
for (const body of refundWarns) {
  assert(statusOf(body, refund) === "warn", `refund duration detected: ${JSON.stringify(body)}`);
}

const refundPasses = [
  "Each carton holds 60 lozenges.",
  "Take one capsule daily for 30 days.",
  "The blend uses 4 plants and minerals.",
  "The seller publishes a return policy.",
];
for (const body of refundPasses) {
  assert(statusOf(body, refund) === "pass", `negative control stays clean: ${JSON.stringify(body)}`);
}

// --- GATE MATRIX -----------------------------------------------------------
const pass = [{ status: "pass" as const }];
const warn = [{ status: "pass" as const }, { status: "warn" as const }];
const fail = [{ status: "fail" as const }];

// CASE 1 — grounding pass, policy pass.
assert(
  composeContentReadiness({ grounding: "GROUNDED", policyFindings: pass }) === "CONTENT_READY" &&
    composePublicationGate("READY", "GROUNDED") === "READY",
  "CASE 1: content ready and publication gate READY",
);

// CASE 2 — grounding pass, non-blocking review warning only.
assert(composeContentReadiness({ grounding: "GROUNDED", policyFindings: warn }) === "CONTENT_READY", "CASE 2: a review warning keeps the content valid");
assert(composePublicationGate("REVIEW_REQUIRED", "GROUNDED") === "REVIEW_REQUIRED", "CASE 2: publication still needs review");
assert(isPublishableContentGate("REVIEW_REQUIRED") === false, "CASE 2: REVIEW_REQUIRED is not publishable");
assert(decidePublish("REVIEW_REQUIRED", true) !== "allow", "CASE 2: confirming warnings does not publish");

// CASE 3 — grounding pass, blocking policy failure.
assert(composeContentReadiness({ grounding: "GROUNDED", policyFindings: fail }) === "CONTENT_BLOCKED", "CASE 3: a failing policy rule blocks the content");
assert(composePublicationGate("BLOCKED", "GROUNDED") === "BLOCKED", "CASE 3: publication is blocked");

// CASE 4 — grounding failure.
assert(composeContentReadiness({ grounding: "UNGROUNDED", policyFindings: pass }) === "CONTENT_BLOCKED", "CASE 4: ungrounded copy blocks the content");
assert(composeContentReadiness({ grounding: "REVIEW_REQUIRED", policyFindings: pass }) === "CONTENT_BLOCKED", "CASE 4: grounding doubt also blocks the content");
assert(composePublicationGate("READY", "UNGROUNDED") === "BLOCKED", "CASE 4: publication is blocked regardless of policy");

// CASE 5 — proposition binding failure.
assert(
  composeContentReadiness({ grounding: "GROUNDED", policyFindings: pass, propositionBindingViolations: 1 }) === "CONTENT_BLOCKED",
  "CASE 5: a binding violation blocks the content",
);
assert(
  composeContentReadiness({ grounding: "GROUNDED", policyFindings: pass, structuralViolations: 1 }) === "CONTENT_BLOCKED",
  "CASE 5: a structural violation blocks the content",
);

// --- NO AUTO-APPROVAL ------------------------------------------------------
const publication = readFileSync("src/lib/publication.ts", "utf8");
const grounding = readFileSync("src/lib/ai/grounding-validator.ts", "utf8");
assert(/gate === "READY"/.test(publication) && !/confirmWarnings\s*&&/.test(publication), "publication still allows only READY");
assert(!/HUMAN_APPROVED|autoApprove|markReviewed/i.test(publication + grounding), "no code path fabricates human approval");
assert(!/(?:prodentim|joint[\s-]?genesis|aurelia)/i.test(readFileSync("src/lib/policy-linter.ts", "utf8")), "the policy layer names no product");

if (failed) {
  console.error("POLICY_REVIEW_SEMANTICS=FAIL " + failed);
  process.exit(1);
}
console.log("POLICY_REVIEW_SEMANTICS=PASS");
