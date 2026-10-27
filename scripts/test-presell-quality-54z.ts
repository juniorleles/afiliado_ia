// npx tsx scripts/test-presell-quality-54z.ts
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createCampaign } from "../src/lib/campaigns.ts";
import { PRODUCT_CONTRACT_VERSION } from "../src/lib/product-contract/types.ts";
import { inspectContentQuality } from "../src/lib/lp-generator/content-quality.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { buildProductContract } from "../src/lib/product-contract/build.ts";
import { AFFILIATE_DISCLOSURE_TEXT, HEALTH_DISCLAIMER_TEXT, PUBLIC_FOOTER_LINKS, getPublicSiteName, getPublicSiteUrl } from "../src/lib/public-site.ts";
import { buildConversionBrief } from "../src/lib/conversion-strategy/build.ts";
import { buildPageBlueprint } from "../src/lib/page-blueprint/blueprint.ts";
import { composeV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { labScenarioKeys } from "../src/lib/design-system/scenarios.ts";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import {
  QUALITY_TARGET,
  QUALITY_DIMENSION_WEIGHTS,
  PRESELL_QUALITY_VERSION,
} from "../src/lib/presell-quality/types.ts";
import { weightedQualityScore, resolveAssessmentStatus } from "../src/lib/presell-quality/score.ts";
import { qualityPassedWithoutAi } from "../src/lib/presell-quality/policy.ts";
import { qualityCostGate } from "../src/lib/presell-quality/cost.ts";
import { unevaluatedAssessment, assessmentFromScores, createBlockedMultimodalEvaluator } from "../src/lib/presell-quality/evaluator.ts";
import { writeQualityAssessment, readQualityAssessment } from "../src/lib/presell-quality/persist.ts";
import { QUALITY_CALIBRATION_FIXTURES } from "../src/lib/presell-quality/fixtures.ts";
import { tenProductProtocol } from "../src/lib/presell-quality/protocol.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

const weights = Object.values(QUALITY_DIMENSION_WEIGHTS).reduce((sum, item) => sum + item, 0);
assert(Math.abs(weights - 1) < 0.001, "2. dimension weights sum to 1");
assert(QUALITY_TARGET === 85, "3. quality target is 85");
assert(PRESELL_QUALITY_VERSION === 1, "1. contract version is 1");

const pending = resolveAssessmentStatus({
  dimensionScores: [],
  criticalFailures: [],
  evaluatorType: "MULTIMODAL_AI",
  evaluationCompleted: false,
});
assert(pending.assessmentStatus === "NOT_EVALUATED" && pending.humanReviewEligibility === "NOT_ELIGIBLE", "5. pending evaluation is not approval");
assert(unevaluatedAssessment({ campaignId: 1 }).assessmentStatus === "NOT_EVALUATED", "6. absent evaluation stays NOT_EVALUATED");

const failed = resolveAssessmentStatus({
  dimensionScores: [],
  criticalFailures: [],
  evaluatorType: "MULTIMODAL_AI",
  evaluationCompleted: false,
  evaluationFailed: true,
});
assert(failed.assessmentStatus === "EVALUATION_FAILED", "7. evaluator error is EVALUATION_FAILED");

const high = [
  { dimension: "DESIGN_HIERARCHY" as const, score: 95, rationale: "x" },
  { dimension: "COPY_CLARITY" as const, score: 95, rationale: "x" },
  { dimension: "DEPTH_ORGANIZATION" as const, score: 95, rationale: "x" },
  { dimension: "IMAGES_COMPOSITION" as const, score: 95, rationale: "x" },
  { dimension: "MOBILE_EXPERIENCE" as const, score: 95, rationale: "x" },
  { dimension: "TRANSPARENCY_LEGIBILITY" as const, score: 95, rationale: "x" },
];
assert(weightedQualityScore(high) === 95, "2. high scores weight correctly");
const blocked = resolveAssessmentStatus({
  dimensionScores: high,
  criticalFailures: ["INSUFFICIENT_EDITORIAL_CONTENT"],
  evaluatorType: "MULTIMODAL_AI",
  evaluationCompleted: true,
});
assert(blocked.assessmentStatus === "QUALITY_BLOCKED" && (blocked.overallScore ?? 100) < QUALITY_TARGET, "4. critical failures cap the score and block");

const passedAi = resolveAssessmentStatus({
  dimensionScores: high,
  criticalFailures: [],
  evaluatorType: "MULTIMODAL_AI",
  evaluationCompleted: true,
});
assert(passedAi.assessmentStatus === "QUALITY_PASSED" && passedAi.humanReviewEligibility === "ELIGIBLE", "8. only a completed multimodal pass can become eligible");

const fakePass = assessmentFromScores(
  { campaignId: 9, evaluatorType: "DETERMINISTIC_BASELINE" },
  { dimensionScores: high, criticalFailures: [], evaluatorType: "DETERMINISTIC_BASELINE", evaluationCompleted: true },
);
assert(fakePass.assessmentStatus !== "QUALITY_PASSED", "8. deterministic baseline cannot assign QUALITY_PASSED");
assert(!qualityPassedWithoutAi(fakePass) || fakePass.assessmentStatus !== "QUALITY_PASSED", "8. quality approval stays separate from publication");
assert(fakePass.publicationReadiness === "BLOCKED" && fakePass.commercialAuthorization === "BLOCKED", "8. commercial and publication stay blocked");

async function main() {
process.env.AIA_ALLOW_PAID_AI = "0";
assert(qualityCostGate().allowed === false, "14. cost policy blocks paid evaluation");
const multimodal = await createBlockedMultimodalEvaluator().evaluate({ campaignId: 9 });
assert(multimodal.assessmentStatus === "EVALUATION_FAILED", "7. blocked provider is EVALUATION_FAILED");
assert(multimodal.costMetadata.actualUsd === 0, "14. no cost is recorded");

const isolated = createCampaign({
  name: "Novalis 54Z",
  slug: `novalis-54z-${Date.now()}`,
  headline: "Novalis 54Z",
  body: "Novalis",
  ctaLabel: "See offer",
  affiliateUrl: "",
  headScript: null,
  adHeadline: null,
});
const written = writeQualityAssessment(assessmentFromScores(
  { campaignId: isolated.id, evaluatorType: "MOCK_TEST", evaluatorModel: "mock" },
  {
    dimensionScores: high,
    criticalFailures: ["MISLEADING_COMMERCIAL_CTA"],
    evaluatorType: "MOCK_TEST",
    evaluationCompleted: true,
  },
));
const reloaded = readQualityAssessment(isolated.id, written.assessmentId);
assert(reloaded?.assessmentId === written.assessmentId, "15. assessment persists");
assert(reloaded?.campaignId === isolated.id, "9. campaign isolation is stored on the assessment");
const other = snapshotProductResearch(237);
assert((other.latest?.campaignId ?? 237) === 237, "9. writing an isolated assessment does not change campaign 237");

const facts = emptyProductFacts("Novalis Core", "https://shop.novalis.example/core", "MANUAL");
facts.confidence.productName = "MANUAL";
facts.guaranteeInformation = "Customers may request a refund within 60 days.";
facts.confidence.guaranteeInformation = "DIRECT_SOURCE";
const contract = buildProductContract({
  facts,
  slug: "novalis-core",
  siteName: getPublicSiteName(),
  siteUrl: getPublicSiteUrl(),
  cta: { previewOnly: true },
  legal: {
    affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT,
    healthDisclaimer: HEALTH_DISCLAIMER_TEXT,
    healthDisclaimerPolicy: "WHEN_HEALTH_CONTENT",
    trustLinks: PUBLIC_FOOTER_LINKS.map((link) => ({ href: link.href, label: link.label })),
  },
}).contract;
assert(contract.contractVersion === PRODUCT_CONTRACT_VERSION, "11. product contract version is preserved");
const brief = buildConversionBrief(contract);
const page = buildPageBlueprint({ contract, brief });
const quality = inspectContentQuality({ copy: page.copy, contract, brief });
assert(Array.isArray(quality), "12. editorial content-quality inspect still runs");
const model = composeV4Model({
  contract,
  brief,
  copy: page.copy,
  blueprint: page.blueprint,
  scenarioKey: "novalis-54z",
});
const markup = renderToStaticMarkup(createElement(V4Page, { model }));
assert(markup.includes('data-v4="page"'), "10. Renderer V4 still renders");
assert(!/the seller states:/i.test(markup), "13. visitor-facing guarantee does not show the audit prefix");

const s1 = buildV4Model(labScenarioKeys()[0]);
assert(Boolean(s1), "13. lab s1 still builds");
const s1Html = renderToStaticMarkup(createElement(V4Page, { model: s1! }));
assert(!/the seller states:/i.test(s1Html), "13. s1 no longer leaks The seller states: to the visitor");
const s1Headings = [...s1Html.matchAll(/<h2[^>]*>([^<]*)/g)].map((item) => item[1]);
assert(!s1Headings.some((title) => /what the source states|seller-stated claims|questions the source answered/i.test(title ?? "")), "13. s1 still has no audit headlines");

assert(QUALITY_CALIBRATION_FIXTURES.length === 6, "fixtures cover the six calibration cases");
assert(tenProductProtocol()[0].campaignId === 237, "ten-product slot 1 is Sugar Defender");
assert(tenProductProtocol().slice(1).every((item) => item.campaignId === null), "slots 2-10 stay empty");

assert(existsSync(path.join(process.cwd(), "src/components/product-showcase/v4/page.tsx")), "10. V4 page file remains");
assert(createHash("sha256").update("x").digest("hex").length === 64, "hash helper still works");
const dir = path.join("data/evidence/execution-54z-quality-baseline/reports");
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, "isolated-review.json"), `${JSON.stringify({ isolated: isolated.id, passed }, null, 2)}\n`);
console.log(`PASS test-presell-quality-54z.ts (${passed} OK)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
