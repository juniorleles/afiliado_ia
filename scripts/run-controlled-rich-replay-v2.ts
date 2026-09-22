/**
 * CONTROLLED RICH END-TO-END REPLAY V2
 * Validation only. One Anthropic call. No retry, no composition, no patch.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applyGenericFaqRecovery } from "../src/lib/faq-field-promotion.ts";
import { buildGenerationFactManifest, type ProductFacts } from "../src/lib/product-facts.ts";
import { createGenerationPlan, hasUsageAuthorityLanguage } from "../src/lib/ai/generation-plan.ts";
import { projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import { createEvidenceSlotPlan } from "../src/lib/ai/evidence-slot-plan.ts";
import { generateVariants, type VariantApproach } from "../src/lib/ai/generate-variants.ts";
import { evaluateSlotGeneration } from "../src/lib/ai/slot-generation.ts";
import {
  countModelSlotAuthorityViolations,
  validateModelSlotAuthority,
} from "../src/lib/ai/model-slot-authority.ts";
import { validateModelWordingConstraint } from "../src/lib/ai/model-wording-constraint.ts";
import {
  collectSlotProjectionViolations,
  visibleSemanticTopics,
} from "../src/lib/ai/slot-projection-isolation.ts";
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

function classifyUnsupported(claim: string, reason: string, evidence: string): string {
  const text = `${claim} ${reason}`.toLowerCase();
  const claimLower = claim.toLowerCase();
  const evidenceLower = evidence.toLowerCase();
  if (/cross-field|different field|not assigned|does not include/.test(reason.toLowerCase())) return "CROSS_FIELD_PROMOTION";
  if (/editorial|characterization|straightforward|comprehensive|ideal|simple routine|easy to/.test(text)) return "EDITORIAL_CHARACTERIZATION";
  if (
    /work together|synerg|cushion|joint function|plays a key role|maintain healthy synovial|money-back|full refund|risk-free|refund if needed|evaluate the product|no multiple doses|multiple doses|easy to incorporate|those seeking|users looking|long-term|pathway|mechanism/.test(
      claimLower,
    )
  ) {
    return "SEMANTIC_STRENGTHENING";
  }
  const tokens = claimLower.split(/[^a-z0-9]+/).filter((token) => token.length > 3);
  const overlap = tokens.filter((token) => evidenceLower.includes(token)).length;
  if (tokens.length > 0 && overlap / tokens.length >= 0.72) {
    return /grammar|paraphrase|restatement/.test(reason.toLowerCase())
      ? "GRAMMATICAL_TRANSFORMATION_MISSED"
      : "CONSERVATIVE_PARAPHRASE_MISSED";
  }
  if (/not a semantic restatement|requires copy-eligible|unsupported relationship|not entailed/.test(reason.toLowerCase())) {
    return "GENUINELY_UNSUPPORTED";
  }
  return "OTHER";
}

function topicLeak(copy: string, authorized: string, pattern: RegExp): "YES" | "NO" {
  const hits = copy.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`)) || [];
  if (hits.length === 0) return "NO";
  const bag = authorized.toLowerCase();
  return hits.some((hit) => !bag.includes(hit.toLowerCase())) ? "YES" : "NO";
}

async function main() {
  loadLocalEnv();
  const root = process.cwd();
  const sourceRun = path.join(root, "data/controlled-ready-13/2026-09-21-controlled-visual-13");
  const out = path.join(root, "data/web-anatomy-lab/v1/controlled-rich-replay-v2");
  mkdirSync(out, { recursive: true });

  const stored = JSON.parse(readFileSync(path.join(sourceRun, "import-facts.json"), "utf8")) as ProductFacts;
  const recovered = applyGenericFaqRecovery(stored);
  const strategy = JSON.parse(readFileSync(path.join(sourceRun, "strategy.json"), "utf8")) as {
    recommendedStrategy: VariantApproach;
  };
  const plan = createGenerationPlan(recovered);
  const manifest = buildGenerationFactManifest(recovered);
  const projection = projectEvidenceClaims(recovered, plan, manifest);
  const slotPlan = createEvidenceSlotPlan(recovered, plan, manifest, projection);
  const preModel = collectSlotProjectionViolations(slotPlan.slots);

  const projected = (type: string, topic?: string) => {
    const slot = slotPlan.slots.find((item) => item.type === type && (!topic || item.topic === topic));
    return slot ? slot.evidence.map((item) => item.value).join(" ") : "";
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
    const closed = visible.filter((topic) => plan.closedTopics.includes(topic) && topic !== slot.topic);
    return closed.map((topic) => `${slot.slotId}:${topic}`);
  });

  const inputState = {
    SOURCE_CHANGED: "NO",
    LIVE_FETCH: "NO",
    COVERAGE: plan.coverage,
    COPY_ELIGIBLE_FACTS: manifest.items.filter((item) => item.copyEligible).length,
    OPEN_TOPICS: plan.allowedTopics,
    CLOSED_TOPICS: plan.closedTopics,
    USAGE: recovered.usageInformation,
    USAGE_PROVENANCE: recovered.confidence.usageInformation,
    GUARANTEE: recovered.guaranteeInformation,
    GUARANTEE_PROVENANCE: recovered.confidence.guaranteeInformation,
  };

  const usageMatches = recovered.usageInformation.some((item) => item.trim() === EXPECTED_USAGE);
  const guaranteeMatches = (recovered.guaranteeInformation || "").trim() === EXPECTED_GUARANTEE;
  const preModelReport = {
    ...inputState,
    PRE_MODEL_SLOT_VIOLATIONS: preModel.length,
    ...sees,
    CLOSED_TOPICS_VISIBLE: closedVisible.length === 0 ? "NO" : closedVisible.join("; "),
    PRE_MODEL_DETAIL: preModel,
    USAGE_MATCHES_EXPECTED: usageMatches,
    GUARANTEE_MATCHES_EXPECTED: guaranteeMatches,
    ANTHROPIC_CALLS: 0,
  };
  writeFileSync(path.join(out, "pre-model.json"), JSON.stringify(preModelReport, null, 2), "utf8");

  if (preModel.length > 0 || plan.coverage !== "RICH" || !usageMatches || !guaranteeMatches) {
    console.log(JSON.stringify(preModelReport, null, 2));
    throw new Error("PRE_MODEL_STOP");
  }
  if (plan.generationRoute !== "MODEL") throw new Error("expected MODEL route");
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");

  const variants = await generateVariants({
    productName: recovered.productName,
    sourceUrl: recovered.sourceUrl,
    facts: recovered,
    targetApproach: strategy.recommendedStrategy,
  });
  const variant = variants[0];
  if (!variant) throw new Error("no variant");
  const fills = variant.slotFills || [];
  const evaluation = evaluateSlotGeneration(
    { variants: [{ cta: { label: variant.ctaLabel }, slots: fills }] },
    recovered,
    recovered.productName,
    VALIDATION_SAFE_AFFILIATE,
    slotPlan,
  );

  const byFill = new Map(fills.map((fill) => [fill.slotId, fill]));
  const wording = slotPlan.slots.flatMap((slot) => {
    const fill = byFill.get(slot.slotId);
    const generated = slot.type === "FAQ" ? `${fill?.question || ""} ${fill?.answer || ""}`.trim() : fill?.content || "";
    if (!generated) return [];
    return validateModelWordingConstraint({ generated, slot }).violations.map((item) => ({
      SLOT_ID: item.slotId,
      FIELD: item.field,
      GENERATED_PROPOSITION: item.generatedProposition,
      AUTHORIZED_EVIDENCE: item.authorizedEvidence,
      VIOLATION_TYPE: item.violationType,
    }));
  });

  const authority = slotPlan.slots.flatMap((slot) => {
    const fill = byFill.get(slot.slotId);
    const copy = slot.type === "FAQ" ? `${fill?.question || ""} ${fill?.answer || ""}`.trim() : fill?.content || "";
    if (!copy) return [];
    return validateModelSlotAuthority({
      copy,
      slot,
      plan,
      productName: recovered.productName,
    }).map((item) => ({
      SLOT_ID: slot.slotId,
      CODE: item.code,
      TEXT: item.text,
      REASON: item.reason,
    }));
  });

  const authorizedBag = slotPlan.slots.map((slot) => slot.evidence.map((item) => item.value).join(" ")).join("\n");
  const sectionText = (type: string) =>
    slotPlan.slots
      .filter((slot) => slot.type === type)
      .map((slot) => byFill.get(slot.slotId)?.content || "")
      .filter(Boolean);
  const faqItems = slotPlan.slots
    .filter((slot) => slot.type === "FAQ")
    .map((slot) => {
      const fill = byFill.get(slot.slotId);
      const trace = evaluation.slotTraces.find((item) => item.slotId === slot.slotId);
      return {
        FAQ_ID: slot.slotId,
        FIELD: slot.evidence[0]?.field || slot.topic,
        QUESTION: fill?.question || "",
        ANSWER: fill?.answer || "",
        QUESTION_SEMANTICS: trace?.questionSemantic?.semanticResult || "MISSING",
        ANSWER_GROUNDING: trace?.answerGrounding || "MISSING",
      };
    });
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

  const helpStem = authority.some((item) => item.CODE === "UNSUPPORTED_RELATIONAL_EXPANSION" && item.TEXT === "help");
  const practicalMobility = authority.some((item) => item.TEXT === "practical mobility");
  const directionsPromotion = authority.some(
    (item) => item.CODE === "USAGE_PROMOTION" && /complementary directions|several directions/i.test(item.TEXT),
  );

  const unsupported = evaluation.grounding.unsupportedClaims.map((item) => ({
    CLAIM: item.claim,
    FIELD: item.claimClass || "",
    EVIDENCE: authorizedBag.slice(0, 500),
    REASON: item.reason,
    CLASSIFICATION: classifyUnsupported(item.claim, item.reason, authorizedBag),
  }));

  const structuralCodes = [
    "UNSUPPORTED_RELATIONAL_EXPANSION",
    "USAGE_PROMOTION",
    "GUARANTEE_PROMOTION",
    "COMPOSITION_PROMOTION",
    "CLOSED_TOPIC",
    "EDITORIAL_EXPANSION",
    "ATTRIBUTION_AUTHORITY",
    "IDENTITY_AS_COMPOSITION",
    "SEMANTIC_CLOSURE",
  ];
  const faqPass =
    faqItems.length > 0 &&
    faqItems.every((item) => item.QUESTION_SEMANTICS === "PASS" && item.ANSWER_GROUNDING === "GROUNDED");
  const semanticClosure = evaluation.structuralViolations.some((item) => item.code === "SEMANTIC_CLOSURE") ? "FAIL" : "PASS";
  const authorityCount = countModelSlotAuthorityViolations(evaluation.structuralViolations);

  const report = {
    ...preModelReport,
    ANTHROPIC_CALLS: variant.anthropicCalls ?? 1,
    ROUTE: variant.generationRoute,
    MODEL_SLOT_COUNT: slotPlan.slots.length,
    MODEL_WORDING_CONSTRAINT_VIOLATIONS: wording.length,
    VIOLATIONS: wording,
    MODEL_AUTHORITY_VIOLATIONS: authorityCount,
    AUTHORITY_DETAIL: authority,
    CROSS_FIELD_SYNTHESIS: authority.some((item) => item.CODE === "UNSUPPORTED_RELATIONAL_EXPANSION") ? "YES" : "NO",
    CLOSED_FIELD_PROMOTION: authority.some((item) =>
      ["USAGE_PROMOTION", "GUARANTEE_PROMOTION", "COMPOSITION_PROMOTION", "CLOSED_TOPIC"].includes(item.CODE),
    )
      ? "YES"
      : "NO",
    STRUCTURE: evaluation.structuralViolations.length === 0 ? "PASS" : "FAIL",
    STRUCTURE_DETAIL: evaluation.structuralViolations.map((item) => ({
      code: item.code,
      text: item.text,
      reason: item.reason,
    })),
    SEMANTIC_CLOSURE: semanticClosure,
    SEMANTIC_AUTHORITY: authorityCount === 0 ? "PASS" : "FAIL",
    F02_HELP_STEM_FLAGGED: helpStem ? "YES" : "NO",
    F08_PRACTICAL_MOBILITY_FLAGGED: practicalMobility ? "YES" : "NO",
    F10_COMPLEMENTARY_DIRECTIONS_USAGE_PROMOTION: directionsPromotion ? "YES" : "NO",
    COMPLEMENTARY_DIRECTIONS_PRESENT: /several complementary directions/i.test(consumer) ? "YES" : "NO",
    GROUNDING: evaluation.grounding.status,
    UNSUPPORTED_CLAIMS: unsupported.length,
    UNSUPPORTED: unsupported,
    FAQ: faqPass ? "PASS" : "FAIL",
    FAQ_ITEMS: faqItems,
    POLICY: evaluation.policyGate,
    CONTENT_GATE: evaluation.finalGate,
    GENERATED_COPY: {
      HEADLINE: sectionText("HEADLINE").join("\n"),
      SUMMARY: sectionText("SUMMARY").join("\n"),
      OVERVIEW: sectionText("OVERVIEW").join("\n"),
      FEATURES: sectionText("FEATURE").join("\n\n"),
      USAGE: sectionText("USAGE").join("\n"),
      GUARANTEE: sectionText("GUARANTEE").join("\n"),
      FINAL_THOUGHTS: sectionText("FINAL_THOUGHTS").join("\n"),
      FAQ: faqItems.map((item) => `${item.FAQ_ID}: ${item.QUESTION} ${item.ANSWER}`).join("\n"),
    },
    WORD_COUNT: consumer.split(/\s+/).filter(Boolean).length,
    SECTION_COUNT: ["HEADLINE", "SUMMARY", "OVERVIEW", "FEATURE", "USAGE", "GUARANTEE", "FINAL_THOUGHTS"].filter(
      (type) => sectionText(type).some((text) => text.trim()),
    ).length,
    FAQ_COUNT: faqItems.filter((item) => item.QUESTION || item.ANSWER).length,
    INGREDIENT_TOPIC_LEAK: topicLeak(consumer, authorizedBag, /\b(?:contains|made with)\s+[A-Z][A-Za-z0-9®\-]{2,}\b|\bglucosamine\b|\bchondroitin\b|\bboswellia\b|\bturmeric\b|\bcurcumin\b/i),
    MANUFACTURER_TOPIC_LEAK: topicLeak(consumer, authorizedBag, /\bmanufactur(?:er|ed by|ing facility)\b/i),
    PRICING_TOPIC_LEAK: topicLeak(consumer, authorizedBag, /\b(?:price|pricing|\$\d|discount|msrp)\b/i),
    CAUTION_TOPIC_LEAK: topicLeak(consumer, authorizedBag, /\b(?:caution|warning|allergen|consult(?:\s+with)?(?:\s+your)?\s+(?:doctor|physician))\b/i),
    RESULTS_TOPIC_LEAK: topicLeak(consumer, authorizedBag, /\bexpected results\b|\bresults in \d+\s+(?:days?|weeks?)\b/i),
    CATEGORY_TOPIC_LEAK: topicLeak(consumer, authorizedBag, /\bdietary supplement\b|\bmedical device\b/i),
    BACKGROUND_SCIENCE_TOPIC_LEAK: topicLeak(consumer, authorizedBag, /\bsynovial fluid is\b|\bnatural lubricant\b|\bcartilage\b|\bphysiological\b/i),
    RETURN_POLICY_PRESENT: /180-day return policy/i.test(consumer) ? "YES" : "NO",
    RETURN_POLICY_SOURCE_ALIGNED: /180-day return policy measured from the order date/i.test(consumer) ? "YES" : "NO",
    MONEY_BACK_INVENTED: /money[\s-]?back/i.test(consumer) ? "YES" : "NO",
    FULL_REFUND_INVENTED: /full refund/i.test(consumer) ? "YES" : "NO",
    RISK_FREE_INVENTED: /risk[\s-]?free/i.test(consumer) ? "YES" : "NO",
    REFUND_PROCEDURE_INVENTED: /request a refund|refund if needed|guaranteed refund/i.test(consumer) ? "YES" : "NO",
    EVALUATION_WINDOW_INVENTED: /evaluate the product|evaluation window|extended window|days to evaluate/i.test(consumer) ? "YES" : "NO",
    USAGE_PRESENT: /take one capsule daily with water, preferably in the morning/i.test(consumer) ? "YES" : "NO",
    USAGE_SOURCE_ALIGNED: /take one capsule daily with water, preferably in the morning/i.test(sectionText("USAGE").join(" ") + " " + faqItems.map((item) => item.ANSWER).join(" "))
      ? "YES"
      : "NO",
    DOSAGE_INVENTED: /\b(?:two|three|\d+)\s+capsules?\b|\btake twice\b|\bevery \d+ hours\b/i.test(consumer) ? "YES" : "NO",
    EXCLUSIVITY_INVENTED: /no multiple doses|only one dose|without complicated timing|doses throughout the day/i.test(consumer) ? "YES" : "NO",
    EASE_OF_USE_INVENTED: /easy to incorporate|simple routine|straightforward/i.test(consumer) ? "YES" : "NO",
    MANUFACTURER_RECOMMENDATION_INVENTED: /manufacturer recommends|we recommend|recommended usage/i.test(consumer) ? "YES" : "NO",
    USAGE_LANGUAGE_OUTSIDE_USAGE_SLOT: slotPlan.slots
      .filter((slot) => slot.semanticAuthority !== "USAGE")
      .some((slot) => hasUsageAuthorityLanguage(slot.type === "FAQ" ? `${byFill.get(slot.slotId)?.question || ""} ${byFill.get(slot.slotId)?.answer || ""}` : byFill.get(slot.slotId)?.content || ""))
      ? "YES"
      : "NO",
    STRUCTURAL_AUTHORITY_CODES: structuralCodes.filter((code) =>
      evaluation.structuralViolations.some((item) => item.code === code),
    ),
    CTA: variant.ctaLabel,
    COMPOSITION: "NOT_RUN",
    WEB_ANATOMY: "NOT_RUN",
  };

  writeFileSync(path.join(out, "REPORT.json"), JSON.stringify(report, null, 2), "utf8");
  writeFileSync(path.join(out, "generation-raw.json"), JSON.stringify({ fills, ctaLabel: variant.ctaLabel }, null, 2), "utf8");
  console.log(JSON.stringify({
    COVERAGE: report.COVERAGE,
    COPY_ELIGIBLE_FACTS: report.COPY_ELIGIBLE_FACTS,
    PRE_MODEL_SLOT_VIOLATIONS: report.PRE_MODEL_SLOT_VIOLATIONS,
    ROUTE: report.ROUTE,
    ANTHROPIC_CALLS: report.ANTHROPIC_CALLS,
    MODEL_WORDING_CONSTRAINT_VIOLATIONS: report.MODEL_WORDING_CONSTRAINT_VIOLATIONS,
    MODEL_AUTHORITY_VIOLATIONS: report.MODEL_AUTHORITY_VIOLATIONS,
    STRUCTURE: report.STRUCTURE,
    SEMANTIC_CLOSURE: report.SEMANTIC_CLOSURE,
    SEMANTIC_AUTHORITY: report.SEMANTIC_AUTHORITY,
    GROUNDING: report.GROUNDING,
    UNSUPPORTED_CLAIMS: report.UNSUPPORTED_CLAIMS,
    FAQ: report.FAQ,
    POLICY: report.POLICY,
    CONTENT_GATE: report.CONTENT_GATE,
  }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
