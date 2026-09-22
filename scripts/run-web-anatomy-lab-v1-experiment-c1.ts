/**
 * WEB ANATOMY LAB V1 — EXPERIMENT C1
 * Controlled RICH/MODEL generation from recovered ProductFacts.
 * No composition, Visual QA, Web Anatomy, publish, or Experiment B changes.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applyGenericFaqRecovery } from "../src/lib/faq-field-promotion.ts";
import {
  buildGenerationFactManifest,
  getConsumerCopyEligibleFacts,
  type ProductFacts,
} from "../src/lib/product-facts.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import { createEvidenceSlotPlan } from "../src/lib/ai/evidence-slot-plan.ts";
import { buildPrompt, generateVariants } from "../src/lib/ai/generate-variants.ts";
import { evaluateSlotGeneration, hydrateSlotFillsToPage } from "../src/lib/ai/slot-generation.ts";
import { validateThinSemanticClosure } from "../src/lib/ai/semantic-closure.ts";
import {
  countModelSlotAuthorityViolations,
  createModelSlotAuthority,
  formatModelSlotAuthorityForPrompt,
} from "../src/lib/ai/model-slot-authority.ts";
import { VALIDATION_SAFE_AFFILIATE } from "../src/lib/validation/constants.ts";
import type { VariantApproach } from "../src/lib/ai/generate-variants.ts";

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
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function wordCount(text: string): number {
  return text.replace(/\s+/g, " ").trim().split(/\s+/).filter(Boolean).length;
}

function fillText(fill: { content?: string; question?: string; answer?: string }): string {
  return [fill.content, fill.question, fill.answer].filter(Boolean).join(" ");
}

async function main() {
  loadLocalEnv();
  const root = process.cwd();
  const sourceRun = path.join(root, "data/controlled-ready-13/2026-09-21-controlled-visual-13");
  const out = path.join(root, "data/web-anatomy-lab/v1/experiment-c1");
  mkdirSync(out, { recursive: true });

  const storedFacts = readJson<ProductFacts>(path.join(sourceRun, "import-facts.json"));
  const recovered = applyGenericFaqRecovery(storedFacts);
  const strategy = readJson<{ recommendedStrategy: VariantApproach }>(path.join(sourceRun, "strategy.json"));
  const oldRaw = readJson<{
    fills: Array<{ slotId: string; content?: string; question?: string; answer?: string }>;
  }>(path.join(sourceRun, "generation-raw.json"));

  const factsBefore = JSON.stringify(recovered);
  const plan = createGenerationPlan(recovered);
  const manifest = buildGenerationFactManifest(recovered);
  const projection = projectEvidenceClaims(recovered, plan, manifest);
  const slotPlan = createEvidenceSlotPlan(recovered, plan, manifest, projection);
  const authorities = slotPlan.slots.map((slot) => createModelSlotAuthority(slot, plan));
  const prompt = buildPrompt({
    productName: recovered.productName,
    sourceUrl: recovered.sourceUrl,
    facts: recovered,
    targetApproach: strategy.recommendedStrategy,
  });

  if (JSON.stringify(recovered) !== factsBefore) {
    throw new Error("ProductFacts mutated during C1 setup");
  }
  if (plan.coverage !== "RICH") {
    throw new Error(`C1 expected RICH coverage, got ${plan.coverage}`);
  }
  if (plan.generationRoute !== "MODEL") {
    throw new Error(`C1 expected MODEL route, got ${plan.generationRoute}`);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY missing; cannot run MODEL generation");
  }

  const variants = await generateVariants({
    productName: recovered.productName,
    sourceUrl: recovered.sourceUrl,
    facts: recovered,
    targetApproach: strategy.recommendedStrategy,
  });
  const variant = variants[0];
  if (!variant) throw new Error("generateVariants returned no variants");
  if (JSON.stringify(recovered) !== factsBefore) {
    throw new Error("ProductFacts mutated during generateVariants");
  }

  const evaluation = evaluateSlotGeneration(
    { variants: [{ cta: { label: variant.ctaLabel }, slots: variant.slotFills || [] }] },
    recovered,
    recovered.productName,
    VALIDATION_SAFE_AFFILIATE,
    slotPlan,
  );
  const page = hydrateSlotFillsToPage(
    variant.slotFills || [],
    slotPlan,
    variant.ctaLabel,
    strategy.recommendedStrategy,
  );
  const closure = (variant.slotFills || []).map((fill) => {
    const slot = slotPlan.slots.find((item) => item.slotId === fill.slotId);
    const generated = slot?.type === "FAQ" ? (fill.answer || "").trim() : (fill.content || "").trim();
    const support = (slot?.evidence || []).map((item) => item.value).join("\n");
    return {
      slotId: fill.slotId,
      type: slot?.type,
      ...validateThinSemanticClosure({
        generated,
        support,
        slotType: slot?.type,
        thinMode: false,
      }),
    };
  });

  const generatedBlob = (variant.slotFills || []).map(fillText).join("\n");
  const oldBlob = oldRaw.fills.map(fillText).join("\n");
  const allCopy = `${variant.headline}\n${variant.body}\n${generatedBlob}`.toLowerCase();

  const returnPolicyStrengthened = /\b(money[\s-]?back guarantee|risk[\s-]?free|full refund|satisfaction guarantee)\b/i.test(
    generatedBlob,
  );
  const buyerProtectionInvented = /\bbuyer protection\b/i.test(generatedBlob);
  const usageAttributionInvented =
    /\b(?:manufacturer|doctor|doctors|physician|clinically)\s+recommends?\b/i.test(generatedBlob) ||
    /\b(?:best taken|must be taken|clinically recommended)\b/i.test(generatedBlob);
  const faqSlots = evaluation.slotTraces.filter((trace) => trace.blockType === "FAQ");
  const faqStatus =
    faqSlots.length === 0
      ? "OMITTED"
      : faqSlots.every((trace) => trace.answerGrounding === "GROUNDED")
        ? "PASS"
        : "FAIL";
  const structurePass = evaluation.structuralViolations.length === 0;
  const closurePass = closure.every((item) => item.result === "PASS");
  const authorityViolations = countModelSlotAuthorityViolations(evaluation.structuralViolations);
  const eligible = getConsumerCopyEligibleFacts(recovered);
  const usageSlots = evaluation.slotTraces.filter((trace) => trace.topic === "usage" || trace.blockType === "USAGE");
  const guaranteeSlots = evaluation.slotTraces.filter(
    (trace) => trace.topic === "guarantee" || trace.blockType === "GUARANTEE",
  );

  const report = {
    SOURCE_CHANGED: "NO",
    PRODUCTFACTS_SOURCE: "stored import-facts + applyGenericFaqRecovery",
    COVERAGE: plan.coverage,
    ROUTE: variant.generationRoute,
    ANTHROPIC_CALLS: variant.anthropicCalls ?? 1,
    COPY_ELIGIBLE_FACTS: manifest.items.filter((item) => item.copyEligible).length,
    OPEN_TOPICS: plan.allowedTopics,
    CLOSED_TOPICS: plan.closedTopics,
    USAGE: recovered.usageInformation,
    USAGE_PROVENANCE: recovered.confidence.usageInformation,
    GUARANTEE: recovered.guaranteeInformation,
    GUARANTEE_PROVENANCE: recovered.confidence.guaranteeInformation,
    MANUFACTURER: recovered.manufacturer ?? null,
    INGREDIENTS: recovered.ingredientsOrComponents,
    MODEL_SLOT_COUNT: authorities.length,
    MODEL_AUTHORITY_VIOLATIONS: authorityViolations,
    RAW_PRODUCTFACTS_IN_PROMPT: /SOURCE FACTS/.test(prompt.user) ? "YES" : "NO",
    SLOT_AUTHORITY: authorities.map((item) => ({
      SLOT_ID: item.slotId,
      FIELD: item.allowedField,
      CLAIM_IDS: item.allowedClaimIds,
      EVIDENCE_IDS: item.allowedEvidenceIds,
      PROJECTED_SOURCE: item.projectedSourceText,
      ALLOWED_OPERATIONS: item.allowedOperations,
      FORBIDDEN_TOPICS: item.forbiddenTopics,
    })),
    WORD_COUNT_BEFORE: wordCount(oldBlob),
    WORD_COUNT_AFTER: wordCount(generatedBlob),
    SECTIONS_BEFORE: [...new Set(oldRaw.fills.map((fill) => fill.slotId.replace(/\d+$/, "")))],
    SECTIONS_AFTER: [...new Set((variant.slotFills || []).map((fill) => fill.slotId.replace(/\d+$/, "")))],
    SLOT_TYPES_AFTER: [...new Set(slotPlan.slots.filter((slot) => (variant.slotFills || []).some((fill) => fill.slotId === slot.slotId)).map((slot) => slot.type))],
    NEW_AUTHORIZED_TOPICS: plan.allowedTopics.filter((topic) => !["identity", "description", "features"].includes(topic)),
    RETURN_POLICY_STRENGTHENED: returnPolicyStrengthened ? "YES" : "NO",
    BUYER_PROTECTION_INVENTED: buyerProtectionInvented ? "YES" : "NO",
    USAGE_ATTRIBUTION_INVENTED: usageAttributionInvented ? "YES" : "NO",
    CROSS_FIELD_SYNTHESIS: evaluation.structuralViolations.some((item) => item.code === "UNSUPPORTED_RELATIONAL_EXPANSION")
      ? "YES"
      : "NO",
    EDITORIAL_CHARACTERIZATION: evaluation.structuralViolations.some((item) => item.code === "EDITORIAL_EXPANSION" || item.code === "SEMANTIC_CLOSURE")
      ? "YES"
      : "NO",
    CLOSED_FIELD_PROMOTION: evaluation.structuralViolations.some((item) =>
      ["USAGE_PROMOTION", "GUARANTEE_PROMOTION", "COMPOSITION_PROMOTION", "CLOSED_TOPIC"].includes(item.code),
    )
      ? "YES"
      : "NO",
    STRUCTURE: structurePass ? "PASS" : "FAIL",
    SEMANTIC_CLOSURE: closurePass ? "PASS" : "FAIL",
    SEMANTIC_AUTHORITY: authorityViolations === 0 ? "PASS" : "FAIL",
    GROUNDING: evaluation.grounding.status,
    FAQ: faqStatus,
    POLICY: evaluation.policyGate,
    CONTENT_GATE: evaluation.finalGate,
    UNSUPPORTED_CLAIMS: evaluation.grounding.unsupportedClaims.length,
    USAGE_CLAIMS: usageSlots.map((trace) => ({
      CLAIM: trace.text,
      FIELD: "usageInformation",
      EVIDENCE: eligible.usageInformation,
      PROVENANCE: recovered.confidence.usageInformation,
      GROUNDING_STATUS: trace.groundingResult,
    })),
    GUARANTEE_CLAIMS: guaranteeSlots.map((trace) => ({
      CLAIM: trace.text,
      FIELD: "guaranteeInformation",
      EVIDENCE: recovered.guaranteeInformation,
      PROVENANCE: recovered.confidence.guaranteeInformation,
      GROUNDING_STATUS: trace.groundingResult,
    })),
    FILLS: (variant.slotFills || []).map((fill) => ({
      slotId: fill.slotId,
      content: fill.content,
      question: fill.question,
      answer: fill.answer,
    })),
    HEADLINE: page.headline.text,
    BODY: variant.body,
    CTA: variant.ctaLabel,
    STRUCTURAL_CODES: evaluation.structuralViolations.map((item) => item.code),
    STRUCTURAL_DETAIL: evaluation.structuralViolations.map((item) => ({
      code: item.code,
      text: item.text.slice(0, 220),
      reason: item.reason,
    })),
    UNSUPPORTED: evaluation.grounding.unsupportedClaims,
    CLOSURE: closure,
    COMPOSITION: "NOT_RUN",
    WEB_ANATOMY: "NOT_RUN",
  };

  writeFileSync(path.join(out, "recovered-facts.json"), JSON.stringify(recovered, null, 2), "utf8");
  writeFileSync(path.join(out, "generation-plan.json"), JSON.stringify(plan, null, 2), "utf8");
  writeFileSync(path.join(out, "claim-projection.json"), JSON.stringify(projection, null, 2), "utf8");
  writeFileSync(path.join(out, "slot-authority.json"), JSON.stringify(authorities, null, 2), "utf8");
  writeFileSync(path.join(out, "generation-raw.json"), JSON.stringify({ fills: variant.slotFills, ctaLabel: variant.ctaLabel, generationRoute: variant.generationRoute, anthropicCalls: variant.anthropicCalls }, null, 2), "utf8");
  writeFileSync(path.join(out, "evaluation.json"), JSON.stringify({
    structuralViolations: evaluation.structuralViolations,
    grounding: evaluation.grounding,
    policyGate: evaluation.policyGate,
    finalGate: evaluation.finalGate,
    slotTraces: evaluation.slotTraces,
  }, null, 2), "utf8");
  writeFileSync(path.join(out, "REPORT.json"), JSON.stringify(report, null, 2), "utf8");
  writeFileSync(path.join(out, "prompt-user.txt"), prompt.user, "utf8");

  for (const [key, value] of Object.entries(report)) {
    if (["SLOT_AUTHORITY", "FILLS", "CLOSURE", "UNSUPPORTED", "STRUCTURAL_DETAIL", "BODY"].includes(key)) continue;
    console.log(`${key}=${Array.isArray(value) ? JSON.stringify(value) : typeof value === "object" && value ? JSON.stringify(value) : String(value)}`);
  }
  console.log("AUTHORITY_PROMPT_PRESENT=" + (formatModelSlotAuthorityForPrompt(authorities).includes("MODEL SLOT AUTHORITY") ? "YES" : "NO"));
  console.log("ALL_COPY_HAS_TARGET70=" + (/\bTARGET\s*=\s*70\b/i.test(allCopy + prompt.user) ? "YES" : "NO"));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
