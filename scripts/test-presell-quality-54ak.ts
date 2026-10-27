// npx tsx scripts/test-presell-quality-54ak.ts
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createCampaign } from "../src/lib/campaigns.ts";
import { QUALITY_PROMPT_VERSION, QUALITY_TARGET } from "../src/lib/presell-quality/types.ts";
import { weightedQualityScore } from "../src/lib/presell-quality/score.ts";
import { mockOpenAiVisionClient, mockPayloadFromScores } from "../src/lib/presell-quality/mock.ts";
import { createMultimodalPresellEvaluator } from "../src/lib/presell-quality/multimodal.ts";
import { paidAiAuthorization, runWithTemporaryPaidAi } from "../src/lib/ai/paid-gate.ts";
import { budgetAllowsCall, emptyBudgetLedger, EXECUTION_54AK_BUDGET } from "../src/lib/presell-quality/budget.ts";
import { campaignIntegritySnapshot } from "../src/lib/campaign-sources/resolve-commercial.ts";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { labScenarioKeys } from "../src/lib/design-system/scenarios.ts";
import { defaultEvaluationMeta, type PresellEvaluationInput } from "../src/lib/presell-quality/input.ts";
import { screenshotAssociationError } from "../src/lib/presell-quality/normalize.ts";
import { validateScreenshotBinding } from "../src/lib/presell-quality/binding.ts";
import { contentFingerprintOf, presentationFingerprintOf } from "../src/lib/presell-quality/context.ts";
import { applyDeclaredPresellMedia } from "../src/lib/presell-quality/apply-declared-media.ts";
import { selectEditorialPlacement } from "../src/lib/presell-quality/editorial-placement.ts";
import { recordUserAssetDeclaration } from "../src/lib/presell-quality/user-asset-declaration.ts";
import { classifyAssetSuitabilityFromMetadata } from "../src/lib/presell-quality/asset-suitability.ts";
import { validateCopyRewrite, extractComparableNumbers } from "../src/lib/presell-quality/copy-validate.ts";
import { proposeDeterministicRewrites, splitUsageSteps } from "../src/lib/presell-quality/copy-rewrite.ts";
import { applySafeCopyOptimization, restoreCopyOptimization } from "../src/lib/presell-quality/apply-copy-optimization.ts";
import { auditApprovedCopy } from "../src/lib/presell-quality/copy-audit.ts";
import { reportEditorialStructure } from "../src/lib/presell-quality/editorial-structure.ts";
import { QUALITY_RUBRIC_VERSION } from "../src/lib/presell-quality/types.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

function shot(dir: string, name: string, generationId: string) {
  const file = path.join(dir, name);
  writeFileSync(file, PIXEL);
  return {
    role: name.includes("-m.") ? ("mobile" as const) : ("desktop" as const),
    path: file,
    generationId,
    sha256: createHash("sha256").update(PIXEL).digest("hex"),
    width: name.includes("-m.") ? 390 : 1440,
    height: name.includes("-m.") ? 844 : 900,
  };
}

async function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  process.env.AIA_PRESELL_QUALITY_ROOT = mkdtempSync(path.join(os.tmpdir(), "54ak-quality-"));
  const isolated = createCampaign({
    name: "Novalis 54AK",
    slug: `novalis-54ak-${Date.now()}`,
    headline: "Novalis",
    body: "Novalis",
    ctaLabel: "See offer",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });

  const facts = [
    { field: "description", factId: "f-desc", value: "Novalis Core is presented by the seller as a documented capsule." },
    { field: "ingredients", factId: "f-ing", value: "Mineral blend" },
    { field: "howItWorks", factId: "f-use", value: "Take two full droppers under your tongue in the morning before breakfast. Hold the tincture under your tongue for 30 seconds before swallowing to maximize absorption. If the taste is too potent or prefer another method, dissolve two full droppers in a glass of water." },
    { field: "guarantee", factId: "f-gar", value: "If you are unsatisfied with your product for any reason you will have 60 days from the date of purchase to return the product and request a refund." },
  ];

  const safe = validateCopyRewrite({
    field: "howItWorks",
    factId: "f-use",
    original: facts[2]!.value,
    proposed: facts[2]!.value.replace("or prefer another method", "or you prefer another method"),
    section: "how_it_works",
  });
  assert(safe.status === "SAFE_REWRITE", "2. reescrita segura gramatical");
  const claim = validateCopyRewrite({
    field: "description",
    factId: "f-desc",
    original: facts[0]!.value,
    proposed: "Novalis Core clinically proven to lower blood sugar.",
    section: "hero",
  });
  assert(claim.status === "UNSUPPORTED_CLAIM", "3. claim novo rejeitado");
  const numbers = validateCopyRewrite({
    field: "guarantee",
    factId: "f-gar",
    original: facts[3]!.value,
    proposed: "The seller states: you will have 90 days to return the product and request a refund.",
    section: "guarantee",
  });
  assert(numbers.status === "MEANING_CHANGED" && extractComparableNumbers(facts[3]!.value).includes("60"), "4. numeros da garantia preservados");
  const usageChange = validateCopyRewrite({
    field: "howItWorks",
    factId: "f-use",
    original: facts[2]!.value,
    proposed: "Take three full droppers under your tongue in the morning before breakfast. Hold the tincture under your tongue for 30 seconds before swallowing to maximize absorption.",
    section: "how_it_works",
  });
  assert(usageChange.status === "MEANING_CHANGED", "6. instrucoes de uso nao mudam quantidade");
  const seller = validateCopyRewrite({
    field: "guarantee",
    factId: "f-gar",
    original: facts[3]!.value,
    proposed: `The seller states: ${facts[3]!.value}`,
    section: "guarantee",
  });
  assert(seller.status === "SAFE_REWRITE" && /seller/i.test(seller.proposed), "5. garantia e 7. atribuicao ao vendedor");

  const proposals = proposeDeterministicRewrites(facts);
  const models = labScenarioKeys().map((key) => buildV4Model(key)).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const noImage = models.find((model) => !model.commercialImage) ?? models[0];
  assert(Boolean(noImage), "lab editorial disponivel");

  const declaration = recordUserAssetDeclaration({
    campaignId: isolated.id,
    declarationText: "As imagens do produto ja estao autorizadas.",
    assetIds: ["asset-pack"],
    origins: [{ assetId: "asset-pack", originalHost: "shop.novalis.example", originalPath: "img/2bootle.png", sourceFile: "2bootle.png" }],
  });
  const pack = classifyAssetSuitabilityFromMetadata({ assetId: "asset-pack", fileName: "2bootle.png" }, declaration);
  const placement = selectEditorialPlacement({
    declaration,
    classifications: [pack],
    sources: [{ assetId: "asset-pack", src: "/media/product/novalis-pack.png" }],
    productName: "Novalis Core",
  });
  const withHero = applyDeclaredPresellMedia(noImage!, placement);
  const optimized = applySafeCopyOptimization(withHero, proposals);
  const markup = renderToStaticMarkup(createElement(V4Page, { model: optimized.model }));
  const structure = reportEditorialStructure(optimized.model);
  const audit = auditApprovedCopy({
    campaignId: isolated.id,
    model: withHero,
    accepted: facts.map((item) => ({ field: item.field, value: item.value, factId: item.factId })),
  });
  assert(audit.findings.length > 0, "auditoria estruturada existe");
  assert(structure.sections.some((item) => item.title === "Directions for Use"), "8. secao de uso retitulada");
  assert(structure.disclosureBand && markup.includes('data-v4-disclosure="band"'), "10. divulgacao de afiliado visivel");
  assert(!structure.duplicateHeroOverview, "9. overview nao duplica o hero");
  assert(structure.heroMode === "PRODUCT_IMAGE" && markup.includes("/media/product/novalis-pack.png"), "11. hero com imagem preservado");
  assert(declaration.authorizationScope === "PRESELL_USE", "12. autorizacao de imagens preservada");
  const css = readFileSync(path.join(process.cwd(), "src/app/renderer-v4-lab.css"), "utf8");
  assert(css.includes(".v4-disclosure-band") && css.includes("max-width: 18rem"), "13. responsividade e banda de divulgacao");
  assert(splitUsageSteps(facts[2]!.value).length === 2, "6. uso dividido em dois passos aceitos");
  assert(markup.includes("Seller-stated") && markup.includes("60 days"), "5. garantia seller-stated intacta");

  const before237 = campaignIntegritySnapshot(237);
  applySafeCopyOptimization(optimized.model, proposals);
  const after237 = campaignIntegritySnapshot(237);
  assert(JSON.stringify(before237.acceptedFacts) === JSON.stringify(after237.acceptedFacts), "1. fatos aceitos preservados");
  assert(JSON.stringify(before237.approvedAssets) === JSON.stringify(after237.approvedAssets), "1. assets aprovados preservados");

  const rolled = restoreCopyOptimization(withHero);
  assert(contentFingerprintOf(rolled) === contentFingerprintOf(withHero), "17. rollback restaura a melhor geracao");
  assert(presentationFingerprintOf(optimized.model) !== presentationFingerprintOf(withHero), "14. fingerprint de apresentacao muda com a copy");

  const dir = mkdtempSync(path.join(os.tmpdir(), "54ak-"));
  mkdirSync(dir, { recursive: true });
  const input: PresellEvaluationInput = {
    campaignId: isolated.id,
    generationId: "gen-ak",
    productContractVersion: defaultEvaluationMeta().productContractVersion,
    rendererVersion: defaultEvaluationMeta().rendererVersion,
    screenshots: { desktop: shot(dir, "gen-ak-d.png", "gen-ak"), mobile: shot(dir, "gen-ak-m.png", "gen-ak") },
    pageStructure: { heroMode: "PRODUCT_IMAGE" },
    renderedCopy: optimized.model.copy.introduction.text,
    approvedFacts: facts.map((item) => item.field),
    evidenceReferences: ["ev1"],
    approvedAssets: [{ id: "asset-pack", eligible: true, kind: "PRODUCT_PACKSHOT" }],
    editorialConstraints: ["SAFE_REWRITE"],
    rubricVersion: QUALITY_RUBRIC_VERSION,
    promptVersion: QUALITY_PROMPT_VERSION,
  };
  assert(screenshotAssociationError({ generationId: "gen-ak", desktop: input.screenshots.desktop, mobile: input.screenshots.mobile }) === null, "15. binding valido");
  assert(validateScreenshotBinding({ generationId: "other", desktop: input.screenshots.desktop, mobile: input.screenshots.mobile }).ok === false, "15. binding rejeita outra geracao");
  const evaluator = createMultimodalPresellEvaluator({
    env: { AIA_ALLOW_PAID_AI: "1", OPENAI_API_KEY: "sk-test", AIA_PAID_AI_PROVIDER: "openai" },
    client: mockOpenAiVisionClient(mockPayloadFromScores(84)),
    skipCache: true,
  });
  const assessment = await evaluator.evaluate(input);
  assert(assessment.overallScore === weightedQualityScore(assessment.dimensionScores.map((row) => ({ dimension: row.dimension, score: row.score }))), "16. score host-side");
  assert(EXECUTION_54AK_BUDGET.maxUsd === 1 && EXECUTION_54AK_BUDGET.maxCampaignEvals === 3, "18. teto 54AK");
  assert(budgetAllowsCall({ ...emptyBudgetLedger("54AK"), maxUsd: 1, spentUsd: 0.9 }, EXECUTION_54AK_BUDGET.reserveUsdPerEvaluation).allowed === false, "18. limite de orcamento");
  assert(assessment.publicationReadiness === "BLOCKED", "20. publicacao bloqueada");
  assert(assessment.commercialAuthorization === "BLOCKED", "19. CTA comercial bloqueado");
  assert(paidAiAuthorization().allowed === false, "paid AI bloqueada fora do gate");
  const restored = await runWithTemporaryPaidAi({ scope: "54AK", provider: "openai", maxUsd: 1 }, async () => paidAiAuthorization().allowed);
  assert(restored === true && paidAiAuthorization().allowed === false, "autorizacao temporaria 54AK nao grava env");
  assert(QUALITY_PROMPT_VERSION === "4" && QUALITY_TARGET === 85, "rubrica v4 intacta");

  console.log(`PASS test-presell-quality-54ak.ts (${passed} OK)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
