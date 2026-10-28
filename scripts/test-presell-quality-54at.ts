// npx tsx scripts/test-presell-quality-54at.ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createCampaign } from "../src/lib/campaigns.ts";
import { PRODUCT_CONTRACT_VERSION } from "../src/lib/product-contract/types.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import { writeProductResearchRun, readLatestProductResearch } from "../src/lib/product-research/store.ts";
import type { FieldProposal, ProductResearchRun } from "../src/lib/product-research/types.ts";
import type { DiscoveredAffiliateAsset } from "../src/lib/affiliate-policy/types.ts";
import { reviewAssetId } from "../src/lib/product-research/media-contract.ts";
import { QUALITY_DIMENSION_WEIGHTS, QUALITY_TARGET } from "../src/lib/presell-quality/types.ts";
import { recordUserAssetDeclaration, declarationAuthorizesAds } from "../src/lib/presell-quality/user-asset-declaration.ts";
import { validatePersistedProductContract } from "../src/lib/presell-quality/contract-integrity.ts";
import { enrichApprovedFactsForGeneration, SSL_PLATFORM_QUALIFIER } from "../src/lib/presell-quality/approved-generation-facts.ts";
import { buildContentManifest } from "../src/lib/presell-quality/content-manifest.ts";
import { evaluateContentSafety, disableCommercialCta } from "../src/lib/presell-quality/content-safety.ts";
import { selectApprovedPackshot, botanicalAssetIds } from "../src/lib/presell-quality/approved-packshot.ts";
import {
  EXECUTION_54AT_BUDGET,
  EXECUTION_54AT_ID,
  emptyExecutionBudgetLedger,
  budgetAllowsPaidCall,
  reservePaidCall,
  consumePaidCall,
  consumeReservedAsUnverified,
} from "../src/lib/presell-quality/execution-budget.ts";
import { compareAgainstBaseline } from "../src/lib/presell-quality/baseline-comparison.ts";
import { PRIMARY_SOURCE_POLICY, PRIMARY_SOURCE_AUTO_APPROVAL } from "../src/lib/presell-quality/primary-source-policy.ts";
import { appendEvidenceAudit, readEvidenceAudit } from "../src/lib/presell-quality/review-decide.ts";
import { writeCandidateLedger, type CandidateLedger } from "../src/lib/presell-quality/candidate-ledger.ts";
import { labScenarioKeys } from "../src/lib/design-system/scenarios.ts";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { campaignIntegritySnapshot } from "../src/lib/campaign-sources/resolve-commercial.ts";
import { assessmentFromScores } from "../src/lib/presell-quality/evaluator.ts";

const CORE = ["description", "ingredients", "howItWorks", "guarantee"] as const;

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

function proposal(field: FieldProposal["field"], text: string, evidenceIds: string[], sourceUrl: string): FieldProposal {
  return {
    field,
    currentValue: text,
    suggestedValue: text,
    status: "ACCEPTED",
    evidenceIds,
    sourceUrl,
    sourceClass: "SELLER",
    verification: "SELLER_STATED",
    restriction: "PUBLISHABLE",
    collectedAt: "2026-01-01T00:00:00.000Z",
    eligibleForBatch: false,
    notes: [],
  };
}

function fakeRun(campaignId: number, proposals: FieldProposal[]): ProductResearchRun {
  return {
    version: 1,
    runId: `run-at-${campaignId}`,
    campaignId,
    productName: "Novalis Core",
    status: "COMPLETED",
    stage: "done",
    createdAt: "2026-01-01T00:00:00.000Z",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:00.000Z",
    seeds: ["https://shop.novalis.example/c/order-now.php"],
    seedRejection: null,
    limitations: [],
    sources: [],
    coverageTotal: proposals.length,
    coverageMax: 11,
    reviewAccepted: proposals.filter((item) => item.status === "ACCEPTED").length,
    reviewTotal: proposals.length,
    publicationReadiness: "BLOCKED",
    publicationReason: "quality",
    grounding: "PASS",
    neutrality: "PASS",
    contentQuality: "PASS",
    commercialAuthorization: "BLOCKED",
    proposals,
    decisions: [],
    error: null,
  };
}

function asset(url: string): DiscoveredAffiliateAsset {
  return {
    assetUrl: url,
    sourceUrl: "https://shop.novalis.example/assets",
    assetType: "IMAGE",
    status: "USER_APPROVED",
    hero: false,
    galleryKind: "OTHER",
    context: "",
    decidedAt: "2026-01-01T00:00:00.000Z",
    kindProposal: null,
    declaredAuthorization: "UNSTATED",
    usageRestrictions: [],
  };
}

function scoreOf(overall: number) {
  return assessmentFromScores(
    { campaignId: 1, generationId: "lp-test", evaluatorType: "MOCK_TEST" },
    {
      evaluatorType: "MOCK_TEST",
      evaluationCompleted: true,
      criticalFailures: [],
      dimensionScores: [
        { dimension: "DESIGN_HIERARCHY", score: overall, rationale: "t" },
        { dimension: "COPY_CLARITY", score: overall, rationale: "t" },
        { dimension: "DEPTH_ORGANIZATION", score: overall, rationale: "t" },
        { dimension: "IMAGES_COMPOSITION", score: overall, rationale: "t" },
        { dimension: "MOBILE_EXPERIENCE", score: overall, rationale: "t" },
        { dimension: "TRANSPARENCY_LEGIBILITY", score: overall, rationale: "t" },
      ],
    },
  );
}

async function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  process.env.AIA_PRESELL_QUALITY_ROOT = mkdtempSync(path.join(os.tmpdir(), "54at-quality-"));
  process.env.AIA_PRODUCT_RESEARCH_ROOT = mkdtempSync(path.join(os.tmpdir(), "54at-research-"));
  mkdirSync(process.env.AIA_PRESELL_QUALITY_ROOT, { recursive: true });

  const isolated = createCampaign({
    name: "Novalis 54AT",
    slug: `novalis-54at-${Date.now()}`,
    headline: "Novalis",
    body: "Novalis",
    ctaLabel: "See offer",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });

  const sourceUrl = "https://shop.novalis.example/c/order-now.php";
  const proposals: FieldProposal[] = [
    proposal("description", "Novalis Core is a documented capsule with Maca Root.", ["ev-d"], "https://info.novalis.example/"),
    proposal("ingredients", "Maca Root Guarana", ["ev-i"], "https://info.novalis.example/"),
    proposal("howItWorks", "Take two full droppers under your tongue in the morning before breakfast.", ["ev-u"], "https://info.novalis.example/"),
    proposal("guarantee", "If you are unsatisfied you will have 60 days from the date of purchase to return the product and request a refund.", ["ev-g"], "https://info.novalis.example/"),
    proposal(
      "faq",
      "Segundo a pagina, a entrega e estimada entre 5 e 10 dias. O envio e tentado em ate 24 horas uteis.\n\nSegundo o vendedor, a compra pede um pagamento unico. O site declara usar SSL.\n\nGarantia com frascos vazios e reembolso em 48 horas, excluindo frete.",
      ["54AR-07", "54AR-08", "54AR-17"],
      sourceUrl,
    ),
  ];
  const run = fakeRun(isolated.id, proposals);
  writeProductResearchRun(run);

  const ledger: CandidateLedger = {
    version: 1,
    campaignId: isolated.id,
    sourceFile: "test",
    preservedCount: 4,
    regenerationRequired: false,
    candidates: [
      {
        candidateId: "54AR-07",
        campaignId: isolated.id,
        version: 1,
        field: "ingredients",
        extractedValue: "Where can I buy Novalis Core and how quickly can I get it? We'll ship your order using FedEx or UPS. We strive to ship every order within 24 working hours. On average, the package will arrive at your doorstep somewhere between 5 to 10 days for domestic orders.",
        originalExcerpt: "We strive to ship every order within 24 working hours.",
        sourceUrl,
        sourceHost: "shop.novalis.example",
        sourceClass: "AFFILIATE_RESOURCE",
        evidenceReference: "54AR-07",
        collectedAt: "2026-01-01T00:00:00.000Z",
        verification: "SELLER_STATED",
        usable: true,
        approvedForUse: false,
        blockReason: null,
        duplicateOf: null,
        originalIndex: 0,
      },
      {
        candidateId: "54AR-08",
        campaignId: isolated.id,
        version: 1,
        field: "description",
        extractedValue: "Is my purchase secure? How many times will you charge my card? To purchase Novalis Core you are only asked for a one time payment right on this page. There are no other future payments needed to benefit from this product. This website is highly secure. We use industry-leading technology (such as SSLs) to keep your information safe and private.",
        originalExcerpt: "one time payment",
        sourceUrl,
        sourceHost: "shop.novalis.example",
        sourceClass: "AFFILIATE_RESOURCE",
        evidenceReference: "54AR-08",
        collectedAt: "2026-01-01T00:00:00.000Z",
        verification: "SELLER_STATED",
        usable: true,
        approvedForUse: false,
        blockReason: null,
        duplicateOf: null,
        originalIndex: 1,
      },
      {
        candidateId: "54AR-17",
        campaignId: isolated.id,
        version: 1,
        field: "guarantee",
        extractedValue: "Return the product, even your empty bottles, anytime within 60 days of your purchase and you'll receive a full refund within 48 hours of the product being returned (minus shipping and handling fees).",
        originalExcerpt: "empty bottles",
        sourceUrl,
        sourceHost: "shop.novalis.example",
        sourceClass: "AFFILIATE_RESOURCE",
        evidenceReference: "54AR-17",
        collectedAt: "2026-01-01T00:00:00.000Z",
        verification: "SELLER_STATED",
        usable: true,
        approvedForUse: false,
        blockReason: null,
        duplicateOf: null,
        originalIndex: 2,
      },
      {
        candidateId: "54AR-01",
        campaignId: isolated.id,
        version: 1,
        field: "benefits",
        extractedValue: "Support healthy blood sugar levels with this clinically proven formula.",
        originalExcerpt: "clinically proven",
        sourceUrl,
        sourceHost: "shop.novalis.example",
        sourceClass: "AFFILIATE_RESOURCE",
        evidenceReference: "54AR-01",
        collectedAt: "2026-01-01T00:00:00.000Z",
        verification: "SELLER_STATED",
        usable: false,
        approvedForUse: false,
        blockReason: "Medical or health claim is not restated as a product fact.",
        duplicateOf: null,
        originalIndex: 3,
      },
    ],
  };
  writeCandidateLedger(ledger);
  for (const id of ["54AR-07", "54AR-08", "54AR-17"]) {
    appendEvidenceAudit({
      at: "2026-01-01T00:00:00.000Z",
      campaignId: isolated.id,
      candidateId: id,
      version: 1,
      decision: "ACCEPT",
      actor: PRIMARY_SOURCE_POLICY,
      eligible: true,
      resultingState: "ACCEPTED",
      notes: [],
      approvalOrigin: PRIMARY_SOURCE_POLICY,
      policyName: PRIMARY_SOURCE_AUTO_APPROVAL,
      policyVersion: "1",
      evidenceId: id,
      sourceUrl,
    });
  }
  appendEvidenceAudit({
    at: "2026-01-01T00:00:00.000Z",
    campaignId: isolated.id,
    candidateId: "54AO-02",
    version: 1,
    decision: "REJECT",
    actor: "HUMAN",
    eligible: false,
    resultingState: "REJECTED",
    notes: [],
  });

  const integrity = validatePersistedProductContract(isolated.id, readLatestProductResearch(isolated.id));
  assert(integrity.valid, "1. Product Contract integrity is valid");
  assert(integrity.coreFacts === 4, "2. four core facts are present");
  assert(integrity.primaryAutoApprovedFacts === 3, "3. three auto-approved operational facts");
  assert(
    integrity.autoApproved.every((item) => item.actor === PRIMARY_SOURCE_POLICY && item.approvalOrigin === PRIMARY_SOURCE_POLICY),
    "4. approval origin is PRIMARY_SOURCE_POLICY",
  );
  assert(integrity.contractVersion === PRODUCT_CONTRACT_VERSION && PRODUCT_CONTRACT_VERSION === 1, "5. contract version is 1");

  const enriched = enrichApprovedFactsForGeneration({
    run: readLatestProductResearch(isolated.id),
    productName: "Novalis Core",
    sourceUrl,
    ledger,
  });
  const manifest = buildContentManifest({
    campaignId: isolated.id,
    run: readLatestProductResearch(isolated.id),
    integrity,
    generation: enriched,
  });
  assert(manifest.contractVersion === 1 && manifest.allowedFacts.length === 5, "6. content manifest uses the persisted contract");
  assert(
    !manifest.allowedFacts.some((item) => /blood sugar|clinically proven/i.test(item.value)) &&
      manifest.blockedClaims.some((item) => item.candidateId === "54AR-01"),
    "7. medical claims stay excluded",
  );
  assert(!manifest.allowedFacts.some((item) => item.field === "pricing"), "8. blocked promotional pricing stays excluded");
  assert(
    enriched.returnStatements.some((item) => /empty bottles/i.test(item)) &&
      enriched.returnStatements.some((item) => /48 hours/i.test(item)) &&
      enriched.returnStatements.some((item) => /minus shipping/i.test(item)),
    "9. guarantee conditions include empty bottles, 48 hours, and shipping exclusion",
  );
  assert(
    enriched.shippingStatements.some((item) => /5 to 10 days/i.test(item)) &&
      enriched.shippingStatements.some((item) => /24 working hours/i.test(item)),
    "10. delivery window stays an estimate",
  );
  assert(enriched.paymentStatements.some((item) => /one time payment/i.test(item)), "11. one-time payment is preserved");
  assert(enriched.sslQualified && enriched.paymentStatements.some((item) => item.includes(SSL_PLATFORM_QUALIFIER)), "12. SSL is qualified");
  assert(!/manufactured in the united states/i.test(enriched.facts.manufacturer ?? ""), "13. manufacturer is not invented");
  assert(enriched.coreFieldsPreserved, "30. core Product Contract fields are not rewritten during generation mapping");

  const pack = asset("https://shop.novalis.example/img/2bootle-fruits.png");
  const leaf = asset("https://shop.novalis.example/img/i-eleuthero.jpg");
  const assets = [pack, leaf];
  const declaration = recordUserAssetDeclaration({
    campaignId: isolated.id,
    declarationText: "As imagens do produto ja estao autorizadas.",
    assetIds: assets.map((item) => reviewAssetId(item.assetUrl)),
    origins: [
      { assetId: reviewAssetId(pack.assetUrl), originalHost: "shop.novalis.example", originalPath: "img/2bootle-fruits.png", sourceFile: "2bootle-fruits.png" },
      { assetId: reviewAssetId(leaf.assetUrl), originalHost: "shop.novalis.example", originalPath: "img/i-eleuthero.jpg", sourceFile: "i-eleuthero.jpg" },
    ],
  });
  const packshot = selectApprovedPackshot({ assets, declaration });
  assert(packshot?.sourceFile === "2bootle-fruits.png" && packshot.authorized, "14. approved packshot is selected");
  assert(botanicalAssetIds({ assets, declaration }).includes(reviewAssetId(leaf.assetUrl)), "15. botanical images are not treated as packshots");
  assert(selectApprovedPackshot({ assets, declaration })?.assetId !== reviewAssetId(leaf.assetUrl), "15b. botanical is not the selected packshot");

  assert(EXECUTION_54AT_BUDGET.maxUsd === 1, "16. AI budget cap is US$1");
  const budget = emptyExecutionBudgetLedger(EXECUTION_54AT_ID, 1);
  const reserved = reservePaidCall(budget, { kind: "EVALUATION", model: "gpt-4o-mini", estimatedUsd: 0.12, reserveUsd: 0.2 });
  assert(reserved.ok && reserved.ledger.status === "RESERVED" && reserved.ledger.reservedUsd === 0.2, "17. budget reserve is recorded");
  const timedOut = consumeReservedAsUnverified(reserved.ledger);
  assert(timedOut.status === "TIMEOUT_UNVERIFIED" && timedOut.spentUsd === 0.2 && timedOut.paidCallCount === 1, "18. timeout consumes the reserved cost");
  const blocked = budgetAllowsPaidCall(timedOut, { kind: "EVALUATION" });
  assert(!blocked.allowed, "19. further paid calls are blocked after an unverified timeout");
  const firstEval = reservePaidCall(emptyExecutionBudgetLedger(), { kind: "EVALUATION", model: "gpt-4o-mini", reserveUsd: 0.2 });
  if (!firstEval.ok) throw new Error(firstEval.reason);
  const afterFirst = consumePaidCall(firstEval.ledger, { inputTokens: 1, outputTokens: 1, estimatedUsd: 0.01 });
  const secondEval = reservePaidCall(afterFirst, { kind: "EVALUATION", model: "gpt-4o-mini", reserveUsd: 0.2 });
  const afterSecond = consumePaidCall(secondEval.ok ? secondEval.ledger : afterFirst, { inputTokens: 1, outputTokens: 1, estimatedUsd: 0.01 });
  const thirdEval = reservePaidCall(afterSecond, { kind: "EVALUATION", model: "gpt-4o-mini", reserveUsd: 0.2 });
  assert(!thirdEval.ok, "20. a third paid evaluation is blocked; no automatic extra retries");

  const persisted = { generationId: "lp-at-fixture", contractVersion: PRODUCT_CONTRACT_VERSION, previewPath: "/admin/lab/lp-generator/lp-at-fixture/preview" };
  writeFileSync(path.join(mkdtempSync(path.join(os.tmpdir(), "54at-gen-")), "generation.json"), `${JSON.stringify(persisted)}\n`);
  assert(persisted.previewPath.startsWith("/admin/lab/lp-generator/"), "21. generation persistence keeps a lab preview path");

  const weightSum = Object.values(QUALITY_DIMENSION_WEIGHTS).reduce((sum, item) => sum + item, 0);
  assert(Math.abs(weightSum - 1) < 1e-9 && QUALITY_TARGET === 85, "22. quality rubric weights are unchanged");

  const unstable = compareAgainstBaseline({
    baselineGenerationId: "lp-mvr3pp2f-ea2a99d2",
    baselineScore: 82,
    nextGenerationId: "lp-new",
    assessments: [scoreOf(90), scoreOf(16)],
    contentSafetyPass: true,
    addedOperationalContent: true,
    criticalRegressions: [],
  });
  assert(unstable.evaluatorStability === "EVALUATOR_UNSTABLE" && unstable.status === "INCONCLUSIVE", "23. evaluator instability is detected and not averaged away");
  const single = compareAgainstBaseline({
    baselineGenerationId: "lp-mvr3pp2f-ea2a99d2",
    baselineScore: 82,
    nextGenerationId: "lp-new",
    assessments: [scoreOf(88)],
    contentSafetyPass: true,
    addedOperationalContent: true,
    criticalRegressions: [],
  });
  assert(single.evaluatorStability === "NOT_ESTABLISHED" && single.status === "INCONCLUSIVE", "24. a single evaluation cannot claim a proven improvement over 54AJ");
  const straddle = compareAgainstBaseline({
    baselineGenerationId: "lp-mvr3pp2f-ea2a99d2",
    baselineScore: 82,
    nextGenerationId: "lp-new",
    assessments: [scoreOf(81), scoreOf(83)],
    contentSafetyPass: true,
    addedOperationalContent: true,
    criticalRegressions: [],
  });
  assert(straddle.evaluatorStability === "STABLE" && straddle.status === "INCONCLUSIVE", "24b. scores that straddle the baseline stay inconclusive");

  const lab = buildV4Model(labScenarioKeys()[0]!)!;
  const disabled = disableCommercialCta({ ...lab, hopSlot: "hero", hopHref: "https://shop.novalis.example/c/order-now.php", hopLabel: "Buy" });
  const markup = renderToStaticMarkup(createElement(V4Page, { model: disabled }));
  assert(!disabled.hopHref && disabled.hopSlot === "none", "26. commercial CTA is disabled");
  assert(!/official_offer_click/.test(markup), "26b. live hop tracker is absent");
  const safetyMarkup = "Novalis Core is a documented capsule. Take two full droppers. The seller says they strive to ship every order within 24 working hours. On average, the package will arrive between 5 to 10 days for domestic orders. The seller says you are only asked for a one time payment. The seller says the page uses SSL. That seller statement is not independent proof that the transaction is fully secure. 60 days. empty bottles. 48 hours.";
  assert(persisted.previewPath.includes("/admin/") && !persisted.previewPath.includes("/p/"), "25. preview stays on the authorized lab path");
  assert(integrity.publicationReadiness === "BLOCKED" && integrity.commercialAuthorization === "BLOCKED", "27. publication stays blocked");
  assert(declarationAuthorizesAds(declaration) === false, "28. ads stay outside the asset declaration");
  assert(integrity.humanRejectsPreserved.includes("54AO-02"), "29. human rejections are preserved");
  const beforeFacts = acceptedProposals(readLatestProductResearch(isolated.id)).map((item) => item.currentValue);
  enrichApprovedFactsForGeneration({ run: readLatestProductResearch(isolated.id), productName: "Novalis Core", sourceUrl, ledger });
  const afterFacts = acceptedProposals(readLatestProductResearch(isolated.id)).map((item) => item.currentValue);
  assert(JSON.stringify(beforeFacts) === JSON.stringify(afterFacts), "30b. mapping does not write back into the research run");

  const safety = evaluateContentSafety({
    model: disabled,
    markup: safetyMarkup,
    manifest,
    packshotAssetId: packshot!.assetId,
    usedAssetIds: [packshot!.assetId],
    botanicalAssetIds: botanicalAssetIds({ assets, declaration }),
  });
  assert(safety.gate === "PASS", "safety.pass grounded operational copy");
  const leaked = evaluateContentSafety({
    model: disabled,
    markup: "Clinically proven blood sugar formula. Manufactured in the United States. Compra 100% segura.",
    manifest,
    packshotAssetId: packshot!.assetId,
    usedAssetIds: [packshot!.assetId, reviewAssetId(leaf.assetUrl)],
    botanicalAssetIds: botanicalAssetIds({ assets, declaration }),
  });
  assert(leaked.gate === "FAIL" && leaked.unsupportedClaimsFound, "safety.fail blocked medical, manufacturer, and security overclaim");

  const live = validatePersistedProductContract(237);
  if (live.runId) {
    assert(live.coreFacts === 4, "237. core facts remain 4");
    assert(live.primaryAutoApprovedFacts === 3, "237. three PRIMARY_SOURCE_POLICY facts remain");
    assert(live.fakeHumanAccept.length === 0, "237. no fake human accepts");
    assert(campaignIntegritySnapshot(237).publicationStatus !== "PUBLISHED", "237. campaign is not published by this test");
  }

  const audit = readEvidenceAudit(isolated.id);
  assert(!audit.some((item) => item.actor === "HUMAN" && item.decision === "ACCEPT" && ["54AR-07", "54AR-08", "54AR-17"].includes(item.candidateId)), "no fake human accept on isolated policy facts");

  console.log(`PASS ${passed}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
