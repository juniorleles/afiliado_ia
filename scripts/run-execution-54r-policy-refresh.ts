// npx tsx scripts/run-execution-54r-policy-refresh.ts
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fetchPublicHttps } from "../src/lib/real-product-assets/fetch.ts";
import { extractAffiliatePolicy } from "../src/lib/affiliate-policy/extract.ts";

const DIR = path.join("data/evidence/execution-54r-dual-source-affiliate-research");
const AFFILIATE = "https://sugardefender.com/info/affiliates.html";

async function main() {
  const fetched = await fetchPublicHttps(AFFILIATE);
  if (!fetched.ok) {
    writeFileSync(path.join(DIR, "commercial-rules.json"), `${JSON.stringify({ ok: false, reason: fetched.reason }, null, 2)}\n`);
    return;
  }
  const html = fetched.body.toString("utf8");
  const policy = extractAffiliatePolicy({ campaignId: 237, texts: [{ text: html, sourceUrl: AFFILIATE }] });
  writeFileSync(
    path.join(DIR, "commercial-rules.json"),
    `${JSON.stringify(
      {
        sourceUrl: AFFILIATE,
        bytes: fetched.body.length,
        reviewStatus: policy.reviewStatus,
        publicationReady: policy.publicationReady,
        rules: Object.fromEntries(
          [
            "brandBiddingPolicy",
            "paidSearchPolicy",
            "directLinkingPolicy",
            "presellPolicy",
            "approvedAssetsPolicy",
            "pricingClaimsPolicy",
            "trademarkRestrictions",
            "geographicRestrictions",
            "disclosureRequirements",
          ].map((field) => [field, policy[field as keyof typeof policy]]),
        ),
        note: "UNKNOWN does not mean allowed. Promotional affiliate copy is not independent evidence.",
      },
      null,
      2,
    )}\n`,
  );
  console.log("54R commercial-rules.json refreshed");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
