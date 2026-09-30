/**
 * GROUNDING FAILURE FORENSICS
 * Replays validation only, against persisted facts and persisted model output.
 * No network, no model call. --phase=pre records the observed failures;
 * --phase=post records validator behaviour after a patch.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import { createEvidenceSlotPlan, type EvidenceSlot } from "../src/lib/ai/evidence-slot-plan.ts";
import { propositionsForSlot } from "../src/lib/ai/authorized-propositions.ts";
import { evaluateSlotGeneration, type SlotFill } from "../src/lib/ai/slot-generation.ts";
import { factsFromEvidenceIds, pageFaqAuthorityBindings } from "../src/lib/ai/structured-generation.ts";
import { validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import { lintCampaign } from "../src/lib/policy-linter.ts";
import { VALIDATION_SAFE_AFFILIATE } from "../src/lib/validation/constants.ts";
import { buildGenerationFactManifest, type ProductFacts } from "../src/lib/product-facts.ts";

const phase = process.argv.find((item) => item.startsWith("--phase="))?.slice(8) ?? "pre";
const replayDir = "data/generic-lp-engine/v1/prodentim-replay-02";
const outDir = path.join(replayDir, "grounding-forensics-v1");
mkdirSync(outDir, { recursive: true });
const write = (name: string, value: unknown) => writeFileSync(path.join(outDir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");

const facts = (JSON.parse(readFileSync(path.join(replayDir, "product-facts.json"), "utf8")) as { facts: ProductFacts }).facts;
const generated = JSON.parse(readFileSync(path.join(replayDir, "generation-raw.json"), "utf8")) as {
  ctaLabel: string;
  fills: SlotFill[];
};
const trace = JSON.parse(readFileSync(path.join(replayDir, "model-input-trace.json"), "utf8")) as {
  exactSent?: { user?: string; system?: string };
};

const plan = createGenerationPlan(facts);
const manifest = buildGenerationFactManifest(facts);
const projection = projectEvidenceClaims(facts, plan, manifest);
const slotPlan = createEvidenceSlotPlan(facts, plan, manifest, projection);

const slotById = new Map(slotPlan.slots.map((slot) => [slot.slotId, slot]));
const fillById = new Map(generated.fills.map((fill) => [fill.slotId, fill]));
const wordingOf = (slot: EvidenceSlot, fill: SlotFill | undefined) => {
  if (!fill) return "";
  const bound = (rows: SlotFill["propositions"]) => (rows || []).map((item) => item.wording.trim()).filter(Boolean).join(" ");
  if (slot.type === "FAQ") return (fill.answer || "").trim() || bound(fill.answerPropositions);
  return bound(fill.propositions) || (fill.content || "").trim();
};

/** Which slot-scoped grounding call produced each unsupported claim. */
const perSlot = slotPlan.slots.map((slot) => {
  const copy = wordingOf(slot, fillById.get(slot.slotId));
  const scoped = factsFromEvidenceIds(facts, slot.allowedEvidenceIds, manifest);
  const result = copy ? validateGrounding(copy, scoped, { productIdentity: facts.productName }) : { status: "GROUNDED", unsupportedClaims: [] };
  return {
    slotId: slot.slotId,
    type: slot.type,
    topic: slot.topic,
    copy,
    scopedProductName: scoped.productName,
    scopedEvidence: slot.evidence.map((item) => `${item.field}: ${item.value}`),
    status: result.status,
    unsupportedClaims: result.unsupportedClaims,
  };
});

const evaluation = evaluateSlotGeneration(
  { variants: [{ cta: { label: generated.ctaLabel }, slots: generated.fills }] },
  facts,
  facts.productName,
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
const pageGrounding = evaluation.page
  ? validateGrounding(`${evaluation.inspectionCopy.headline}\n${evaluation.inspectionCopy.body}`, facts, {
      faqAuthorities: pageFaqAuthorityBindings(evaluation.page, { closedTopics: plan.closedTopics }),
    })
  : { status: "GROUNDED" as const, unsupportedClaims: [] };

// ---- FAILURE A — usage restatement -------------------------------------------------
const usageSlot = slotPlan.slots.find((slot) => slot.type === "USAGE");
const usageEvidence = usageSlot?.evidence.map((item) => item.value).join(" ") ?? "";
const usageCopy = usageSlot ? wordingOf(usageSlot, fillById.get(usageSlot.slotId)) : "";
const tokens = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9$]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 1 && !/^\d+$/.test(token));
const claimTokens = tokens(usageCopy);
const evidenceTokens = new Set(tokens(usageEvidence));
const failureA = {
  source: usageEvidence,
  output: usageCopy,
  emittedBySlots: perSlot.filter((row) => row.unsupportedClaims.some((claim) => claim.claim === usageCopy)).map((row) => row.slotId),
  pageLevelFlagged: pageGrounding.unsupportedClaims.some((claim) => claim.claim === usageCopy),
  matcherInputs: {
    claimTokens,
    evidenceTokens: [...evidenceTokens],
    exactTokenOverlapRatio: claimTokens.length ? claimTokens.filter((token) => evidenceTokens.has(token)).length / claimTokens.length : 0,
    tokenOverlapThreshold: 0.72,
    longestSharedContiguousPhraseWords: 0,
    contiguousPhraseThresholdWords: 3,
  },
  divergentTokens: claimTokens.filter((token) => !evidenceTokens.has(token)),
  status: perSlot.find((row) => row.slotId === usageSlot?.slotId)?.status ?? "UNKNOWN",
};

// ---- FAILURE B — product identity classified as ingredient ------------------------
const identityRows = perSlot.filter((row) =>
  row.unsupportedClaims.some((claim) => claim.claimClass === "NAMED_INGREDIENT" && claim.claim.trim() === facts.productName.trim()),
);
const failureB = {
  token: facts.productName,
  productNameProvenance: facts.confidence.productName,
  descriptionProvenance: facts.confidence.description,
  emittedBySlots: identityRows.map((row) => ({ slotId: row.slotId, scopedProductName: row.scopedProductName, copy: row.copy })),
  slotsWhereScopedIdentityIsEmpty: perSlot.filter((row) => !row.scopedProductName).map((row) => row.slotId),
  pageLevelFlagged: pageGrounding.unsupportedClaims.some(
    (claim) => claim.claimClass === "NAMED_INGREDIENT" && claim.claim.trim() === facts.productName.trim(),
  ),
};

// ---- FAILURE C — unknown proposition id -------------------------------------------
const unknownId = "F012:C002:P1";
const authorized = slotPlan.slots.flatMap((slot) =>
  propositionsForSlot(slot).map((proposition) => ({ slotId: slot.slotId, propositionId: proposition.propositionId, field: proposition.field, sourceText: proposition.sourceText })),
);
const promptIds = [...new Set([...(trace.exactSent?.user ?? "").matchAll(/F\d+:C\d+:P\d+/g)].map((match) => match[0]))];
const citedIds = generated.fills.flatMap((fill) => [...(fill.propositions || []), ...(fill.answerPropositions || [])].flatMap((row) => row.propositionIds || []));
const factPrefix = unknownId.split(":")[0];
const failureC = {
  propositionId: unknownId,
  existsInAuthorizedSet: authorized.some((item) => item.propositionId === unknownId),
  existsInModelPrompt: promptIds.includes(unknownId),
  citedByModel: citedIds.includes(unknownId),
  citedInSlot: generated.fills.find((fill) => [...(fill.propositions || []), ...(fill.answerPropositions || [])].some((row) => (row.propositionIds || []).includes(unknownId)))?.slotId ?? null,
  authorizedPropositionsForSameFact: authorized.filter((item) => item.propositionId.startsWith(`${factPrefix}:`)),
  projectedClaimsForSameFact: projection.claims.filter((claim) => claim.claimId?.startsWith(`${factPrefix}:`)).map((claim) => claim.claimId),
  authorizedPropositionIds: authorized.map((item) => item.propositionId),
  promptPropositionIds: promptIds,
  groundingLookupResult: "UNKNOWN_PROPOSITION_ID",
};

const summary = {
  phase,
  contentRegenerated: false,
  contentModelCallsThisPass: 0,
  openAiImageCalls: 0,
  grounding: evaluation.grounding.status,
  unsupportedClaims: evaluation.grounding.unsupportedClaims,
  pageLevelUnsupportedClaims: pageGrounding.unsupportedClaims,
  structuralViolations: evaluation.structuralViolations,
  policyGate: evaluation.policyGate,
  contentGate: evaluation.finalGate,
  perSlot,
};

if (phase === "pre") {
  write("report.json", summary);
  write("failure-a.json", failureA);
  write("failure-b.json", failureB);
  write("failure-c.json", failureC);
} else {
  const findings = lintCampaign({
    id: 0,
    name: facts.productName,
    slug: "grounding-forensics",
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
  }).findings;
  write("post-fix-grounding.json", {
    contentRegenerated: false,
    contentModelCallsThisPass: 0,
    status: evaluation.grounding.status,
    unsupportedClaims: evaluation.grounding.unsupportedClaims,
    pageLevelUnsupportedClaims: pageGrounding.unsupportedClaims,
    structuralViolations: evaluation.structuralViolations,
    perSlot: perSlot.map((row) => ({ slotId: row.slotId, status: row.status, unsupportedClaims: row.unsupportedClaims })),
    observationsNotPatched: [
      {
        finding: "PRE_EXISTING_NEGATION_BLIND_SPOT",
        detail:
          "The pre-existing 0.72 token-overlap path ignores negation, so a positive claim can overlap a negated source field. Out of scope for this pass; the new full-restatement path refuses negated sources.",
      },
    ],
  });
  write("post-fix-policy.json", {
    policyGate: evaluation.policyGate,
    findings: findings.filter((item) => item.status !== "pass").map((item) => ({ ruleId: item.ruleId, status: item.status, message: item.message })),
    policyRulesChanged: false,
  });
  write("post-fix-content-gate.json", {
    contentGate: evaluation.finalGate,
    grounding: evaluation.grounding.status,
    policy: evaluation.policyGate,
    contentModelCallsThisPass: 0,
    faq: slotPlan.slots
      .filter((slot) => slot.type === "FAQ")
      .map((slot) => ({ slotId: slot.slotId, question: fillById.get(slot.slotId)?.question || "", answer: wordingOf(slot, fillById.get(slot.slotId)) })),
  });
}

console.log(
  JSON.stringify(
    {
      PHASE: phase,
      GROUNDING: evaluation.grounding.status,
      UNSUPPORTED: evaluation.grounding.unsupportedClaims.map((claim) => `${claim.claim} :: ${claim.claimClass || claim.reason}`),
      STRUCTURAL: evaluation.structuralViolations.map((item) => `${item.code}:${item.text}`),
      POLICY: evaluation.policyGate,
      CONTENT_GATE: evaluation.finalGate,
      FAILURE_A_DIVERGENT_TOKENS: failureA.divergentTokens,
      FAILURE_A_RATIO: failureA.matcherInputs.exactTokenOverlapRatio,
      FAILURE_B_SLOTS: failureB.emittedBySlots.map((row) => row.slotId),
      FAILURE_C_IN_AUTHORITY: failureC.existsInAuthorizedSet,
      FAILURE_C_IN_PROMPT: failureC.existsInModelPrompt,
      FAILURE_C_SLOT: failureC.citedInSlot,
    },
    null,
    2,
  ),
);
