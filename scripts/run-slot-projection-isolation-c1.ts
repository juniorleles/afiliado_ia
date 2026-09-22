/**
 * SLOT_PROJECTION_ISOLATION_V1 — C1 recovered ProductFacts MODEL replay.
 * Pre-model assertion must pass. One Anthropic call. No composition.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applyGenericFaqRecovery } from "../src/lib/faq-field-promotion.ts";
import { buildGenerationFactManifest, type ProductFacts } from "../src/lib/product-facts.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import { createEvidenceSlotPlan } from "../src/lib/ai/evidence-slot-plan.ts";
import { buildPrompt, generateVariants } from "../src/lib/ai/generate-variants.ts";
import { evaluateSlotGeneration } from "../src/lib/ai/slot-generation.ts";
import { validateThinSemanticClosure } from "../src/lib/ai/semantic-closure.ts";
import {
  countModelSlotAuthorityViolations,
  createModelSlotAuthority,
} from "../src/lib/ai/model-slot-authority.ts";
import {
  collectSlotProjectionViolations,
  visibleSemanticTopics,
} from "../src/lib/ai/slot-projection-isolation.ts";
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

async function main() {
  loadLocalEnv();
  const root = process.cwd();
  const sourceRun = path.join(root, "data/controlled-ready-13/2026-09-21-controlled-visual-13");
  const out = path.join(root, "data/web-anatomy-lab/v1/slot-projection-isolation");
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
  if (preModel.length > 0) {
    writeFileSync(path.join(out, "pre-model-violations.json"), JSON.stringify(preModel, null, 2), "utf8");
    throw new Error("SLOT_PROJECTION_AUTHORITY_VIOLATION: PRE_MODEL_SLOT_VIOLATIONS=" + preModel.length);
  }
  if (plan.generationRoute !== "MODEL") throw new Error("expected MODEL route");
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");

  const prompt = buildPrompt({
    productName: recovered.productName,
    sourceUrl: recovered.sourceUrl,
    facts: recovered,
    targetApproach: strategy.recommendedStrategy,
  });
  const variants = await generateVariants({
    productName: recovered.productName,
    sourceUrl: recovered.sourceUrl,
    facts: recovered,
    targetApproach: strategy.recommendedStrategy,
  });
  const variant = variants[0];
  if (!variant) throw new Error("no variant");
  const evaluation = evaluateSlotGeneration(
    { variants: [{ cta: { label: variant.ctaLabel }, slots: variant.slotFills || [] }] },
    recovered,
    recovered.productName,
    VALIDATION_SAFE_AFFILIATE,
    slotPlan,
  );
  const closure = (variant.slotFills || []).map((fill) => {
    const slot = slotPlan.slots.find((item) => item.slotId === fill.slotId);
    const generated = slot?.type === "FAQ" ? (fill.answer || "").trim() : (fill.content || "").trim();
    const support = (slot?.evidence || []).map((item) => item.value).join("\n");
    return validateThinSemanticClosure({
      generated,
      support,
      slotType: slot?.type,
      thinMode: false,
    });
  });
  const authorityViolations = countModelSlotAuthorityViolations(evaluation.structuralViolations);
  const blob = (variant.slotFills || [])
    .map((fill) => [fill.content, fill.question, fill.answer].filter(Boolean).join(" "))
    .join("\n");
  const report = {
    PRE_MODEL_SLOT_VIOLATIONS: 0,
    ROUTE: variant.generationRoute,
    ANTHROPIC_CALLS: variant.anthropicCalls ?? 1,
    MODEL_SLOT_COUNT: slotPlan.slots.length,
    MODEL_AUTHORITY_VIOLATIONS: authorityViolations,
    CROSS_FIELD_SYNTHESIS: evaluation.structuralViolations.some((item) => item.code === "UNSUPPORTED_RELATIONAL_EXPANSION")
      ? "YES"
      : "NO",
    CLOSED_FIELD_PROMOTION: evaluation.structuralViolations.some((item) =>
      ["USAGE_PROMOTION", "GUARANTEE_PROMOTION", "COMPOSITION_PROMOTION", "CLOSED_TOPIC"].includes(item.code),
    )
      ? "YES"
      : "NO",
    STRUCTURE: evaluation.structuralViolations.length === 0 ? "PASS" : "FAIL",
    SEMANTIC_CLOSURE: closure.every((item) => item.result === "PASS") ? "PASS" : "FAIL",
    SEMANTIC_AUTHORITY: authorityViolations === 0 ? "PASS" : "FAIL",
    GROUNDING: evaluation.grounding.status,
    FAQ:
      evaluation.slotTraces.filter((trace) => trace.blockType === "FAQ").length === 0
        ? "OMITTED"
        : evaluation.slotTraces.filter((trace) => trace.blockType === "FAQ").every((trace) => trace.answerGrounding === "GROUNDED")
          ? "PASS"
          : "FAIL",
    POLICY: evaluation.policyGate,
    CONTENT_GATE: evaluation.finalGate,
    UNSUPPORTED_CLAIMS: evaluation.grounding.unsupportedClaims.length,
    RAW_PRODUCTFACTS_IN_PROMPT: /SOURCE FACTS/.test(prompt.user) ? "YES" : "NO",
    STRUCTURAL_CODES: evaluation.structuralViolations.map((item) => item.code),
    STRUCTURAL_DETAIL: evaluation.structuralViolations.map((item) => ({
      code: item.code,
      text: item.text.slice(0, 220),
      reason: item.reason,
    })),
    UNSUPPORTED: evaluation.grounding.unsupportedClaims,
    FILLS: variant.slotFills,
    CTA: variant.ctaLabel,
    SLOT_PREVIEW: slotPlan.slots.map((slot) => ({
      SLOT_ID: slot.slotId,
      FIELD: slot.topic,
      AUTHORIZED_TOPICS: [slot.topic],
      VISIBLE_TOPICS: visibleSemanticTopics(slot.evidence.map((item) => item.value).join(" ")),
      PROJECTED_SOURCE_SUMMARY: slot.evidence.map((item) => item.value).join(" / ").slice(0, 180),
    })),
    COMPOSITION: "NOT_RUN",
    WEB_ANATOMY: "NOT_RUN",
    BLOB_HAS_MONEY_BACK: /\bmoney[\s-]?back guarantee\b/i.test(blob),
  };

  writeFileSync(path.join(out, "REPORT.json"), JSON.stringify(report, null, 2), "utf8");
  writeFileSync(path.join(out, "generation-raw.json"), JSON.stringify({ fills: variant.slotFills, ctaLabel: variant.ctaLabel }, null, 2), "utf8");
  writeFileSync(
    path.join(out, "slot-authority.json"),
    JSON.stringify(slotPlan.slots.map((slot) => createModelSlotAuthority(slot, plan)), null, 2),
    "utf8",
  );
  for (const [key, value] of Object.entries(report)) {
    if (["FILLS", "UNSUPPORTED", "STRUCTURAL_DETAIL", "SLOT_PREVIEW"].includes(key)) continue;
    console.log(`${key}=${Array.isArray(value) ? JSON.stringify(value) : String(value)}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
