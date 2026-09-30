/**
 * CONTROLLED RICH END-TO-END REPLAY V3
 * One Anthropic call. No retry, no composition, no architecture patch.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applyGenericFaqRecovery } from "../src/lib/faq-field-promotion.ts";
import { buildGenerationFactManifest, type ProductFacts } from "../src/lib/product-facts.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import { createEvidenceSlotPlan, type EvidenceSlot } from "../src/lib/ai/evidence-slot-plan.ts";
import { ANTHROPIC_MODEL, generateVariants } from "../src/lib/ai/generate-variants.ts";
import { evaluateSlotGeneration, type SlotFill } from "../src/lib/ai/slot-generation.ts";
import { propositionsForSlot } from "../src/lib/ai/authorized-propositions.ts";
import { validateModelWordingConstraint } from "../src/lib/ai/model-wording-constraint.ts";
import { validateModelSlotAuthority } from "../src/lib/ai/model-slot-authority.ts";
import { collectSlotProjectionViolations, visibleSemanticTopics } from "../src/lib/ai/slot-projection-isolation.ts";
import { pageFaqAuthorityBindings } from "../src/lib/ai/structured-generation.ts";
import { validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import { lintCampaign } from "../src/lib/policy-linter.ts";
import { VALIDATION_SAFE_AFFILIATE } from "../src/lib/validation/constants.ts";

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

const EXPECTED_USAGE = "Take one capsule daily with water, preferably in the morning.";
const EXPECTED_GUARANTEE = "The seller publishes a 180-day return policy measured from the order date.";

function boundWording(rows: SlotFill["propositions"]): string {
  return (rows || [])
    .map((item) => item.wording.trim())
    .filter(Boolean)
    .join(" ");
}

function propositionIds(rows: SlotFill["propositions"]): string[] {
  return (rows || []).flatMap((item) =>
    item.propositionIds?.length ? item.propositionIds : item.propositionId ? [item.propositionId] : [],
  );
}

function slotWording(slot: EvidenceSlot, fill: SlotFill | undefined): string {
  if (!fill) return "";
  if (slot.type === "FAQ") {
    const answer = (fill.answer || "").trim() || boundWording(fill.answerPropositions);
    return `${fill.question || ""} ${answer}`.trim();
  }
  return boundWording(fill.propositions) || (fill.content || "").trim();
}

function answerWording(fill: SlotFill | undefined): string {
  if (!fill) return "";
  return (fill.answer || "").trim() || boundWording(fill.answerPropositions);
}

async function main() {
  loadLocalEnv();
  const root = process.cwd();
  const sourceRun = path.join(root, "data/controlled-ready-13/2026-09-21-controlled-visual-13");
  const out = path.join(root, "data/web-anatomy-lab/v1/controlled-rich-replay-v3");
  mkdirSync(out, { recursive: true });

  const stored = JSON.parse(readFileSync(path.join(sourceRun, "import-facts.json"), "utf8")) as ProductFacts;
  const recovered = applyGenericFaqRecovery(stored);
  const strategy = JSON.parse(readFileSync(path.join(sourceRun, "strategy.json"), "utf8")) as {
    recommendedStrategy: "REVIEW" | "COMPARISON" | "PROBLEM_SOLUTION";
  };
  const plan = createGenerationPlan(recovered);
  const manifest = buildGenerationFactManifest(recovered);
  const projection = projectEvidenceClaims(recovered, plan, manifest);
  const slotPlan = createEvidenceSlotPlan(recovered, plan, manifest, projection);
  const preModel = collectSlotProjectionViolations(slotPlan.slots);
  const finalThoughts = slotPlan.slots.find((slot) => slot.type === "FINAL_THOUGHTS");

  const projected = (type: string, topic?: string) => {
    const slots = slotPlan.slots.filter((item) => item.type === type && (!topic || item.topic === topic));
    return slots.map((slot) => slot.evidence.map((item) => item.value).join(" ")).join("\n");
  };
  const descriptionFaq = slotPlan.slots.find((slot) => slot.type === "FAQ" && slot.topic === "description");
  const sees = {
    DESCRIPTION_SEES_GUARANTEE: visibleSemanticTopics(projected("SUMMARY")).includes("guarantee") ? "YES" : "NO",
    OVERVIEW_SEES_GUARANTEE: visibleSemanticTopics(projected("OVERVIEW")).includes("guarantee") ? "YES" : "NO",
    FEATURE_SEES_USAGE: slotPlan.slots
      .filter((slot) => slot.type === "FEATURE")
      .some((slot) => visibleSemanticTopics(slot.evidence.map((item) => item.value).join(" ")).includes("usage"))
      ? "YES"
      : "NO",
    IDENTITY_FAQ_SEES_GUARANTEE: visibleSemanticTopics(
      (descriptionFaq?.evidence || []).map((item) => item.value).join(" "),
    ).includes("guarantee")
      ? "YES"
      : "NO",
    USAGE_SEES_USAGE: visibleSemanticTopics(projected("USAGE")).includes("usage") ? "YES" : "NO",
    GUARANTEE_SEES_GUARANTEE: visibleSemanticTopics(projected("GUARANTEE")).includes("guarantee") ? "YES" : "NO",
  };
  const closedVisible = slotPlan.slots.flatMap((slot) => {
    const visible = visibleSemanticTopics(slot.evidence.map((item) => item.value).join(" "));
    return visible
      .filter((topic) => plan.closedTopics.includes(topic) && topic !== slot.topic)
      .map((topic) => `${slot.slotId}:${topic}`);
  });
  const assignments = slotPlan.slots.map((slot) => ({
    slotId: slot.slotId,
    slotType: slot.type,
    topic: slot.topic,
    field: slot.evidence.map((item) => item.field),
    evidenceIds: slot.allowedEvidenceIds,
    claimIds: slot.allowedClaimIds,
    propositions: propositionsForSlot(slot).map((item) => ({
      propositionId: item.propositionId,
      field: item.field,
      relation: item.relation,
      sourceText: item.sourceText,
    })),
  }));

  const usageMatches = recovered.usageInformation.some((item) => item.trim() === EXPECTED_USAGE);
  const guaranteeMatches = (recovered.guaranteeInformation || "").trim() === EXPECTED_GUARANTEE;
  const preModelReport = {
    SOURCE_CHANGED: "NO",
    LIVE_FETCH: "NO",
    COVERAGE: plan.coverage,
    COPY_ELIGIBLE_FACTS: manifest.items.filter((item) => item.copyEligible).length,
    OPEN_TOPICS: plan.allowedTopics,
    CLOSED_TOPICS: plan.closedTopics,
    PRE_MODEL_SLOT_VIOLATIONS: preModel.length,
    MODEL_SLOT_COUNT: slotPlan.slots.length,
    FINAL_THOUGHTS_SLOT_CREATED: finalThoughts ? "YES" : "NO",
    ...sees,
    CLOSED_TOPICS_VISIBLE: closedVisible.length === 0 ? "NO" : closedVisible.join("; "),
    PRE_MODEL_DETAIL: preModel,
    USAGE_MATCHES_EXPECTED: usageMatches,
    GUARANTEE_MATCHES_EXPECTED: guaranteeMatches,
    PROPOSITION_ASSIGNMENTS: assignments,
    ANTHROPIC_CALLS: 0,
  };
  writeFileSync(path.join(out, "pre-model.json"), JSON.stringify(preModelReport, null, 2), "utf8");

  if (
    preModel.length > 0 ||
    plan.coverage !== "RICH" ||
    !usageMatches ||
    !guaranteeMatches ||
    finalThoughts ||
    sees.DESCRIPTION_SEES_GUARANTEE !== "NO" ||
    sees.OVERVIEW_SEES_GUARANTEE !== "NO" ||
    sees.FEATURE_SEES_USAGE !== "NO" ||
    sees.IDENTITY_FAQ_SEES_GUARANTEE !== "NO" ||
    sees.USAGE_SEES_USAGE !== "YES" ||
    sees.GUARANTEE_SEES_GUARANTEE !== "YES" ||
    closedVisible.length > 0
  ) {
    console.log(JSON.stringify({ STOP: "PRE_MODEL", ...preModelReport, PROPOSITION_ASSIGNMENTS: undefined }, null, 2));
    throw new Error("PRE_MODEL_STOP");
  }
  if (plan.generationRoute !== "MODEL") throw new Error("expected MODEL route");
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");

  const originalFetch = globalThis.fetch;
  let anthropicHttpCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("api.anthropic.com")) anthropicHttpCalls += 1;
    return originalFetch(input, init);
  };

  let variants;
  try {
    variants = await generateVariants({
      productName: recovered.productName,
      sourceUrl: recovered.sourceUrl,
      facts: recovered,
      targetApproach: strategy.recommendedStrategy,
      modelInputTrace: { directory: out, required: true },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const tracePath = path.join(out, "model-input-trace.json");
  const traceWritten = existsSync(tracePath);
  const trace = traceWritten
    ? (JSON.parse(readFileSync(tracePath, "utf8")) as { traceVersion?: string; exactSent?: { model?: string } })
    : null;
  const variant = variants[0];
  if (!variant) throw new Error("no variant");
  const fills = variant.slotFills || [];
  writeFileSync(path.join(out, "generation-raw.json"), JSON.stringify({ fills, ctaLabel: variant.ctaLabel }, null, 2), "utf8");

  const evaluation = evaluateSlotGeneration(
    { variants: [{ cta: { label: variant.ctaLabel }, slots: fills }] },
    recovered,
    recovered.productName,
    VALIDATION_SAFE_AFFILIATE,
    slotPlan,
  );
  const byFill = new Map(fills.map((fill) => [fill.slotId, fill]));
  const pageHasFinalThoughts = Boolean(evaluation.page?.blocks.some((block) => block.type === "FINAL_THOUGHTS"));

  const outputSlots = slotPlan.slots.map((slot) => {
    const fill = byFill.get(slot.slotId);
    if (slot.type === "FAQ") {
      return {
        slotId: slot.slotId,
        slotType: slot.type,
        question: fill?.question || "",
        answerPropositions: fill?.answerPropositions || [],
        propositionIds: propositionIds(fill?.answerPropositions),
        wording: answerWording(fill),
      };
    }
    return {
      slotId: slot.slotId,
      slotType: slot.type,
      propositionIds: propositionIds(fill?.propositions),
      wording: slotWording(slot, fill),
    };
  });

  const binding = evaluation.structuralViolations.filter((item) => item.code === "PROPOSITION_BINDING_VIOLATION");
  const wording = slotPlan.slots.flatMap((slot) => {
    const generated = slotWording(slot, byFill.get(slot.slotId));
    if (!generated) return [];
    return validateModelWordingConstraint({ generated, slot }).violations;
  });
  const authority = slotPlan.slots.flatMap((slot) => {
    const copy = slotWording(slot, byFill.get(slot.slotId));
    if (!copy) return [];
    return validateModelSlotAuthority({ copy, slot, plan, productName: recovered.productName }).map((item) => ({
      slotId: slot.slotId,
      code: item.code,
      text: item.text,
      reason: item.reason,
    }));
  });

  const overview = slotPlan.slots.find((slot) => slot.type === "OVERVIEW");
  const s003 = overview ? byFill.get(overview.slotId) : undefined;
  const s003Wording = overview ? slotWording(overview, s003) : "";
  const s003Ids = propositionIds(s003?.propositions);
  const s003WordingHits = wording.filter((item) => item.slotId === overview?.slotId);
  const s003AuthorityHits = authority.filter((item) => item.slotId === overview?.slotId);

  const sectionText = (type: string) =>
    slotPlan.slots
      .filter((slot) => slot.type === type)
      .map((slot) => (slot.type === "FAQ" ? answerWording(byFill.get(slot.slotId)) : slotWording(slot, byFill.get(slot.slotId))))
      .filter(Boolean);
  const faqItems = slotPlan.slots
    .filter((slot) => slot.type === "FAQ")
    .map((slot) => {
      const fill = byFill.get(slot.slotId);
      const traceRow = evaluation.slotTraces.find((item) => item.slotId === slot.slotId);
      return {
        FAQ_ID: slot.slotId,
        QUESTION: fill?.question || "",
        ANSWER: answerWording(fill),
        PROPOSITION_IDS: propositionIds(fill?.answerPropositions),
        QUESTION_SEMANTICS: traceRow?.questionSemantic?.semanticResult || "MISSING",
        ANSWER_GROUNDING: traceRow?.answerGrounding || "MISSING",
      };
    });

  const pageLevelGrounding = evaluation.page
    ? validateGrounding(`${evaluation.inspectionCopy.headline}\n${evaluation.inspectionCopy.body}`, recovered, {
        faqAuthorities: pageFaqAuthorityBindings(evaluation.page, { closedTopics: plan.closedTopics }),
      })
    : { unsupportedClaims: [] };
  const pageUnsupported = (question: string) =>
    pageLevelGrounding.unsupportedClaims.some((item) => item.claim.trim().toLowerCase() === question.trim().toLowerCase());
  const faqLevel = (slotId: string) => {
    const item = faqItems.find((row) => row.FAQ_ID === slotId);
    if (!item) return { local: "MISSING", page: "MISSING" };
    const local = item.QUESTION_SEMANTICS === "PASS" && item.ANSWER_GROUNDING === "GROUNDED" ? "PASS" : "FAIL";
    const page = pageUnsupported(item.QUESTION.endsWith("?") ? item.QUESTION : `${item.QUESTION}?`) ? "UNSUPPORTED" : "SUPPORTED";
    return { local, page };
  };
  const faq003 = faqLevel("FAQ003");
  const faq004 = faqLevel("FAQ004");

  const campaignFindings = lintCampaign({
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
  }).findings;
  const nonPass = campaignFindings.filter((item) => item.status !== "pass");
  const findingOn = (pattern: RegExp) => nonPass.some((item) => pattern.test(item.ruleId));

  const consumer = [
    ...sectionText("HEADLINE"),
    ...sectionText("SUMMARY"),
    ...sectionText("OVERVIEW"),
    ...sectionText("FEATURE"),
    ...sectionText("USAGE"),
    ...sectionText("GUARANTEE"),
    ...sectionText("FINAL_THOUGHTS"),
    ...faqItems.flatMap((item) => [item.QUESTION, item.ANSWER]),
  ]
    .join("\n")
    .trim();

  const report = {
    ...preModelReport,
    MODEL_INPUT_TRACE_REQUESTED: "YES",
    MODEL_INPUT_TRACE_WRITTEN: traceWritten ? "YES" : "NO",
    TRACE_VERSION: trace?.traceVersion || "",
    TRACE_FROM_EXACT_PROVIDER_BOUND_VALUES: trace?.traceVersion === "MODEL_INPUT_TRACE_V1" ? "YES" : "NO",
    POST_HOC_RECONSTRUCTION: "NO",
    ROUTE: variant.generationRoute,
    MODEL: trace?.exactSent?.model || ANTHROPIC_MODEL,
    ANTHROPIC_CALLS: anthropicHttpCalls,
    REPORTED_VARIANT_CALLS: variant.anthropicCalls ?? 0,
    AUTOMATIC_RETRY: anthropicHttpCalls > 1 ? "YES" : "NO",
    MODEL_OUTPUT_SLOT_COUNT: fills.length,
    OUTPUT_SLOTS: outputSlots,
    PROPOSITION_BINDING_VIOLATIONS: binding.length,
    UNKNOWN_PROPOSITION_IDS: binding.filter((item) => item.reason === "UNKNOWN_PROPOSITION_ID").length,
    CROSS_SLOT_UNAUTHORIZED_PROPOSITIONS: binding.filter((item) => item.reason === "CROSS_SLOT_PROPOSITION").length,
    UNBOUND_FACTUAL_CONTENT: binding.filter((item) => item.reason === "UNBOUND_FACTUAL_CONTENT").length,
    BINDING_DETAIL: binding,
    S003_SLOT: overview?.slotId || "",
    S003_OUTPUT: s003Wording,
    S003_PROPOSITION_IDS: s003Ids,
    S003_NEW_SYNERGY: s003WordingHits.some((item) => item.violationType === "NEW_SYNERGY") ? "YES" : "NO",
    S003_UNSUPPORTED_RELATIONSHIP:
      s003AuthorityHits.some((item) => item.code === "UNSUPPORTED_RELATIONAL_EXPANSION") ||
      binding.some((item) => item.reason === "UNAUTHORIZED_RELATIONSHIP" && item.text && s003Wording.includes(item.text))
        ? "YES"
        : "NO",
    MODEL_WORDING_VIOLATIONS: wording.length,
    WORDING_DETAIL: wording.map((item) => ({
      slotId: item.slotId,
      type: item.violationType,
      text: item.generatedProposition,
    })),
    MODEL_AUTHORITY_VIOLATIONS: authority.length,
    AUTHORITY_DETAIL: authority,
    PLAN_HAS_FINAL_THOUGHTS: finalThoughts ? "YES" : "NO",
    PAGE_HAS_FINAL_THOUGHTS: pageHasFinalThoughts ? "YES" : "NO",
    STRUCTURE_VALIDATION: evaluation.structuralViolations.length === 0 ? "PASS" : "FAIL",
    STRUCTURE_DETAIL: evaluation.structuralViolations.map((item) => ({
      code: item.code,
      text: item.text,
      reason: item.reason,
    })),
    GROUNDING: evaluation.grounding.status,
    UNSUPPORTED_CLAIMS: evaluation.grounding.unsupportedClaims.length,
    UNSUPPORTED: evaluation.grounding.unsupportedClaims.map((item) => ({
      claim: item.claim,
      reason: item.reason,
      claimClass: item.claimClass,
    })),
    FAQ003_LOCAL: faq003.local,
    FAQ003_PAGE_LEVEL: faq003.page,
    FAQ004_LOCAL: faq004.local,
    FAQ004_PAGE_LEVEL: faq004.page,
    FAQ_ITEMS: faqItems,
    POLICY: evaluation.policyGate,
    POLICY_FINDINGS: nonPass.length,
    POLICY_FINDING_DETAIL: nonPass.map((item) => ({ ruleId: item.ruleId, status: item.status, message: item.message })),
    CONTENT_REPETITION: findingOn(/^content\.repetition$/) ? "YES" : "NO",
    GUARANTEE_STRENGTHENING: findingOn(/guarantee|refund/i) ? "YES" : "NO",
    USAGE_STRENGTHENING: findingOn(/usage|dosage/i) ? "YES" : "NO",
    CONTENT_GATE: evaluation.finalGate,
    GENERATED_COPY: {
      HEADLINE: sectionText("HEADLINE").join("\n"),
      SUMMARY: sectionText("SUMMARY").join("\n"),
      OVERVIEW: sectionText("OVERVIEW").join("\n"),
      FEATURES: sectionText("FEATURE").join("\n\n"),
      USAGE: sectionText("USAGE").join("\n"),
      GUARANTEE: sectionText("GUARANTEE").join("\n"),
      FINAL_THOUGHTS: sectionText("FINAL_THOUGHTS").join("\n") || "OMITTED",
      FAQS: faqItems.map((item) => `${item.FAQ_ID}: ${item.QUESTION} ${item.ANSWER}`).join("\n"),
    },
    WORD_COUNT: consumer.split(/\s+/).filter(Boolean).length,
    SECTION_COUNT: ["HEADLINE", "SUMMARY", "OVERVIEW", "FEATURE", "USAGE", "GUARANTEE", "FINAL_THOUGHTS"].filter((type) =>
      sectionText(type).some((text) => text.trim()),
    ).length,
    FAQ_COUNT: faqItems.filter((item) => item.QUESTION || item.ANSWER).length,
    CTA: variant.ctaLabel,
    COMPOSITION: "NOT_RUN",
    WEB_ANATOMY: "NOT_RUN",
  };

  writeFileSync(path.join(out, "REPORT.json"), JSON.stringify(report, null, 2), "utf8");
  const summary = {
    COVERAGE: report.COVERAGE,
    COPY_ELIGIBLE_FACTS: report.COPY_ELIGIBLE_FACTS,
    PRE_MODEL_SLOT_VIOLATIONS: report.PRE_MODEL_SLOT_VIOLATIONS,
    MODEL_SLOT_COUNT: report.MODEL_SLOT_COUNT,
    FINAL_THOUGHTS_SLOT_CREATED: report.FINAL_THOUGHTS_SLOT_CREATED,
    MODEL_INPUT_TRACE_WRITTEN: report.MODEL_INPUT_TRACE_WRITTEN,
    ROUTE: report.ROUTE,
    MODEL: report.MODEL,
    ANTHROPIC_CALLS: report.ANTHROPIC_CALLS,
    AUTOMATIC_RETRY: report.AUTOMATIC_RETRY,
    PROPOSITION_BINDING_VIOLATIONS: report.PROPOSITION_BINDING_VIOLATIONS,
    S003_NEW_SYNERGY: report.S003_NEW_SYNERGY,
    S003_UNSUPPORTED_RELATIONSHIP: report.S003_UNSUPPORTED_RELATIONSHIP,
    MODEL_WORDING_VIOLATIONS: report.MODEL_WORDING_VIOLATIONS,
    MODEL_AUTHORITY_VIOLATIONS: report.MODEL_AUTHORITY_VIOLATIONS,
    STRUCTURE_VALIDATION: report.STRUCTURE_VALIDATION,
    PAGE_HAS_FINAL_THOUGHTS: report.PAGE_HAS_FINAL_THOUGHTS,
    GROUNDING: report.GROUNDING,
    UNSUPPORTED_CLAIMS: report.UNSUPPORTED_CLAIMS,
    FAQ003_LOCAL: report.FAQ003_LOCAL,
    FAQ003_PAGE_LEVEL: report.FAQ003_PAGE_LEVEL,
    FAQ004_LOCAL: report.FAQ004_LOCAL,
    FAQ004_PAGE_LEVEL: report.FAQ004_PAGE_LEVEL,
    POLICY: report.POLICY,
    POLICY_FINDINGS: report.POLICY_FINDINGS,
    CONTENT_REPETITION: report.CONTENT_REPETITION,
    GUARANTEE_STRENGTHENING: report.GUARANTEE_STRENGTHENING,
    USAGE_STRENGTHENING: report.USAGE_STRENGTHENING,
    CONTENT_GATE: report.CONTENT_GATE,
    FINAL_THOUGHTS: report.GENERATED_COPY.FINAL_THOUGHTS === "OMITTED" ? "OMITTED" : "PRESENT",
    WORD_COUNT: report.WORD_COUNT,
    SECTION_COUNT: report.SECTION_COUNT,
    FAQ_COUNT: report.FAQ_COUNT,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
