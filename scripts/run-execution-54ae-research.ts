// npx tsx scripts/run-execution-54ae-research.ts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { runCommercialEvidenceExpansion } from "../src/lib/presell-quality/commercial-research.ts";
import { campaignIntegritySnapshot } from "../src/lib/campaign-sources/resolve-commercial.ts";
import { paidAiAuthorization } from "../src/lib/ai/paid-gate.ts";
import { redactSecrets } from "../src/lib/lp-generator/ai-copy/config.ts";
import { readLatestQualityAssessment } from "../src/lib/presell-quality/persist.ts";

const EVIDENCE = path.join("data/evidence/execution-54ae-commercial-source-research");
const REPORTS = path.join(EVIDENCE, "reports");
const SEEDS = [
  "https://sugardefender.com/",
  "https://sugardefender.com/info/affiliates.html",
  "https://sugardefender24.com/",
];

async function main() {
  mkdirSync(REPORTS, { recursive: true });
  const baseCommit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  const before = campaignIntegritySnapshot(237);
  const expansion = await runCommercialEvidenceExpansion(237, { extraSeeds: SEEDS });
  const after = campaignIntegritySnapshot(237);
  const quality = readLatestQualityAssessment(237);
  const exhausted = expansion.factCandidates.filter((item) => item.usable).length === 0;

  const summary = {
    EXECUTION_54AE_STATUS: exhausted ? "RESEARCH_EXHAUSTED" : "RECOVERY_INCOMPLETE",
    BASE_COMMIT: baseCommit,
    CAMPAIGN_ID: 237,
    RESEARCH_EXECUTED: !expansion.skippedAsRedundant,
    TOTAL_URLS_DISCOVERED: expansion.inventory.length + expansion.searchHits.length,
    TOTAL_URLS_FETCHED: expansion.inventory.filter((item) => item.accessed).length,
    TOTAL_URLS_EXTRACTED: expansion.inventory.filter((item) => item.extracted).length,
    SELLER_SOURCES: expansion.inventory.filter((item) => item.sourceClass === "SELLER" || item.sourceClass === "AFFILIATE_RESOURCE").map((item) => item.finalUrl),
    INDEPENDENT_SOURCES: expansion.inventory.filter((item) => item.sourceClass === "INDEPENDENT_INFORMATION").map((item) => item.finalUrl),
    SCIENTIFIC_OR_REGULATORY_SOURCES: expansion.inventory.filter((item) => item.sourceClass === "SCIENTIFIC_OR_REGULATORY").map((item) => item.finalUrl),
    SUGARDEFENDER24_ROOT_STATUS: expansion.sugardefender24Root,
    SUGARDEFENDER24_HTML_EXTRACTED: expansion.sugardefender24Root.extracted,
    NEW_FACT_CANDIDATES: expansion.factCandidates.length,
    NEW_FACTS_VERIFIED: expansion.factsVerified,
    NEW_FACTS_APPROVED_FOR_USE: 0,
    IMAGE_CANDIDATES: expansion.imageCandidates.length,
    IMAGES_WITH_RIGHTS_EVIDENCE: expansion.imageCandidates.filter((item) => item.rightsVerified).length,
    HERO_ELIGIBLE_IMAGES: expansion.heroEligibleImages,
    REMAINING_EVIDENCE_GAPS: expansion.remainingEvidenceGaps,
    REMAINING_ASSET_GAPS: expansion.remainingAssetGaps,
    EDITORIAL_PLAN_STATUS: expansion.editorialPlanStatus,
    REGENERATION_READY: false,
    PRODUCT_CONTRACT_PRESERVED: JSON.stringify(before.acceptedFacts) === JSON.stringify(after.acceptedFacts),
    ASSET_APPROVALS_PRESERVED: JSON.stringify(before.approvedAssets) === JSON.stringify(after.approvedAssets),
    QUALITY_STATUS: quality?.assessmentStatus ?? after.qualityStatus,
    COMMERCIAL_AUTHORIZATION: "BLOCKED",
    PUBLICATION_READINESS: "BLOCKED",
    REAL_OPENAI_CALLS: 0,
    TOTAL_API_COST: 0,
    PAID_AI: paidAiAuthorization(),
    searchProvider: expansion.searchProvider,
    searchConfigured: expansion.searchConfigured,
    fetchedUrls: expansion.inventory.filter((item) => item.accessed).map((item) => item.finalUrl),
    extractedUrls: expansion.inventory.filter((item) => item.extracted).map((item) => item.finalUrl),
    limitations: expansion.limitations,
  };

  writeFileSync(path.join(REPORTS, "research-report.json"), `${JSON.stringify(expansion, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "source-inventory.json"), `${JSON.stringify(expansion.inventory, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "fact-candidates.json"), `${JSON.stringify(expansion.factCandidates, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "asset-candidates.json"), `${JSON.stringify(expansion.imageCandidates, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "editorial-readiness.json"), `${JSON.stringify({ plan: expansion.editorialPlan, status: expansion.editorialPlanStatus, regenerationReady: false, remainingEvidenceGaps: expansion.remainingEvidenceGaps }, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "execution-summary.md"), `# 54AE commercial source research

Status: ${summary.EXECUTION_54AE_STATUS}
Fetched: ${summary.TOTAL_URLS_FETCHED}
Extracted: ${summary.TOTAL_URLS_EXTRACTED}
sugardefender24.com root extracted: ${summary.SUGARDEFENDER24_HTML_EXTRACTED}
Usable new facts: ${expansion.factCandidates.filter((item) => item.usable).length}
Hero-eligible images: ${summary.HERO_ELIGIBLE_IMAGES}
Search provider: ${expansion.searchProvider} configured=${expansion.searchConfigured}
Checkout navigated: no
OpenAI calls: 0
`);
  writeFileSync(path.join(REPORTS, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(
    `54AE status=${summary.EXECUTION_54AE_STATUS} fetched=${summary.TOTAL_URLS_FETCHED} extracted=${summary.TOTAL_URLS_EXTRACTED} rootHtml=${summary.SUGARDEFENDER24_HTML_EXTRACTED} openai=0`,
  );
}

main().catch((err) => {
  console.error(redactSecrets(err instanceof Error ? err.stack ?? err.message : String(err)));
  process.exit(1);
});
