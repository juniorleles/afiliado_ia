// npx tsx scripts/test-presell-quality-54aj.ts
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createCampaign } from "../src/lib/campaigns.ts";
import { QUALITY_DIMENSION_WEIGHTS, QUALITY_PROMPT_VERSION, QUALITY_RUBRIC_VERSION, QUALITY_TARGET } from "../src/lib/presell-quality/types.ts";
import { weightedQualityScore } from "../src/lib/presell-quality/score.ts";
import { mockOpenAiVisionClient, mockPayloadFromScores } from "../src/lib/presell-quality/mock.ts";
import { createMultimodalPresellEvaluator } from "../src/lib/presell-quality/multimodal.ts";
import { paidAiAuthorization, runWithTemporaryPaidAi } from "../src/lib/ai/paid-gate.ts";
import { budgetAllowsCall, emptyBudgetLedger, EXECUTION_54AJ_BUDGET } from "../src/lib/presell-quality/budget.ts";
import { applyEditorialReconstruction } from "../src/lib/presell-quality/reconstruct.ts";
import { proposeEditorialPlan } from "../src/lib/presell-quality/editorial-plan.ts";
import { campaignIntegritySnapshot } from "../src/lib/campaign-sources/resolve-commercial.ts";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { labScenarioKeys } from "../src/lib/design-system/scenarios.ts";
import { defaultEvaluationMeta, type PresellEvaluationInput } from "../src/lib/presell-quality/input.ts";
import { screenshotAssociationError, normalizeModelPayload } from "../src/lib/presell-quality/normalize.ts";
import { validateScreenshotBinding } from "../src/lib/presell-quality/binding.ts";
import { contentFingerprintOf, presentationFingerprintOf } from "../src/lib/presell-quality/context.ts";
import {
  recordUserAssetDeclaration,
  readUserAssetDeclaration,
  productImageIdsForDeclaration,
  declarationCoversAsset,
  declarationAuthorizesAds,
  declarationAuthorizesScope,
  separateMediaStates,
} from "../src/lib/presell-quality/user-asset-declaration.ts";
import {
  classifyAssetSuitabilityFromMetadata,
  mergeVisionSuitability,
} from "../src/lib/presell-quality/asset-suitability.ts";
import { selectEditorialPlacement } from "../src/lib/presell-quality/editorial-placement.ts";
import { applyDeclaredPresellMedia, galleryHasDuplicateSrc } from "../src/lib/presell-quality/apply-declared-media.ts";
import type { DiscoveredAffiliateAsset } from "../src/lib/affiliate-policy/types.ts";

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

function sampleInput(dir: string, campaignId: number, generationId: string): PresellEvaluationInput {
  const meta = defaultEvaluationMeta();
  return {
    campaignId,
    generationId,
    productContractVersion: meta.productContractVersion,
    rendererVersion: meta.rendererVersion,
    screenshots: { desktop: shot(dir, `${generationId}-d.png`, generationId), mobile: shot(dir, `${generationId}-m.png`, generationId) },
    pageStructure: { heroMode: "PRODUCT_IMAGE" },
    renderedCopy: "Novalis Core is a documented capsule.",
    approvedFacts: ["description", "ingredients", "howItWorks", "guarantee"],
    evidenceReferences: ["ev1"],
    approvedAssets: [{ id: "pack", eligible: true, kind: "PRODUCT_PACKSHOT" }],
    editorialConstraints: ["PRODUCT_IMAGE"],
    rubricVersion: QUALITY_RUBRIC_VERSION,
    promptVersion: QUALITY_PROMPT_VERSION,
  };
}

function asset(url: string, status: DiscoveredAffiliateAsset["status"] = "USER_APPROVED"): DiscoveredAffiliateAsset {
  return {
    assetUrl: url,
    sourceUrl: "https://shop.novalis.example/assets",
    assetType: "IMAGE",
    status,
    hero: false,
    galleryKind: "OTHER",
    context: "",
    decidedAt: null,
    kindProposal: null,
    declaredAuthorization: "UNSTATED",
    usageRestrictions: [],
  };
}

async function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  process.env.AIA_PRESELL_QUALITY_ROOT = mkdtempSync(path.join(os.tmpdir(), "54aj-quality-"));

  const isolated = createCampaign({
    name: "Novalis 54AJ",
    slug: `novalis-54aj-${Date.now()}`,
    headline: "Novalis",
    body: "Novalis",
    ctaLabel: "See offer",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });

  const assets = [
    asset("https://shop.novalis.example/img/2bootle-fruits.png"),
    asset("https://shop.novalis.example/img/i-eleuthero.jpg"),
    asset("https://shop.novalis.example/img/i-coleus.jpg"),
    asset("https://shop.novalis.example/img/i-maca-root.jpg"),
    asset("https://shop.novalis.example/img/i-african-mango.jpg"),
    asset("https://shop.novalis.example/img/continue.svg", "REVIEW_REQUIRED"),
    asset("https://shop.novalis.example/img/signature.png", "REVIEW_REQUIRED"),
  ];
  const assetIds = productImageIdsForDeclaration(assets);
  assert(assetIds.length === 5, "1. declaracao cobre somente as cinco imagens de produto");
  const recorded = recordUserAssetDeclaration({
    campaignId: isolated.id,
    declarationText: "As imagens do produto ja estao autorizadas.",
    assetIds,
    origins: [
      { assetId: assetIds[0]!, originalHost: "shop.novalis.example", originalPath: "img/2bootle-fruits.png", sourceFile: "2bootle-fruits.png" },
    ],
    declaredAt: "2026-10-27T12:00:00.000Z",
  });
  const stored = readUserAssetDeclaration(isolated.id);
  assert(stored?.authorizationSource === "USER_DECLARATION" && stored.verificationStatus === "USER_ATTESTED_NOT_INDEPENDENTLY_VERIFIED", "1. autorizacao declarada persistida");
  assert(stored?.independentlyVerifiedLicense === false, "1. nao cria licenca independentemente verificada");
  assert(declarationAuthorizesScope(stored, "PRESELL_USE") === true, "2. escopo limitado a Pre-sell");
  assert(declarationAuthorizesAds(stored) === false && declarationAuthorizesScope(stored, "GOOGLE_ADS") === false, "2. ads permanecem fora do escopo");
  assert(stored?.origins[0]?.originalHost === "shop.novalis.example" && stored.origins[0]?.sourceFile === "2bootle-fruits.png", "3. origem original preservada");
  const again = recordUserAssetDeclaration({
    campaignId: isolated.id,
    declarationText: "As imagens do produto ja estao autorizadas.",
    assetIds,
    origins: stored!.origins,
    declaredAt: "2026-10-27T13:00:00.000Z",
  });
  assert(again.history.length === 2 && again.declaredAt === "2026-10-27T12:00:00.000Z", "4. historico de direitos e append-only");

  const packMeta = classifyAssetSuitabilityFromMetadata(
    { assetId: assetIds[0]!, fileName: "2bootle-fruits.png" },
    recorded,
  );
  const leafMeta = classifyAssetSuitabilityFromMetadata(
    { assetId: assetIds[1]!, fileName: "i-eleuthero.jpg" },
    recorded,
  );
  assert(packMeta.heroEligible && packMeta.imageType === "PRODUCT_PACKSHOT", "6. packshot candidato pelo nome");
  assert(!leafMeta.heroEligible && leafMeta.imageType === "INGREDIENT", "7. ingrediente rejeitado para hero");
  const promoted = mergeVisionSuitability(leafMeta, {
    imageType: "PRODUCT_PACKSHOT",
    heroEligible: true,
    galleryEligible: true,
    reason: "Looks like a bottle.",
    confidence: 0.99,
  });
  assert(promoted.imageType === "INGREDIENT" && promoted.heroEligible === false, "5. visao nao promove planta a packshot");
  assert(
    separateMediaStates({ rightToUse: true, suitableForRole: false, editorialApproved: true }).editorialApproval === false,
    "5. autorizacao nao implica elegibilidade visual",
  );
  assert(declarationCoversAsset(recorded, assetIds[1]!) && !leafMeta.heroEligible, "5. right-to-use separado de suitability");

  const placement = selectEditorialPlacement({
    declaration: recorded,
    classifications: [packMeta, leafMeta],
    sources: [
      { assetId: assetIds[0]!, src: "/media/product/novalis-pack.png" },
      { assetId: assetIds[1]!, src: "/media/product/novalis-leaf.png" },
    ],
    productName: "Novalis Core",
  });
  assert(placement.status === "SELECTED" && placement.heroMode === "PRODUCT_IMAGE" && placement.hero?.assetId === assetIds[0], "6. packshot selecionado para hero");
  assert(placement.gallery.every((item) => item.assetId !== assetIds[1]), "9. galeria nao usa ingrediente decorativo");

  const rejected = selectEditorialPlacement({
    declaration: recorded,
    classifications: [leafMeta],
    sources: [{ assetId: assetIds[1]!, src: "/media/product/novalis-leaf.png" }],
    productName: "Novalis Core",
  });
  assert(rejected.status === "HERO_ASSET_NOT_SUITABLE" && rejected.heroMode === "EDITORIAL_NO_IMAGE", "7. imagem inadequada nao e forcada no hero");

  const models = labScenarioKeys().map((key) => buildV4Model(key)).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const noImage = models.find((model) => !model.commercialImage) ?? models[0];
  assert(Boolean(noImage), "lab editorial disponivel");
  const withHero = applyDeclaredPresellMedia(noImage!, placement);
  const markup = renderToStaticMarkup(createElement(V4Page, { model: withHero }));
  assert(markup.includes('data-hero-mode="PRODUCT_IMAGE"') && markup.includes('src="/media/product/novalis-pack.png"'), "8. hero com imagem real do produto");
  assert(!galleryHasDuplicateSrc(withHero.galleryImages, withHero.commercialImage?.src), "9. galeria sem duplicacoes");
  assert(!markup.includes("/media/product/novalis-leaf.png"), "9. ingrediente nao entra como prova");

  const css = readFileSync(path.join(process.cwd(), "src/app/renderer-v4-lab.css"), "utf8");
  assert(css.includes(".ds-hero-band--product-image") && css.includes("max-width: 18rem"), "10. responsividade do hero com produto");

  const plan = proposeEditorialPlan({
    run: {
      campaignId: isolated.id,
      runId: "run-aj",
      productName: "Novalis Core",
      status: "COMPLETED",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      seeds: [],
      proposals: [
        { field: "description", currentValue: "Novalis Core is a documented capsule.", suggestedValue: "Novalis Core is a documented capsule.", status: "ACCEPTED", evidenceIds: ["e"], sourceUrl: "https://shop.novalis.example/", sourceClass: "SELLER", verification: "SELLER_STATED", restriction: null, collectedAt: "2026-01-01T00:00:00.000Z", eligibleForBatch: false, notes: [] },
        { field: "ingredients", currentValue: "Mineral blend.", suggestedValue: "Mineral blend.", status: "ACCEPTED", evidenceIds: ["e"], sourceUrl: "https://shop.novalis.example/", sourceClass: "SELLER", verification: "SELLER_STATED", restriction: null, collectedAt: "2026-01-01T00:00:00.000Z", eligibleForBatch: false, notes: [] },
        { field: "howItWorks", currentValue: "One capsule daily.", suggestedValue: "One capsule daily.", status: "ACCEPTED", evidenceIds: ["e"], sourceUrl: "https://shop.novalis.example/", sourceClass: "SELLER", verification: "SELLER_STATED", restriction: null, collectedAt: "2026-01-01T00:00:00.000Z", eligibleForBatch: false, notes: [] },
        { field: "guarantee", currentValue: "30-day returns.", suggestedValue: "30-day returns.", status: "ACCEPTED", evidenceIds: ["e"], sourceUrl: "https://shop.novalis.example/", sourceClass: "SELLER", verification: "SELLER_STATED", restriction: null, collectedAt: "2026-01-01T00:00:00.000Z", eligibleForBatch: false, notes: [] },
      ],
    } as never,
    media: { heroStatus: "HERO_IMAGE_MISSING", approved: [], approvedCount: 0, eligibleCount: 0, usedCount: 0, excluded: [] } as never,
  });
  const editorial = applyEditorialReconstruction(noImage!, plan);
  assert(contentFingerprintOf(editorial) === contentFingerprintOf(withHero), "11. fingerprint de conteudo preserva os fatos");
  assert(presentationFingerprintOf(editorial) !== presentationFingerprintOf(withHero), "11. fingerprint de apresentacao muda com o hero");

  const dir = mkdtempSync(path.join(os.tmpdir(), "54aj-"));
  mkdirSync(dir, { recursive: true });
  const input = sampleInput(dir, isolated.id, "gen-aj");
  assert(screenshotAssociationError({ generationId: "gen-aj", desktop: input.screenshots.desktop, mobile: input.screenshots.mobile }) === null, "12. binding valido");
  assert(validateScreenshotBinding({ generationId: "other", desktop: input.screenshots.desktop, mobile: input.screenshots.mobile }).ok === false, "12. binding rejeita outra geracao");

  const evaluator = createMultimodalPresellEvaluator({
    env: { AIA_ALLOW_PAID_AI: "1", OPENAI_API_KEY: "sk-test", AIA_PAID_AI_PROVIDER: "openai" },
    client: mockOpenAiVisionClient(mockPayloadFromScores(70)),
    skipCache: true,
  });
  const assessment = await evaluator.evaluate(input);
  assert(assessment.overallScore === weightedQualityScore(assessment.dimensionScores.map((row) => ({ dimension: row.dimension, score: row.score }))), "13. avaliacao OpenAI host-side");
  const dup = normalizeModelPayload(JSON.stringify({
    dimensionScores: [
      { dimension: "DESIGN_HIERARCHY", score: 60, rationale: "a", evidence: [] },
      { dimension: "COPY_CLARITY", score: 70, rationale: "a", evidence: [] },
      { dimension: "DEPTH_ORGANIZATION", score: 70, rationale: "a", evidence: [] },
      { dimension: "IMAGES_COMPOSITION", score: 40, rationale: "first", evidence: [] },
      { dimension: "IMAGES_COMPOSITION", score: 10, rationale: "dup", evidence: [] },
      { dimension: "MOBILE_EXPERIENCE", score: 80, rationale: "a", evidence: [] },
      { dimension: "TRANSPARENCY_LEGIBILITY", score: 80, rationale: "a", evidence: [] },
    ],
    criticalFailures: [],
    findings: [],
    recommendedActions: [],
  }));
  assert(dup.dimensionScores.filter((row) => row.dimension === "IMAGES_COMPOSITION").length === 1, "13. payload duplicado e normalizado no host");

  const empty = emptyBudgetLedger("54AJ");
  assert(EXECUTION_54AJ_BUDGET.maxUsd === 1 && EXECUTION_54AJ_BUDGET.maxCorrectionRounds === 2, "14. teto 54AJ de US$ 1");
  assert(budgetAllowsCall({ ...empty, maxUsd: 1, spentUsd: 0.9 }, EXECUTION_54AJ_BUDGET.reserveUsdPerEvaluation).allowed === false, "14. limite de orcamento");

  const before237 = campaignIntegritySnapshot(237);
  applyDeclaredPresellMedia(editorial, placement);
  const after237 = campaignIntegritySnapshot(237);
  assert(JSON.stringify(before237.acceptedFacts) === JSON.stringify(after237.acceptedFacts), "15. fatos aceitos preservados");
  assert(JSON.stringify(before237.approvedAssets) === JSON.stringify(after237.approvedAssets), "15. historico de aprovacao de assets preservado");
  assert(assessment.publicationReadiness === "BLOCKED", "16. publicacao bloqueada");
  assert(assessment.commercialAuthorization === "BLOCKED", "17. CTA comercial bloqueado");
  assert(paidAiAuthorization().allowed === false, "paid AI bloqueada fora do gate");
  const restored = await runWithTemporaryPaidAi({ scope: "54AJ", provider: "openai", maxUsd: 1 }, async () => paidAiAuthorization().allowed);
  assert(restored === true && paidAiAuthorization().allowed === false, "autorizacao temporaria 54AJ nao grava env");
  assert(QUALITY_PROMPT_VERSION === "4" && QUALITY_TARGET === 85 && QUALITY_DIMENSION_WEIGHTS.IMAGES_COMPOSITION === 0.15, "rubrica v4 intacta");

  console.log(`PASS test-presell-quality-54aj.ts (${passed} OK)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
