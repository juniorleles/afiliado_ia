// npx tsx scripts/run-execution-54p-homologate.ts
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getCampaignById } from "../src/lib/campaigns.ts";
import { readCampaignBrief } from "../src/lib/campaign-brief.ts";
import { readKnowledgeText } from "../src/lib/product-knowledge.ts";
import { createProductResearchJob, executeProductResearch, snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { indicatorsFromResearch, displayFieldStatus } from "../src/lib/product-research/indicators.ts";
import { classifySourceClass } from "../src/lib/research-coverage/classify-source.ts";
import { resolveResearchSeeds } from "../src/lib/product-research/seeds.ts";

const SOURCE_URL = "https://trylymphtonic.com/?hopId=2d135a7c-d9d7-4848-93df-8edcda7156c3";
const DIR = path.join("data/evidence/execution-54p-legacy-universal-integration");
const CAMPAIGN_ID = 191;

function redact(value: string): string {
  return value.replace(/hopId=[^&#]+/gi, "hopId=REDACTED");
}

async function main() {
  mkdirSync(DIR, { recursive: true });
  process.env.AIA_ALLOW_PAID_AI = "0";
  const campaign = getCampaignById(CAMPAIGN_ID);
  if (!campaign) throw new Error("Campaign 191 not found.");
  const brief = readCampaignBrief(CAMPAIGN_ID);
  const beforeKnowledge = readKnowledgeText(campaign, brief).text;
  const before = snapshotProductResearch(CAMPAIGN_ID);
  const seeds = resolveResearchSeeds({ productUrl: SOURCE_URL, affiliateUrl: campaign.affiliateUrl });
  const job = createProductResearchJob({ campaignId: CAMPAIGN_ID, productUrl: SOURCE_URL });
  const run = job.status === "QUEUED" || job.status === "RESEARCHING"
    ? await executeProductResearch({ campaignId: CAMPAIGN_ID, runId: job.runId })
    : job.status === "NEED_URL"
      ? job
      : await executeProductResearch({ campaignId: CAMPAIGN_ID, runId: job.runId });
  const afterKnowledge = readKnowledgeText(getCampaignById(CAMPAIGN_ID)!, readCampaignBrief(CAMPAIGN_ID)).text;
  const indicators = indicatorsFromResearch(run);
  const proposed = run.proposals.filter((item) => item.suggestedValue.trim());
  const approved = run.proposals.filter((item) => item.status === "ACCEPTED");
  const fieldRows = run.proposals.map((item) => ({
    field: item.field,
    status: displayFieldStatus({ researched: run.status === "COMPLETED", status: item.status }),
    current: item.currentValue || null,
    suggested: item.suggestedValue || null,
    evidenceIds: item.evidenceIds,
    sourceUrl: item.sourceUrl ? redact(item.sourceUrl) : null,
    sourceClass: item.sourceClass,
    collectedAt: item.collectedAt,
  }));

  const comparison = {
    field: [
      "description",
      "ingredients",
      "features",
      "usage",
      "pricing",
      "guarantee",
      "manufacturer",
      "images",
    ],
    rows: fieldRows,
    note: "Legacy import values are from the pre-fix session (identity only). Universal values are proposals, not approvals.",
  };

  const out = {
    campaignId: CAMPAIGN_ID,
    productName: brief?.productName || campaign.name,
    hopIdPresent: true,
    hopIdTreatedAsAuthorization: false,
    seeds: { count: seeds.seeds.length, rejection: seeds.rejection, seeds: seeds.seeds.map(redact) },
    classified: classifySourceClass({ url: SOURCE_URL }),
    before: {
      status: before.latest?.status ?? "NOT_RESEARCHED",
      coverage: before.latest ? `${before.latest.coverageTotal}/${before.latest.coverageMax}` : "0/100",
      knowledgeProductUrl: beforeKnowledge.productUrl || null,
    },
    run: {
      runId: run.runId,
      status: run.status,
      stage: run.stage,
      error: run.error,
      seedRejection: run.seedRejection,
      sources: run.sources.map((item) => ({ ...item, url: redact(item.url) })),
      limitations: run.limitations,
      coverageTotal: run.coverageTotal,
      coverageMax: run.coverageMax,
      grounding: run.grounding,
      neutrality: run.neutrality,
      contentQuality: run.contentQuality,
      publicationReadiness: run.publicationReadiness,
      commercialAuthorization: run.commercialAuthorization,
    },
    indicators,
    proposedCount: proposed.length,
    approvedCount: approved.length,
    fields: fieldRows,
    knowledgeUnchangedExceptUrl:
      afterKnowledge.description === beforeKnowledge.description &&
      afterKnowledge.ingredients === beforeKnowledge.ingredients &&
      afterKnowledge.benefits === beforeKnowledge.benefits,
    productUrlPersisted: Boolean(afterKnowledge.productUrl),
  };

  writeFileSync(path.join(DIR, "homologation.json"), JSON.stringify(out, null, 2) + "\n");
  writeFileSync(path.join(DIR, "comparison.json"), JSON.stringify(comparison, null, 2) + "\n");
  const runFile = path.join("data", "product-research", String(CAMPAIGN_ID), "runs", `${run.runId}.json`);
  if (existsSync(runFile)) {
    const raw = JSON.parse(readFileSync(runFile, "utf8")) as { seeds?: string[]; sources?: Array<{ url: string }> };
    writeFileSync(
      path.join(DIR, "product-research-run.sanitized.json"),
      JSON.stringify(
        {
          ...JSON.parse(readFileSync(runFile, "utf8")),
          seeds: (raw.seeds ?? []).map(redact),
          sources: (raw.sources ?? []).map((item) => ({ ...item, url: redact(item.url) })),
        },
        null,
        2,
      ) + "\n",
    );
  }
  console.log(JSON.stringify({
    status: run.status,
    coverage: `${run.coverageTotal}/${run.coverageMax}`,
    proposed: proposed.length,
    approved: approved.length,
    generation: indicators.generationReadiness.status,
    publication: indicators.publicationReadiness.status,
    extraction: indicators.extractionConfidence.status,
    productUrlPersisted: Boolean(afterKnowledge.productUrl),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
