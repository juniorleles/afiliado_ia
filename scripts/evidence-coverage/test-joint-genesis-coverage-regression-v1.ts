// npx tsx scripts/evidence-coverage/test-joint-genesis-coverage-regression-v1.ts
//
// The Joint Genesis campaign is the frozen reference. The coverage layer is a
// read-only diagnostic, so evaluating it must leave facts and content byte
// identical.
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { getCampaignById } from "../../src/lib/campaigns.ts";
import { evaluateEvidenceCoverage, topicGaps, type SourceUnitInput } from "../../src/lib/evidence-coverage.ts";
import type { ProductFacts } from "../../src/lib/product-facts.ts";

const CAMPAIGN_ID = 153;
const out = process.argv.find((item) => item.startsWith("--out="))?.slice(6);

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex").slice(0, 16);

const campaign = getCampaignById(CAMPAIGN_ID);
if (!campaign) throw new Error(`campaign ${CAMPAIGN_ID} not found`);

const record = campaign as unknown as Record<string, unknown>;
const factsHashBefore = hash(record.sourceFactsJson);
const contentKeys = Object.keys(record).filter((key) => /json$/i.test(key) && key !== "sourceFactsJson");
const contentHashBefore = hash(contentKeys.map((key) => record[key]));
const presentationBefore = String(record.productionPresentation ?? "");
const statusBefore = String(record.publicationStatus ?? "");

const facts = JSON.parse(String(record.sourceFactsJson ?? "null")) as ProductFacts | null;
if (!facts) throw new Error("campaign has no stored ProductFacts");

const units: SourceUnitInput[] = (facts.sourceSnippets ?? []).map((snippet, index) => ({
  id: `JG${String(index + 1).padStart(3, "0")}`,
  text: snippet.text,
  location: `stored-snippet#${snippet.field}`,
  type: "PARAGRAPH",
  fetchedByImporter: true,
}));

const coverage = evaluateEvidenceCoverage(units, facts);
const gaps = topicGaps(coverage);

const reread = getCampaignById(CAMPAIGN_ID) as unknown as Record<string, unknown>;
assert(hash(reread.sourceFactsJson) === factsHashBefore, "JOINT_GENESIS_PRODUCTFACTS_CHANGED=NO");
assert(hash(contentKeys.map((key) => reread[key])) === contentHashBefore, "JOINT_GENESIS_CONTENT_CHANGED=NO");
assert(String(reread.productionPresentation ?? "") === presentationBefore, "presentation unchanged");
assert(String(reread.publicationStatus ?? "") === statusBefore, "publication status unchanged");
assert(coverage.sourceMeaningfulUnits > 0, "coverage layer produced diagnostics for the reference");

console.log(
  `JOINT_GENESIS COVERAGE=${coverage.evidenceCoverage} MEANINGFUL=${coverage.sourceMeaningfulUnits} CAPTURED=${coverage.capturedUnits} COPY_ELIGIBLE=${coverage.copyEligibleUnits} LOST=${coverage.lostEligibleUnits} EXHAUSTED=${coverage.evidenceExhausted ? "YES" : "NO"}`,
);
console.log(`JOINT_GENESIS FACTS_HASH=${factsHashBefore} CONTENT_HASH=${contentHashBefore}`);

if (out) {
  writeFileSync(
    out,
    `${JSON.stringify(
      {
        campaignId: CAMPAIGN_ID,
        slug: record.slug,
        productFactsHash: factsHashBefore,
        contentHash: contentHashBefore,
        productionPresentation: presentationBefore,
        publicationStatus: statusBefore,
        jointGenesisProductFactsChanged: false,
        jointGenesisContentChanged: false,
        coverage: { ...coverage, units: undefined },
        topicGaps: gaps,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(`REGRESSION_ARTIFACT=${out}`);
}
console.log("JOINT_GENESIS_COVERAGE_REGRESSION=PASS");
