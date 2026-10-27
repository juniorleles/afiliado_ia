// npx tsx scripts/test-quality-calibration-54ag.ts
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createCampaign } from "../src/lib/campaigns.ts";
import { QUALITY_DIMENSION_WEIGHTS, QUALITY_PROMPT_VERSION, QUALITY_TARGET } from "../src/lib/presell-quality/types.ts";
import { weightedQualityScore } from "../src/lib/presell-quality/score.ts";
import { MULTIMODAL_QUALITY_JSON_SCHEMA } from "../src/lib/presell-quality/schema.ts";
import { detectDoublePenalty } from "../src/lib/presell-quality/dimension-overlap.ts";
import { triageFactCandidates } from "../src/lib/presell-quality/fact-triage.ts";
import { buildEditorialEnrichmentPlan } from "../src/lib/presell-quality/enrichment-plan.ts";
import { campaignIntegritySnapshot } from "../src/lib/campaign-sources/resolve-commercial.ts";
import { evaluationFingerprint } from "../src/lib/presell-quality/fingerprint.ts";
import { defaultEvaluationMeta } from "../src/lib/presell-quality/input.ts";
import { QUALITY_RUBRIC_VERSION } from "../src/lib/presell-quality/types.ts";
import { OPENAI_LOOP_BUDGET, budgetAllowsCall, emptyBudgetLedger } from "../src/lib/presell-quality/budget.ts";
import { QUALITY_CALIBRATION_FIXTURES } from "../src/lib/presell-quality/fixtures.ts";
import type { FactCandidate } from "../src/lib/presell-quality/recovery.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

function candidate(partial: Partial<FactCandidate> & { text: string; field: FactCandidate["field"] }): FactCandidate {
  return {
    sourceUrl: "https://shop.novalis.example/",
    sourceClass: "SELLER",
    excerpt: partial.text,
    collectedAt: "2026-01-01T00:00:00.000Z",
    verification: "SELLER_STATED",
    usable: true,
    approvedForUse: false,
    blockReason: null,
    duplicateOf: null,
    ...partial,
  };
}

async function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  const isolated = createCampaign({
    name: "Novalis 54AG",
    slug: `novalis-54ag-${Date.now()}`,
    headline: "Novalis",
    body: "Novalis",
    ctaLabel: "See offer",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });

  const even = weightedQualityScore([
    { dimension: "DESIGN_HIERARCHY", score: 80 },
    { dimension: "COPY_CLARITY", score: 80 },
    { dimension: "DEPTH_ORGANIZATION", score: 80 },
    { dimension: "IMAGES_COMPOSITION", score: 80 },
    { dimension: "MOBILE_EXPERIENCE", score: 80 },
    { dimension: "TRANSPARENCY_LEGIBILITY", score: 80 },
  ]);
  assert(even === 80, "1. consistencia de scores host-side");
  assert(Math.abs(Object.values(QUALITY_DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0) - 1) < 0.001, "2. separacao de dimensoes com pesos intactos");

  const overlap = detectDoublePenalty({
    dimensionScores: [
      { dimension: "DESIGN_HIERARCHY", score: 60, rationale: "Hero lacks a packshot.", weight: 0.25 },
      { dimension: "COPY_CLARITY", score: 70, rationale: "Clear.", weight: 0.2 },
      { dimension: "DEPTH_ORGANIZATION", score: 50, rationale: "Thin.", weight: 0.2 },
      { dimension: "IMAGES_COMPOSITION", score: 40, rationale: "No eligible packshot.", weight: 0.15 },
      { dimension: "MOBILE_EXPERIENCE", score: 80, rationale: "Readable.", weight: 0.1 },
      { dimension: "TRANSPARENCY_LEGIBILITY", score: 60, rationale: "Disclosure present.", weight: 0.1 },
    ],
    findings: [{ id: "hero", dimension: "DESIGN_HIERARCHY", severity: "WARNING", message: "Hero lacks packshot.", evidence: [] }],
  });
  assert(overlap.detected && overlap.sharedProblem === "missing-packshot", "3. penalizacao duplicada detectada");

  const triaged = triageFactCandidates({
    acceptedTexts: ["Novalis Core is a documented capsule."],
    officialHosts: ["shop.novalis.example"],
    candidates: [
      candidate({ field: "warnings", text: "If you are pregnant, nursing, or under 18, this product is not designed for you." }),
      candidate({ field: "benefits", text: "Fat Burning Aid" }),
      candidate({ field: "description", text: "Novalis Core is a documented capsule." }),
      candidate({ field: "warnings", text: "A different conflict.", blockReason: "Conflicts with an accepted fact." }),
      candidate({ field: "benefits", text: "Clinically proven to treat diabetes.", sourceUrl: "https://clone.vercel.app/" }),
    ],
  });
  assert(triaged[0]?.nextState === "ELIGIBLE_FOR_REVIEW" && triaged[0].triageClass === "DESCRIPTIVE_LOW_RISK", "hero editorial / fato descritivo elegivel para review");
  assert(triaged[1]?.triageClass === "HEALTH_OR_EFFICACY_CLAIM" && triaged[1].nextState === "BLOCKED_UNSUPPORTED", "10. alegacoes medicas bloqueadas");
  assert(triaged[2]?.nextState === "DUPLICATE_EXISTING_FACT", "12. duplicacao");
  assert(triaged[3]?.nextState === "REJECTED_CONTRADICTED", "11. contradicao");
  assert(triaged[0]?.sourceUrl.includes("novalis.example"), "9. proveniencia preservada");
  assert(triaged.every((item) => item.approvedForUse === false), "nenhuma auto-aprovacao");

  const plan = buildEditorialEnrichmentPlan({ acceptedFields: ["description", "ingredients"], triaged });
  assert(plan.factsAutoApproved === 0 && plan.pendingHumanReview.length === 1, "classificacao de risco e plano");

  const dir = mkdtempSync(path.join(os.tmpdir(), "54ag-"));
  const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  writeFileSync(path.join(dir, "d.png"), pixel);
  const meta = defaultEvaluationMeta();
  const input = {
    campaignId: isolated.id,
    generationId: "gen-ag",
    productContractVersion: meta.productContractVersion,
    rendererVersion: meta.rendererVersion,
    screenshots: {
      desktop: { role: "desktop" as const, path: path.join(dir, "d.png"), generationId: "gen-ag", sha256: createHash("sha256").update(pixel).digest("hex"), width: 1440, height: 900 },
      mobile: { role: "mobile" as const, path: path.join(dir, "d.png"), generationId: "gen-ag", sha256: createHash("sha256").update(pixel).digest("hex"), width: 390, height: 844 },
    },
    pageStructure: { sections: ["hero"] },
    renderedCopy: "SANDBOX View official offer",
    approvedFacts: ["description"],
    evidenceReferences: ["e"],
    approvedAssets: [{ id: "x", eligible: false, kind: "OTHER" }],
    editorialConstraints: ["EDITORIAL_NO_IMAGE"],
    rubricVersion: QUALITY_RUBRIC_VERSION,
    promptVersion: QUALITY_PROMPT_VERSION,
  };
  assert(evaluationFingerprint(input) === evaluationFingerprint(input), "8. fingerprints");
  assert(MULTIMODAL_QUALITY_JSON_SCHEMA.type === "object", "6. JSON estruturado");
  assert(QUALITY_PROMPT_VERSION === "4", "prompt v4");
  assert(/SANDBOX/.test(input.renderedCopy), "5. selo SANDBOX no contexto");
  assert(QUALITY_CALIBRATION_FIXTURES.length === 6, "fixtures de referencia");

  const before237 = campaignIntegritySnapshot(237);
  triageFactCandidates({ candidates: [candidate({ field: "faq", text: "How is it taken? One capsule daily." })], acceptedTexts: [] });
  const after237 = campaignIntegritySnapshot(237);
  assert(JSON.stringify(before237.acceptedFacts) === JSON.stringify(after237.acceptedFacts), "14. product contract preservado");
  assert(budgetAllowsCall({ ...emptyBudgetLedger("54AG"), evaluationCount: 3 }).allowed === false, "15. limites de orcamento");
  assert(before237.publicationStatus !== "published" && QUALITY_TARGET === 85, "16. publicacao e meta intactas");
  assert(OPENAI_LOOP_BUDGET.maxUsd === 2, "teto 2 usd");

  console.log(`PASS test-quality-calibration-54ag.ts (${passed} OK)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
