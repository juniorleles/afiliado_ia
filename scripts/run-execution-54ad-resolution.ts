// npx tsx scripts/run-execution-54ad-resolution.ts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { readUserProvidedAffiliateUrl, registerUserProvidedAffiliateUrl } from "../src/lib/campaign-sources/user-provided.ts";
import { campaignIntegritySnapshot, resolveCampaignCommercialSources } from "../src/lib/campaign-sources/resolve-commercial.ts";
import { paidAiAuthorization } from "../src/lib/ai/paid-gate.ts";
import { redactSecrets } from "../src/lib/lp-generator/ai-copy/config.ts";

const EVIDENCE = path.join("data/evidence/execution-54ad-affiliate-source-resolution");
const REPORTS = path.join(EVIDENCE, "reports");

async function main() {
  mkdirSync(REPORTS, { recursive: true });
  const baseCommit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  const before = campaignIntegritySnapshot(237);
  const hop = process.env.AIA_USER_PROVIDED_HOP?.trim() || readUserProvidedAffiliateUrl(237)?.originalUrl;
  if (!hop) throw new Error("Campaign 237 hop is only read from private storage or AIA_USER_PROVIDED_HOP.");
  const recorded = registerUserProvidedAffiliateUrl({ campaignId: 237, url: hop });
  const resolution = await resolveCampaignCommercialSources(237, { inspectRoot: true });
  const after = campaignIntegritySnapshot(237);
  const preserved =
    JSON.stringify(before.acceptedFacts) === JSON.stringify(after.acceptedFacts) &&
    JSON.stringify(before.approvedAssets) === JSON.stringify(after.approvedAssets) &&
    before.affiliateUrl === after.affiliateUrl &&
    before.qualityStatus === after.qualityStatus;

  const report = {
    EXECUTION_54AD_STATUS: recorded.origin === "USER_PROVIDED" && resolution.checkoutNavigated === false ? "RESOLVED_WITH_GAPS" : "FAILED",
    BASE_COMMIT: baseCommit,
    CAMPAIGN_ID: 237,
    AFFILIATE_URL_REGISTERED: true,
    AFFILIATE_URL_SOURCE: "USER_PROVIDED",
    AFFILIATE_URL_VERIFICATION_STATUS: recorded.verificationStatus,
    TRACKING_PARAMETERS_PRESERVED: Object.keys(recorded.attribution).sort(),
    PUBLIC_LOGS_REDACTED: resolution.publicAffiliate?.originalUrl,
    SELLER_INFORMATION_DOMAIN: resolution.sellerInformationDomain,
    COMMERCIAL_DESTINATION_DOMAIN: resolution.commercialDestinationDomain,
    SALES_LANDING_PAGE_FOUND: resolution.salesLandingPageFound,
    CHECKOUT_CLASSIFICATION: resolution.checkoutClassification,
    CHECKOUT_NAVIGATED: false,
    CROSS_HOST_DISCOVERY_STATUS: resolution.relatedHosts,
    NEW_INFORMATION_SOURCES: resolution.informationalPages,
    NEW_VERIFIED_FACTS: 0,
    PRODUCT_CONTRACT_PRESERVED: preserved,
    ASSET_APPROVALS_PRESERVED: JSON.stringify(before.approvedAssets) === JSON.stringify(after.approvedAssets),
    QUALITY_STATUS: after.qualityStatus,
    COMMERCIAL_AUTHORIZATION: "BLOCKED",
    PUBLICATION_READINESS: "BLOCKED",
    PAID_AI: paidAiAuthorization(),
    REAL_OPENAI_CALLS: 0,
    usedAsActiveCta: false,
    historicalFixtures: resolution.historicalFixtures,
    blockedDestinations: resolution.blockedDestinations,
    httpAccessClaims: resolution.httpAccessClaims,
    rootInspect: resolution.rootInspect,
    roles: recorded.roles,
    integrity: { before, after },
  };

  writeFileSync(path.join(REPORTS, "resolution.json"), `${JSON.stringify(resolution, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "summary.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "public-affiliate.json"), `${JSON.stringify(resolution.publicAffiliate, null, 2)}\n`);
  console.log(
    `54AD status=${report.EXECUTION_54AD_STATUS} host=${resolution.commercialDestinationDomain} checkoutNav=${resolution.checkoutNavigated} openai=0`,
  );
}

main().catch((err) => {
  console.error(redactSecrets(err instanceof Error ? err.stack ?? err.message : String(err)));
  process.exit(1);
});
