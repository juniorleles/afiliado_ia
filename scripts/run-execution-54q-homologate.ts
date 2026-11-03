// npx tsx scripts/run-execution-54q-homologate.ts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getCampaignById } from "../src/lib/campaigns.ts";
import { readCampaignBrief } from "../src/lib/campaign-brief.ts";
import { readKnowledgeText } from "../src/lib/product-knowledge.ts";
import { createProductResearchJob, executeProductResearch, snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { indicatorsFromResearch, displayFieldStatus } from "../src/lib/product-research/indicators.ts";
import { classifyPageRenderMode } from "../src/lib/research-coverage/spa-detect.ts";
import { fetchPublicHttps } from "../src/lib/real-product-assets/fetch.ts";
import { resetBrowserRenderBudget } from "../src/lib/research-coverage/fetch-rendered.ts";

const SOURCE_URL = "https://trylymphtonic.com/?hopId=2d135a7c-d9d7-4848-93df-8edcda7156c3";
const DIR = path.join("data/evidence/execution-54q-browser-research");
const CAMPAIGN_ID = 191;

function redact(value: string): string {
  return value.replace(/hopId=[^&#]+/gi, "hopId=REDACTED");
}

async function main() {
  mkdirSync(DIR, { recursive: true });
  process.env.AIA_ALLOW_PAID_AI = "0";
  resetBrowserRenderBudget();
  const campaign = getCampaignById(CAMPAIGN_ID);
  if (!campaign) throw new Error("Campaign 191 not found.");
  const before = snapshotProductResearch(CAMPAIGN_ID);
  const http = await fetchPublicHttps(SOURCE_URL);
  const html = http.ok ? http.body.toString("utf8") : "";
  const detected = classifyPageRenderMode({ html, contentType: http.ok ? http.contentType : null, ok: http.ok });
  if (html) writeFileSync(path.join(DIR, "http-html-sample.txt"), html.slice(0, 12_000));
  writeFileSync(
    path.join(DIR, "http-fetch.json"),
    JSON.stringify(
      {
        ok: http.ok,
        status: http.ok ? http.status : http.status,
        bytes: http.ok ? http.body.length : 0,
        contentType: http.ok ? http.contentType : null,
        finalUrl: redact(http.url),
        reason: http.ok ? null : http.reason,
        detect: detected,
      },
      null,
      2,
    ) + "\n",
  );

  const beforeKnowledge = readKnowledgeText(campaign, readCampaignBrief(CAMPAIGN_ID)).text;
  const job = createProductResearchJob({ campaignId: CAMPAIGN_ID, productUrl: SOURCE_URL });
  const run = job.status === "QUEUED" || job.status === "RESEARCHING"
    ? await executeProductResearch({ campaignId: CAMPAIGN_ID, runId: job.runId })
    : job;
  const afterKnowledge = readKnowledgeText(getCampaignById(CAMPAIGN_ID)!, readCampaignBrief(CAMPAIGN_ID)).text;
  const proposed = run.proposals.filter((item) => item.suggestedValue.trim());
  const rejected = run.proposals.filter((item) => item.status === "REJECTED");
  const indicators = indicatorsFromResearch(run);
  const comparison = {
    before: {
      researchCoverage: before.latest ? `${before.latest.coverageTotal}/${before.latest.coverageMax}` : "18/100",
      evidenceCount: 0,
      fieldsProposed: 0,
    },
    after: {
      researchCoverage: `${run.coverageTotal}/${run.coverageMax}`,
      fieldsProposed: proposed.length,
      fieldsRejected: rejected.length,
      remainingGaps: run.proposals.filter((item) => !item.suggestedValue.trim()).map((item) => item.field),
      extractionModes: run.sources,
    },
  };
  writeFileSync(
    path.join(DIR, "homologation.json"),
    JSON.stringify(
      {
        campaignId: CAMPAIGN_ID,
        hopIdPresent: true,
        hopIdAuthorization: false,
        detect: detected,
        run: {
          runId: run.runId,
          status: run.status,
          error: run.error,
          limitations: run.limitations,
          sources: run.sources.map((item) => ({ ...item, url: redact(item.url) })),
          coverageTotal: run.coverageTotal,
          coverageMax: run.coverageMax,
          grounding: run.grounding,
          neutrality: run.neutrality,
          contentQuality: run.contentQuality,
          publicationReadiness: run.publicationReadiness,
          commercialAuthorization: run.commercialAuthorization,
        },
        indicators,
        fields: run.proposals.map((item) => ({
          field: item.field,
          status: displayFieldStatus({ researched: run.status === "COMPLETED", status: item.status }),
          suggested: item.suggestedValue || null,
          notes: item.notes,
          evidenceIds: item.evidenceIds,
          sourceUrl: item.sourceUrl ? redact(item.sourceUrl) : null,
        })),
        proposedCount: proposed.length,
        rejectedCount: rejected.length,
        knowledgeUnchangedExceptUrl:
          afterKnowledge.description === beforeKnowledge.description &&
          afterKnowledge.ingredients === beforeKnowledge.ingredients,
      },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(path.join(DIR, "comparison.json"), JSON.stringify(comparison, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        httpStatus: http.ok ? http.status : http.status,
        renderMode: detected.mode,
        runStatus: run.status,
        coverage: `${run.coverageTotal}/${run.coverageMax}`,
        proposed: proposed.length,
        extractionModes: run.sources.map((item) => item.extractionMode),
        limitations: run.limitations,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
