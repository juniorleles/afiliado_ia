/**
 * MODEL_WORDING_CONSTRAINT_V1 — one controlled MODEL replay after stored-output validation.
 * No retry. No composition.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applyGenericFaqRecovery } from "../src/lib/faq-field-promotion.ts";
import { buildGenerationFactManifest, type ProductFacts } from "../src/lib/product-facts.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import { createEvidenceSlotPlan } from "../src/lib/ai/evidence-slot-plan.ts";
import { generateVariants } from "../src/lib/ai/generate-variants.ts";
import { evaluateSlotGeneration } from "../src/lib/ai/slot-generation.ts";
import { countModelSlotAuthorityViolations } from "../src/lib/ai/model-slot-authority.ts";
import { countModelWordingConstraintViolations } from "../src/lib/ai/model-wording-constraint.ts";
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
  const out = path.join(root, "data/web-anatomy-lab/v1/model-wording-constraint");
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
  const evaluation = evaluateSlotGeneration(
    { variants: [{ cta: { label: variant.ctaLabel }, slots: variant.slotFills || [] }] },
    recovered,
    recovered.productName,
    VALIDATION_SAFE_AFFILIATE,
    slotPlan,
  );
  const wording = evaluation.structuralViolations.filter((item) => item.code === "MODEL_WORDING_CONSTRAINT_VIOLATION");
  const report = {
    RUN: "YES",
    ROUTE: variant.generationRoute,
    ANTHROPIC_CALLS: variant.anthropicCalls ?? 1,
    MODEL_WORDING_CONSTRAINT_VIOLATIONS: countModelWordingConstraintViolations(evaluation.structuralViolations),
    MODEL_AUTHORITY_VIOLATIONS: countModelSlotAuthorityViolations(evaluation.structuralViolations),
    UNSUPPORTED_CLAIMS: evaluation.grounding.unsupportedClaims.length,
    CONTENT_GATE: evaluation.finalGate,
    POLICY: evaluation.policyGate,
    GROUNDING: evaluation.grounding.status,
    STRUCTURE: evaluation.structuralViolations.length === 0 ? "PASS" : "FAIL",
    WORDING_DETAIL: wording.map((item) => ({
      text: item.text.slice(0, 220),
      reason: item.reason.slice(0, 280),
    })),
    FILLS: variant.slotFills,
    CTA: variant.ctaLabel,
    COMPOSITION: "NOT_RUN",
    WEB_ANATOMY: "NOT_RUN",
  };
  writeFileSync(path.join(out, "REPORT.json"), JSON.stringify(report, null, 2), "utf8");
  writeFileSync(
    path.join(out, "generation-raw.json"),
    JSON.stringify({ fills: variant.slotFills, ctaLabel: variant.ctaLabel }, null, 2),
    "utf8",
  );
  for (const [key, value] of Object.entries(report)) {
    if (["WORDING_DETAIL", "FILLS"].includes(key)) continue;
    console.log(`${key}=${Array.isArray(value) ? JSON.stringify(value) : String(value)}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
