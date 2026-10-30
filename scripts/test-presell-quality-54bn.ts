import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { labScenarioKeys } from "../src/lib/design-system/scenarios.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { disableCommercialCta, evaluateContentSafety } from "../src/lib/presell-quality/content-safety.ts";
import { validatePersistedProductContract } from "../src/lib/presell-quality/contract-integrity.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { readGeneration, readGenerationModel } from "../src/lib/lp-generator/store.ts";
import { applySandboxToModel } from "../src/lib/sandbox/cta.ts";
import { applyQualityPatch, readQualityPatch } from "../src/lib/presell-quality/patch.ts";
import { DESIGN_CHECKPOINT_FILES } from "../src/lib/presell-quality/design-checkpoint.ts";
import { loadPremiumPresellDesignStandard } from "../src/lib/presell-quality/premium-standard.ts";
import { buildContentManifest } from "../src/lib/presell-quality/content-manifest.ts";
import { enrichApprovedFactsForGeneration } from "../src/lib/presell-quality/approved-generation-facts.ts";
import { botanicalAssetIds, selectApprovedPackshot } from "../src/lib/presell-quality/approved-packshot.ts";
import { readUserAssetDeclaration } from "../src/lib/presell-quality/user-asset-declaration.ts";
import {
  QUALITY_PROMPT_VERSION,
  QUALITY_SCORE_TARGET,
  VISUAL_SCORE_TARGET,
  EXECUTION_54BN_BUDGET,
  EXECUTION_54BN_MAX_AI_COST_USD,
  PREMIUM_VISUAL_EVALUATION_V2,
  VISITOR_VISUAL_CAPTURE,
  FORBIDDEN_REFERENCE_CHROME,
  PRESELL_STANDARD_ID,
  mapPresellStandardV1,
  runTemplateQualityPreflight,
  conservativeMinPair,
  selectBestCandidate,
  evaluationIdentityOf,
  resolveGlobalPresellQualityGate,
  canEnterHumanReviewQueue,
  requestPresellHumanReview,
  methodologyThresholdsFrozen,
  BEST_KNOWN_CANDIDATE_ID,
  EXPERIMENTAL_CANDIDATE_ID,
  CONTROLLED_IMPROVEMENT_EXECUTION_ID,
  PRODUCER_CONTENT_EXECUTION_ID,
  STRUCTURAL_COMPOSITION_EXECUTION_ID,
  FROZEN_IMPROVEMENT_EXECUTION_ID,
  PREMIUM_PRODUCER_CONTENT_COMPOSITION_ID,
  PREMIUM_STRUCTURAL_COMPOSITION_ID,
  experimentalExecutionIdOf,
  usesPremiumStructuralComposition,
  usesPremiumProducerContent,
  usesPremiumProducerContentV2,
  parseRendererCandidateId,
  resolveRendererCandidate,
  readRendererCandidateSelection,
  restoreProtectedPath,
  classifyCommercialReuseItem,
  buildCommercialEvidenceItem,
  approvedCommercialExcerpts,
  countsByStatus,
  hashVisionRequestPayload,
  hashVisionResponsePayload,
  redactVisionRequestForHash,
} from "../src/lib/presell-quality/index.ts";
import {
  EXECUTION_54BN_BUDGET as BN_LEDGER,
  EXECUTION_54BN_ID,
  emptyExecutionBudgetLedger,
  budgetAllowsPaidCall,
} from "../src/lib/presell-quality/execution-budget.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

const ROOT = process.cwd();
const evidence = path.join(ROOT, "data/evidence/execution-54bn-producer-content");
const biEvidence = path.join(ROOT, "data/evidence/execution-54bi-editorial-deduplication");
const EXPECTED_REFERENCE = "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938";
const BM_COMMIT = "0f1f76269638936361f79df248462617c9b2291d";
const BM_MESSAGE = "docs(presell): preserve evaluator reliability findings";
const BI_COMMIT = "5f8d109b0b9ef358958f91431e3bb9dc78728543";
const PRODUCER_URL =
  "https://sugardefender24.com/c/order-now.php?hop=smartbuyx&hopId=acaf9aba-ea12-4d5e-91ec-4c4c0a3d74ec";
const SHOTS = ["desktop-first-fold.png", "desktop-full.png", "tablet-first-fold.png", "tablet-full.png", "mobile-first-fold.png", "mobile-full.png"];

function readJson(dir: string, file: string): Record<string, unknown> | null {
  const absolute = path.join(dir, file);
  if (!existsSync(absolute)) return null;
  return JSON.parse(readFileSync(absolute, "utf8")) as Record<string, unknown>;
}

const css = readFileSync(path.join(ROOT, "src/app/premium-design-engine.css"), "utf8");
const lab = disableCommercialCta(buildV4Model("s1")!);
const bn = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: PRODUCER_CONTENT_EXECUTION_ID }));
const bl = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: STRUCTURAL_COMPOSITION_EXECUTION_ID }));
const bi = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: FROZEN_IMPROVEMENT_EXECUTION_ID }));
const v1 = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: EXPERIMENTAL_CANDIDATE_ID }));

assert(execSync(`git cat-file -t ${BM_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim() === "commit", "1. 54BM commit object remains recoverable");
assert(execSync(`git log -1 --format=%s ${BM_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim() === BM_MESSAGE, "2. 54BM commit message is preserved");

const checkpoint = JSON.parse(
  readFileSync(path.join(ROOT, "data/presell-quality/237/design-checkpoints/54bi-proven-baseline.json"), "utf8"),
) as { id?: string; sourceCommit?: string; createdAt?: string };
assert(
  checkpoint.id === "54bi-proven-baseline" && checkpoint.sourceCommit === BI_COMMIT && checkpoint.createdAt === "2026-10-30T15:07:59.506Z",
  "3. 54BI proven baseline checkpoint is not overwritten",
);

assert(
  PRODUCER_CONTENT_EXECUTION_ID === "54BN" &&
    CONTROLLED_IMPROVEMENT_EXECUTION_ID === "54BQ" &&
    STRUCTURAL_COMPOSITION_EXECUTION_ID === "54BL" &&
    FROZEN_IMPROVEMENT_EXECUTION_ID === "54BI" &&
    PREMIUM_PRODUCER_CONTENT_COMPOSITION_ID === "PREMIUM_PRODUCER_CONTENT_V1" &&
    PREMIUM_STRUCTURAL_COMPOSITION_ID === "PREMIUM_STRUCTURAL_V2" &&
    parseRendererCandidateId("54BN") === EXPERIMENTAL_CANDIDATE_ID &&
    parseRendererCandidateId("PREMIUM_PRODUCER_CONTENT_V1") === EXPERIMENTAL_CANDIDATE_ID &&
    resolveRendererCandidate({ requested: "54BN" }).executionId === "54BN" &&
    resolveRendererCandidate({ requested: "54BL" }).executionId === "54BL" &&
    resolveRendererCandidate({ requested: "54BI" }).executionId === "54BI" &&
    experimentalExecutionIdOf("54BN") === "54BN" &&
    usesPremiumStructuralComposition("54BN") &&
    usesPremiumStructuralComposition("54BL") &&
    usesPremiumProducerContent("54BN") &&
    !usesPremiumProducerContentV2("54BN") &&
    !usesPremiumProducerContent("54BL") &&
    !usesPremiumProducerContent("54BI"),
  "4. 54BN has a distinct experimental identity and PREMIUM_PRODUCER_CONTENT_V1 composition",
);

assert(
  /data-presell-execution="54BN"/.test(bn) &&
    /data-presell-composition="PREMIUM_PRODUCER_CONTENT_V1"/.test(bn) &&
    /data-structural-hero="v2"/.test(bn) &&
    /data-presell-execution="54BL"/.test(bl) &&
    /data-presell-composition="PREMIUM_STRUCTURAL_V2"/.test(bl) &&
    /data-presell-execution="54BI"/.test(bi) &&
    !/data-structural-hero="v2"/.test(bi) &&
    /data-presell-execution="54BQ"/.test(v1),
  "5. renderer switching keeps 54BN, 54BL, and 54BI distinct",
);

assert(
  /\[data-presell-execution="54BN"\]/.test(css) &&
    /\[data-presell-execution="54BL"\]/.test(css) &&
    /\[data-presell-execution="54BJ"\]/.test(css) &&
    /@media \(min-width: 960px\)[\s\S]*\[data-presell-execution="54BN"\][\s\S]*grid-template-areas:[\s\S]*copy product facts/.test(css) &&
    /@media \(max-width: 959px\)[\s\S]*\[data-presell-execution="54BN"\][\s\S]*grid-template-areas:[\s\S]*product[\s\S]*copy[\s\S]*actions[\s\S]*facts/.test(css) &&
    !/scale\(1\.14\)/.test(css),
  "6. 54BN CSS is isolated, reuses the three-area hero, and does not add unscoped scale",
);

const medical = classifyCommercialReuseItem({ field: "medical-claim", value: "#1 Rated Blood Sugar Formula" });
const testimonial = classifyCommercialReuseItem({ field: "testimonial", value: "Verified Purchase from Sean B.", namesMayBeChanged: true });
const rating = classifyCommercialReuseItem({ field: "rating", value: "4.98/5 based on 2000+ reviews" });
const price = classifyCommercialReuseItem({ field: "price", value: "$79" });
const ingredient = classifyCommercialReuseItem({ field: "ingredient-name", value: "Eleuthero" });
assert(
  medical.reuse_status === "REJECTED" &&
    testimonial.reuse_status === "REJECTED" &&
    rating.reuse_status === "PENDING_REVIEW" &&
    price.reuse_status === "APPROVED" &&
    ingredient.reuse_status === "PENDING_REVIEW",
  "7. commercial reuse classifies medical/testimonials rejected, ratings pending, prices approved",
);

const sampleItem = buildCommercialEvidenceItem({
  field: "price",
  value: "$79",
  source_url: PRODUCER_URL,
  source_location: "order-now",
  captured_at: "2026-10-30T00:00:00.000Z",
  evidence_path: "producer-desktop.png",
});
assert(sampleItem.reuse_status === "APPROVED" && sampleItem.source_url === PRODUCER_URL, "8. evidence items keep source URL and capture fields");

const redacted = redactVisionRequestForHash({
  model: "gpt-4o-mini",
  input: [{ image_url: `data:image/png;base64,${"a".repeat(120)}` }],
}) as { input: Array<{ image_url: string }> };
assert(
  redacted.input[0].image_url.startsWith("omitted:") &&
    hashVisionRequestPayload({ model: "gpt-4o-mini" }).length === 64 &&
    hashVisionResponsePayload('{"score":70}').length === 64,
  "9. evaluator observability hashes requests with images omitted",
);

assert(
  EXECUTION_54BN_BUDGET.maxUsd === 0.3 &&
    EXECUTION_54BN_MAX_AI_COST_USD === 0.3 &&
    BN_LEDGER.maxUsd === 0.3 &&
    EXECUTION_54BN_ID === "execution-54bn" &&
    budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bn", 0.3), { kind: "EVALUATION", reserveUsd: 0.06 }, BN_LEDGER).allowed &&
    !budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bn", 0.3), { kind: "EVALUATION", reserveUsd: 0.31 }, BN_LEDGER).allowed,
  "10. exclusive 54BN budget is US$0.30",
);

const integrity = validatePersistedProductContract(237, snapshotProductResearch(237).latest);
assert(integrity.valid, "11. Product Contract remains valid");

assert(QUALITY_PROMPT_VERSION === "4" && PREMIUM_VISUAL_EVALUATION_V2 === "PREMIUM_VISUAL_EVALUATION_V2" && VISITOR_VISUAL_CAPTURE === "VISITOR_VISUAL_CAPTURE", "12. official evaluator versions stay frozen");
assert(VISUAL_SCORE_TARGET === 90 && QUALITY_SCORE_TARGET === 85 && methodologyThresholdsFrozen(), "13. official thresholds stay frozen at 90/90/85");
assert(conservativeMinPair(74, 72) === 72, "14. conservative min-of-pair is unchanged");

const stored = readRendererCandidateSelection(237);
assert(stored.activeExecutionId === "54BI", "15. live store still selects 54BI as the active execution");

const liveBest = JSON.parse(readFileSync(path.join(ROOT, "data/presell-quality/237/best-candidate.json"), "utf8")) as {
  desktopVisualScore?: number;
  mobileVisualScore?: number;
  editorialScore?: number;
};
assert(liveBest.desktopVisualScore === 74 && liveBest.mobileVisualScore === 72 && liveBest.editorialScore === 74, "16. Best Candidate Selector still holds 54BI 74/72/74");

assert(lab.hopSlot === "none" && /data-v4-cta="preview-disabled"/.test(bn) && mapPresellStandardV1(lab).cta.enabled === false, "17. CTA stays blocked");
assert(
  DESIGN_CHECKPOINT_FILES.length === 4 &&
    restoreProtectedPath("src/components/product-showcase/v4/page.tsx") &&
    restoreProtectedPath("src/components/presell/standard-v1-page.tsx") &&
    !restoreProtectedPath("src/app/premium-design-engine.css"),
  "18. rollback cannot delete the template implementation or the switcher",
);

const blocked = resolveGlobalPresellQualityGate({
  campaignId: 237,
  generationId: "lp-mvs7mja3-0d690e7c",
  desktopScreenshotPath: path.join(ROOT, "design-references/premium-presell-reference.png"),
  mobileScreenshotPath: path.join(ROOT, "design-references/premium-presell-reference.png"),
  comparedToOfficialReference: true,
  evaluatorIndependentFromGenerator: true,
  visualScore: 74,
  desktopVisualScore: 74,
  mobileVisualScore: 72,
  editorialScore: 74,
  evaluatorStability: "STABLE",
  contentSafetyPass: true,
  criticalVisualDefects: ["below target"],
});
assert(blocked.status === "QUALITY_BLOCKED", "19. Global Quality Gate stays QUALITY_BLOCKED below 90/90/85");
assert(integrity.publicationReadiness === "BLOCKED" && blocked.publicationUnlocked === false, "20. publication stays blocked");
assert(!canEnterHumanReviewQueue(blocked) && requestPresellHumanReview(blocked).ok === false, "21. ads and human review remain blocked below 90/90/85");

const identity = evaluationIdentityOf({
  generationId: "lp-mvs7mja3-0d690e7c",
  rendererVersion: "v4",
  sourceCommit: BI_COMMIT,
  referenceHash: EXPECTED_REFERENCE,
  screenshotHashes: ["a", "b"],
  captureMode: VISITOR_VISUAL_CAPTURE,
  adminChromePresent: false,
  visualEvalVersion: PREMIUM_VISUAL_EVALUATION_V2,
  promptVersion: "4",
  rubricVersion: "2",
  model: "gpt-4o-mini",
});
const selector = selectBestCandidate({
  current: {
    selector: "PRESELL_BEST_CANDIDATE_SELECTOR",
    campaignId: 237,
    generationId: "lp-mvs7mja3-0d690e7c",
    state: "BEST_KNOWN",
    contentSafetyPass: true,
    evaluationValid: true,
    desktopVisualScore: 74,
    mobileVisualScore: 72,
    editorialScore: 74,
    identity,
    qualityApproved: false,
    humanReviewUnlocked: false,
    notes: [],
  },
  incoming: {
    campaignId: 237,
    generationId: "lp-mvs7mja3-0d690e7c",
    contentSafetyPass: true,
    evaluationValid: true,
    desktopVisualScore: 73,
    mobileVisualScore: 71,
    editorialScore: 73,
    identity,
    notes: [],
  },
});
assert(selector.updated === false, "22. selector rejects a non-proven 54BN-like incoming candidate");

const standard = loadPremiumPresellDesignStandard();
assert(standard.hash === EXPECTED_REFERENCE, "23. official premium reference hash is unchanged");

const snap = snapshotProductResearch(237);
const record = readGeneration("lp-mvs7mja3-0d690e7c");
const storedModel = readGenerationModel("lp-mvs7mja3-0d690e7c");
if (record && storedModel) {
  const patch = readQualityPatch("lp-mvs7mja3-0d690e7c");
  const patched = patch ? applyQualityPatch(storedModel, patch) : storedModel;
  const sandboxed = record.sandbox?.enabled ? applySandboxToModel(patched, { href: record.sandbox.ctaPath }) : patched;
  const model = disableCommercialCta(sandboxed);
  const campaignBn = renderToStaticMarkup(createElement(V4Page, { model, candidate: "54BN", campaignId: 237 }));
  const campaignBi = renderToStaticMarkup(createElement(V4Page, { model, candidate: "54BI", campaignId: 237 }));
  assert(
    /data-presell-execution="54BN"/.test(campaignBn) &&
      /data-seller-package/.test(campaignBn) &&
      /\$79/.test(campaignBn) &&
      /seller-stated packages/i.test(campaignBn),
    "24. 54BN campaign render is tagged and shows approved seller-stated packages",
  );
  assert(/data-presell-execution="54BI"/.test(campaignBi) && !/data-seller-stated-offers/.test(campaignBi), "25. frozen 54BI does not receive producer package cards");
  const preflight = runTemplateQualityPreflight({ model, markup: campaignBn, contractValid: integrity.valid });
  assert(preflight.status === "PREFLIGHT_PASSED" || preflight.status === "PREFLIGHT_FAILED", "26. preflight runs against the 54BN campaign page");
  const declaration = readUserAssetDeclaration(237);
  const packshot = selectApprovedPackshot({ assets: snap.latest?.discoveredAssets, declaration });
  const enriched = enrichApprovedFactsForGeneration({ run: snap.latest, productName: snap.latest?.productName || "Product", sourceUrl: "" });
  const manifest = buildContentManifest({ campaignId: 237, run: snap.latest, integrity, generation: enriched });
  const reuse = readJson(path.join(ROOT, "data/presell-quality/237"), "commercial-reuse.json") as {
    items?: Array<{ reuse_status: string; value: string }>;
  } | null;
  const excerpts = reuse?.items ? approvedCommercialExcerpts(reuse as never) : [];
  const safety = evaluateContentSafety({
    model,
    markup: campaignBn,
    manifest,
    packshotAssetId: packshot?.assetId ?? null,
    usedAssetIds: packshot?.assetId ? [packshot.assetId] : [],
    botanicalAssetIds: botanicalAssetIds({ assets: snap.latest?.discoveredAssets, declaration }),
    approvedCommercialExcerpts: excerpts,
  });
  assert(safety.commercialCtaEnabled === false && safety.publicationReady === false, "27. content safety keeps CTA and publication blocked");
  if (existsSync(path.join(ROOT, "data/presell-quality/237/commercial-reuse.json"))) {
    assert(safety.gate === "PASS", "28. content safety passes on 54BN once approved excerpts are stripped");
  }
}

const multiproduct = labScenarioKeys().every((key) => {
  const html = renderToStaticMarkup(createElement(V4Page, { model: disableCommercialCta(buildV4Model(key)!), candidate: EXPERIMENTAL_CANDIDATE_ID }));
  return !FORBIDDEN_REFERENCE_CHROME.test(html) && !/sugar defender/i.test(html) && !/data-seller-stated-offers/.test(html);
});
assert(multiproduct, "29. lab scenarios stay generic and do not inherit campaign packages");

const collectSource = readFileSync(path.join(ROOT, "src/lib/presell-quality/producer-page-collect.ts"), "utf8");
assert(/collectProducerCommercialPage/.test(collectSource) && /producer-desktop\.png/.test(collectSource) && /producer-mobile\.png/.test(collectSource), "30. producer collect writes desktop and mobile captures");

if (existsSync(evidence)) {
  const required = [
    "execution-summary.md",
    "git-audit.json",
    "producer-url-audit.json",
    "producer-content-inventory.json",
    "commercial-evidence-manifest.json",
    "content-approval-results.json",
    "candidate-identity.json",
    "content-preservation.json",
    "preflight-results.json",
    "content-safety-results.json",
    "evaluator-observability.json",
    "official-v2-results.json",
    "budget-ledger.json",
    "best-candidate-comparison.json",
    "quality-gate-decision.json",
    "regression-results.json",
    "remaining-blockers.json",
  ];
  assert(required.every((file) => existsSync(path.join(evidence, file))), "31. 54BN evidence files exist in a new directory");
  const urlAudit = readJson(evidence, "producer-url-audit.json");
  assert(urlAudit?.requestedUrl === PRODUCER_URL && urlAudit?.substitutedDomain === false, "32. producer URL audit keeps the mandatory sugardefender24 order-now URL");
  const approval = readJson(evidence, "content-approval-results.json");
  assert(approval?.nineMedicalClaimsRemainBlocked === true && approval?.producerImagesNotHotlinked === true, "33. medical claims stay blocked and producer images are not hotlinked");
  const identityFile = readJson(evidence, "candidate-identity.json");
  assert(identityFile?.candidateExecution === "54BN" && identityFile?.compositionId === "PREMIUM_PRODUCER_CONTENT_V1", "34. candidate identity records 54BN / PREMIUM_PRODUCER_CONTENT_V1");
  const ledger = readJson(evidence, "budget-ledger.json");
  assert(Number(ledger?.maxUsd) === 0.3 && Number(ledger?.spentUsd ?? 1) <= 0.3, "35. recorded spend stays within the exclusive 54BN ledger");
  const gate = readJson(evidence, "quality-gate-decision.json");
  assert(gate?.publicationUnlocked === false && gate?.ctaEnabled === false && gate?.adsActivated === false, "36. written gate never unlocks publication or ads");
  const preservation = readJson(evidence, "content-preservation.json");
  assert(preservation?.biCheckpointOverwritten === false && preservation?.dispatch24h === true, "37. 54BI checkpoint and contract dispatch text are preserved");
  if (SHOTS.every((file) => existsSync(path.join(evidence, file)))) {
    assert(true, "38. visitor captures exist for desktop, tablet, and mobile");
  }
  if (existsSync(path.join(evidence, "producer-desktop.png")) && existsSync(path.join(evidence, "producer-mobile.png"))) {
    assert(true, "39. producer desktop and mobile screenshots were written");
  }
  const counts = countsByStatus(
    ((readJson(evidence, "commercial-evidence-manifest.json")?.items as Array<{ reuse_status: "APPROVED" | "PENDING_REVIEW" | "REJECTED" }>) ?? []),
  );
  assert(counts.APPROVED + counts.PENDING_REVIEW + counts.REJECTED >= 1, "40. commercial manifest has classified items");
}

const biOfficial = readJson(biEvidence, "official-v2-results.json");
assert(biOfficial?.finalDesktopVisualScore === 74 && biOfficial?.finalMobileVisualScore === 72 && biOfficial?.finalEditorialScore === 74, "41. 54BI official baseline 74/72/74 remains in evidence");

console.log(`PASS ${passed}`);
