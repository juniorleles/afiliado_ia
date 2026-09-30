// npx tsx scripts/test-page-level-faq-authority.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { applyGenericFaqRecovery } from "../src/lib/faq-field-promotion.ts";
import { type ProductFacts } from "../src/lib/product-facts.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import { createEvidenceSlotPlan } from "../src/lib/ai/evidence-slot-plan.ts";
import { buildGenerationFactManifest } from "../src/lib/product-facts.ts";
import { evaluateSlotGeneration, type SlotFill } from "../src/lib/ai/slot-generation.ts";
import { validateGrounding, type FaqAuthorityBinding } from "../src/lib/ai/grounding-validator.ts";
import { checkModelWordingConstraint, validateModelWordingConstraint } from "../src/lib/ai/model-wording-constraint.ts";
import { validateModelSlotAuthority } from "../src/lib/ai/model-slot-authority.ts";
import { lintCampaign } from "../src/lib/policy-linter.ts";
import type { Campaign } from "../src/lib/campaigns.ts";
import { VALIDATION_SAFE_AFFILIATE } from "../src/lib/validation/constants.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function pageQuestionUnsupported(question: string, claims: { claim: string; reason: string }[]): boolean {
  const key = question.trim().toLowerCase();
  return claims.some(
    (item) =>
      item.claim.trim().toLowerCase() === key &&
      /UNSUPPORTED_(USAGE|GUARANTEE)_PRESUPPOSITION/.test(item.reason),
  );
}

const storedFacts = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "data/controlled-ready-13/2026-09-21-controlled-visual-13/import-facts.json"),
    "utf8",
  ),
) as ProductFacts;
const recovered = applyGenericFaqRecovery(storedFacts);
const plan = createGenerationPlan(recovered);
const manifest = buildGenerationFactManifest(recovered);
const projection = projectEvidenceClaims(recovered, plan, manifest);
const slotPlan = createEvidenceSlotPlan(recovered, plan, manifest, projection);
const storedRaw = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/web-anatomy-lab/v1/controlled-rich-replay-v2/generation-raw.json"), "utf8"),
) as { fills: SlotFill[]; ctaLabel: string };

function evaluate(fills: SlotFill[]) {
  return evaluateSlotGeneration(
    { variants: [{ cta: { label: storedRaw.ctaLabel }, slots: fills }] },
    recovered,
    recovered.productName,
    VALIDATION_SAFE_AFFILIATE,
    slotPlan,
  );
}

const evaluation = evaluate(storedRaw.fills);
const faq003 = evaluation.slotTraces.find((item) => item.slotId === "FAQ003");
const faq004 = evaluation.slotTraces.find((item) => item.slotId === "FAQ004");
const pageItems = evaluation.page?.blocks.find((block) => block.type === "FAQ")?.items || [];
const page003 = pageItems.find((item) => item.slotId === "FAQ003");
const page004 = pageItems.find((item) => item.slotId === "FAQ004");

assert(faq003?.questionSemantic?.semanticResult === "PASS", "FAQ003 local question semantics PASS");
assert(faq003?.answerGrounding === "GROUNDED", "FAQ003 local answer GROUNDED");
assert(page003?.field === "usageInformation", "FAQ003 page metadata field is usageInformation");
assert(page003?.semanticAuthority === "USAGE", "FAQ003 page metadata authority is USAGE");
assert(faq004?.questionSemantic?.semanticResult === "PASS", "FAQ004 local question semantics PASS");
assert(faq004?.answerGrounding === "GROUNDED", "FAQ004 local answer GROUNDED");
assert(page004?.field === "guaranteeInformation", "FAQ004 page metadata field is guaranteeInformation");
assert(page004?.semanticAuthority === "GUARANTEE", "FAQ004 page metadata authority is GUARANTEE");

const authorityLoss = evaluation.grounding.unsupportedClaims.filter((item) =>
  /UNSUPPORTED_(USAGE|GUARANTEE)_PRESUPPOSITION/.test(item.reason),
);
assert(authorityLoss.length === 0, "FAQ_AUTHORITY_UNSUPPORTED_CLAIMS=0");
assert(
  !pageQuestionUnsupported("How do you take Joint Genesis?", evaluation.grounding.unsupportedClaims),
  "FAQ003 page-level question SUPPORTED",
);
assert(
  !pageQuestionUnsupported("What is the return policy?", evaluation.grounding.unsupportedClaims),
  "FAQ004 page-level question SUPPORTED",
);

const s003 = slotPlan.slots.find((slot) => slot.slotId === "S003");
const s003Text = storedRaw.fills.find((fill) => fill.slotId === "S003")?.content || "";
assert(Boolean(s003), "S003 slot exists");
const wording = validateModelWordingConstraint({ generated: s003Text, slot: s003! });
assert(
  wording.violations.some((item) => item.violationType === "NEW_SYNERGY"),
  "S003 NEW_SYNERGY remains BLOCKED",
);
assert(
  evaluation.structuralViolations.some(
    (item) => item.code === "MODEL_WORDING_CONSTRAINT_VIOLATION" && /NEW_SYNERGY/.test(item.reason) && /work together/i.test(item.text),
  ),
  "S003 wording constraint remains BLOCKED",
);
const s003Authority = validateModelSlotAuthority({
  copy: s003Text,
  slot: s003!,
  plan,
  productName: recovered.productName,
});
assert(
  s003Authority.some((item) => item.code === "UNSUPPORTED_RELATIONAL_EXPANSION" && /work together/i.test(item.text)),
  "S003 model authority relationship remains BLOCKED",
);
assert(
  evaluation.grounding.unsupportedClaims.some((item) => /work together/i.test(item.claim)),
  "S003 work together remains an unsupported claim",
);

const policy = lintCampaign({
  id: 0,
  name: recovered.productName,
  slug: "slot-eval",
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
} satisfies Campaign);
assert(
  policy.findings.some((item) => item.ruleId === "content.repetition" && item.status === "pass"),
  "planned page no longer duplicates the feature sentence in FINAL_THOUGHTS",
);
const repeatedCampaign: Campaign = {
  id: 0,
  name: recovered.productName,
  slug: "slot-eval",
  headline: evaluation.inspectionCopy.headline,
  body: `${evaluation.inspectionCopy.body}\n\n${evaluation.inspectionCopy.body}`,
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
};
assert(
  lintCampaign(repeatedCampaign).findings.some((item) => item.ruleId === "content.repetition" && item.status === "warn"),
  "content.repetition still warns when a long sentence is duplicated",
);

function bound(question: string, binding: Omit<FaqAuthorityBinding, "question" | "closedTopics">) {
  return validateGrounding(question, recovered, {
    faqAuthorities: [{ ...binding, question, closedTopics: plan.closedTopics }],
  });
}

const usageSupport = "Take one capsule daily with water, preferably in the morning.";
const guaranteeSupport = "The seller publishes a 180-day return policy measured from the order date.";

assert(
  !pageQuestionUnsupported(
    "How do you take Joint Genesis?",
    validateGrounding("How do you take Joint Genesis?", recovered).unsupportedClaims,
  ),
  "plain how-to-take question is supported by copy-eligible usage evidence",
);
assert(
  !pageQuestionUnsupported(
    "How do you take Joint Genesis?",
    bound("How do you take Joint Genesis?", {
      field: "usageInformation",
      topic: "usage",
      semanticAuthority: "USAGE",
      authorizedTopics: ["usage"],
      supportText: usageSupport,
    }).unsupportedClaims,
  ),
  "usage-owned question is supported only with usage authority",
);

const leaks: Array<[string, string, Omit<FaqAuthorityBinding, "question" | "closedTopics">]> = [
  [
    "How do I take Product X?",
    "identity usage leak BLOCKED",
    { field: "productName", topic: "identity", semanticAuthority: "IDENTITY", authorizedTopics: ["identity"], supportText: "Joint Genesis" },
  ],
  [
    "What is the return policy?",
    "identity guarantee leak BLOCKED",
    { field: "productName", topic: "identity", semanticAuthority: "IDENTITY", authorizedTopics: ["identity"], supportText: "Joint Genesis" },
  ],
  [
    "How do I take Product X?",
    "description usage leak BLOCKED",
    { field: "description", topic: "description", semanticAuthority: "DESCRIPTION", authorizedTopics: ["description"], supportText: "Supports lubrication." },
  ],
  [
    "What is the return policy?",
    "description guarantee leak BLOCKED",
    { field: "description", topic: "description", semanticAuthority: "DESCRIPTION", authorizedTopics: ["description"], supportText: "Supports lubrication." },
  ],
  [
    "How do I take Product X?",
    "feature usage leak BLOCKED",
    { field: "features", topic: "features", semanticAuthority: "FEATURE_DESCRIPTION", authorizedTopics: ["features"], supportText: "Supports mobility." },
  ],
  [
    "What is the return policy?",
    "feature guarantee leak BLOCKED",
    { field: "features", topic: "features", semanticAuthority: "FEATURE_DESCRIPTION", authorizedTopics: ["features"], supportText: "Supports mobility." },
  ],
];
for (const [question, label, authority] of leaks) {
  const result = bound(question, authority);
  assert(result.status !== "GROUNDED" && pageQuestionUnsupported(question, result.unsupportedClaims), label);
}

const strengthened = [
  ["What is the money-back guarantee?", "money-back question BLOCKED"],
  ["How do I claim my full refund?", "full refund question BLOCKED"],
  ["Can I try it risk-free?", "risk-free question BLOCKED"],
] as const;
for (const [question, label] of strengthened) {
  const result = bound(question, {
    field: "guaranteeInformation",
    topic: "guarantee",
    semanticAuthority: "GUARANTEE",
    authorizedTopics: ["guarantee"],
    supportText: guaranteeSupport,
  });
  assert(
    result.unsupportedClaims.some((item) => item.claim.trim().toLowerCase() === question.toLowerCase()),
    label,
  );
}

const f14Support = "The seller publishes a 180-day return policy measured from the order date.";
const f14Generated =
  "The seller offers a 180-day return policy measured from the order date, providing customers with an extended window to evaluate the product and request a refund if needed.";
const f14 = checkModelWordingConstraint({
  generated: f14Generated,
  support: f14Support,
  slotId: "S007",
  field: "guaranteeInformation",
});
assert(f14.violations.some((item) => item.violationType === "NEW_POLICY_RIGHT"), "F14 policy-right strengthening BLOCKED");

function policyRightBlocked(phrase: string) {
  const result = checkModelWordingConstraint({
    generated: `${f14Support} ${phrase}`,
    support: f14Support,
    slotId: "S007",
    field: "guaranteeInformation",
  });
  return result.violations.some((item) => item.violationType === "NEW_POLICY_RIGHT");
}
assert(policyRightBlocked("money-back guarantee"), "money-back guarantee BLOCKED");
assert(policyRightBlocked("full refund"), "full refund BLOCKED");
assert(policyRightBlocked("request a refund"), "refund on request BLOCKED");
assert(policyRightBlocked("risk-free"), "risk-free BLOCKED");
assert(policyRightBlocked("evaluation window"), "evaluation window BLOCKED");

const usageStrengthened = [
  ["Why is Product X so easy to take?", "ease of use BLOCKED"],
  ["Why does the manufacturer recommend one capsule?", "manufacturer recommendation BLOCKED"],
] as const;
for (const [question, label] of usageStrengthened) {
  const result = bound(question, {
    field: "usageInformation",
    topic: "usage",
    semanticAuthority: "USAGE",
    authorizedTopics: ["usage"],
    supportText: "Take one capsule daily.",
  });
  assert(
    result.unsupportedClaims.some((item) => item.claim.trim().toLowerCase() === question.toLowerCase()),
    label,
  );
}

function withQuestion(slotId: string, question: string) {
  return evaluate(storedRaw.fills.map((fill) => (fill.slotId === slotId ? { ...fill, question } : fill)));
}

const descriptionLeak = withQuestion("FAQ001", "How do you take Joint Genesis?");
assert(
  descriptionLeak.slotTraces.find((item) => item.slotId === "FAQ001")?.questionSemantic?.semanticResult === "FAIL",
  "description FAQ usage question fails locally",
);
assert(
  pageQuestionUnsupported("How do you take Joint Genesis?", descriptionLeak.grounding.unsupportedClaims),
  "description FAQ usage question fails at page level",
);

const featureLeak = withQuestion("FAQ002", "What is the return policy?");
assert(
  featureLeak.slotTraces.find((item) => item.slotId === "FAQ002")?.questionSemantic?.semanticResult === "FAIL",
  "feature FAQ guarantee question fails locally",
);
assert(
  pageQuestionUnsupported("What is the return policy?", featureLeak.grounding.unsupportedClaims),
  "feature FAQ guarantee question fails at page level",
);

console.log("ANTHROPIC_CALLS=0");
console.log("PAGE_LEVEL_FAQ_AUTHORITY_PROPAGATION_V1=PASS");
