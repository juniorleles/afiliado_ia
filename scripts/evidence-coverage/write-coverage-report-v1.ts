/**
 * Composes extraction-trace.json, generic-fixes.json and coverage-report.json
 * from the measured artifacts. No network, no AI, no campaign writes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = process.argv.find((item) => item.startsWith("--out="))?.slice(6);
if (!dir) throw new Error("--out is required");

const read = <T,>(file: string) => JSON.parse(readFileSync(path.join(dir, file), "utf8")) as T;
const map = read<{
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  beforeStatusCounts: Record<string, number>;
  afterStatusCounts: Record<string, number>;
  factConfidenceBefore: Record<string, string>;
  factConfidenceAfter: Record<string, string>;
  copyEligibleManifestBefore: number;
  copyEligibleManifestAfter: number;
  openTopicsBefore: string[];
  openTopicsAfter: string[];
}>("coverage-map.json");
const gaps = read<{
  after: Array<{ topic: string; cause: string; sourceUnits: number; lostEligible: number; schemaField: boolean }>;
  lostUnitsAfter: Array<{ TOPIC: string; FETCHED_BY_IMPORTER: boolean }>;
  withheldByPolicyAfter: unknown[];
}>("coverage-gaps.json");

const fixes = [
  {
    FIX_ID: "GF-01",
    DEFECT: "GENERIC_EXTRACTION_DEFECT",
    FILE: "src/lib/import-product.ts",
    FUNCTION: "stripNoise",
    TRACE:
      "HTML comments were left in the cleaned markup, so commented-out blocks were read as page evidence even though no visitor can see them.",
    FIX: "Comments are removed before any section, paragraph or list extraction.",
    PRODUCT_INDEPENDENT: true,
  },
  {
    FIX_ID: "GF-02",
    DEFECT: "GENERIC_EXTRACTION_DEFECT",
    FILE: "src/lib/import-product.ts",
    FUNCTION: "extractAttributeChipRuns",
    TRACE:
      "Rows of short product attribute labels carry no heading, so no section branch reached them, and each label is below the minimum length isFeatureStatement accepts. Both conditions had to hold for the row to be lost, which is why the labels never appeared in any field.",
    FIX:
      "A run of at least three consecutive short labels separated by markup alone is read as explicit product characteristics. Any visible text between two labels breaks the run, so prose, price boxes and testimonial cards are excluded.",
    PRODUCT_INDEPENDENT: true,
  },
  {
    FIX_ID: "GF-03",
    DEFECT: "GENERIC_CLASSIFICATION_DEFECT",
    FILE: "src/lib/import-heuristics.ts",
    FUNCTION: "isProductAttributeChip",
    TRACE:
      "Purchase-context labels (offer names, social proof, logistics) are printed in the same short-label shape as product attributes and would have entered the features field with them.",
    FIX: "Purchase-context labels are rejected by an explicit predicate, so only product characteristics survive a label run.",
    PRODUCT_INDEPENDENT: true,
  },
  {
    FIX_ID: "GF-04",
    DEFECT: "GENERIC_MAPPING_DEFECT",
    FILE: "src/lib/import-product.ts",
    FUNCTION: "extractProductFacts",
    TRACE:
      "A component list is itself a run of short labels, so a plain ingredient list would have been reported a second time as product features.",
    FIX: "A value already stored as a component can no longer be repeated as a feature.",
    PRODUCT_INDEPENDENT: true,
  },
];

const openGaps = gaps.after.filter((gap) => gap.cause !== "NONE" && gap.sourceUnits > 0);
const unfetchedLoss = gaps.lostUnitsAfter.filter((unit) => unit.FETCHED_BY_IMPORTER === false).length;

writeFileSync(
  path.join(dir, "extraction-trace.json"),
  `${JSON.stringify(
    {
      method: "Deterministic re-extraction over the saved source HTML, compared against the stored ProductFacts of the current draft.",
      paidModelCalls: 0,
      aiClassificationUsed: false,
      fixes,
      factConfidenceBefore: map.factConfidenceBefore,
      factConfidenceAfter: map.factConfidenceAfter,
      copyEligibleManifestBefore: map.copyEligibleManifestBefore,
      copyEligibleManifestAfter: map.copyEligibleManifestAfter,
      openGenerationTopicsBefore: map.openTopicsBefore,
      openGenerationTopicsAfter: map.openTopicsAfter,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

writeFileSync(path.join(dir, "generic-fixes.json"), `${JSON.stringify({ productSpecificLogic: 0, fixes }, null, 2)}\n`, "utf8");

writeFileSync(
  path.join(dir, "coverage-report.json"),
  `${JSON.stringify(
    {
      before: map.before,
      after: map.after,
      statusCountsBefore: map.beforeStatusCounts,
      statusCountsAfter: map.afterStatusCounts,
      openGaps,
      lostUnitsOnPagesTheImporterNeverFetches: unfetchedLoss,
      withheldByPolicy: gaps.withheldByPolicyAfter.length,
      genericFixesApplied: fixes.length,
      productSpecificLogic: 0,
      paidModelCalls: 0,
      evidenceExhausted: (map.after as { evidenceExhausted?: boolean }).evidenceExhausted ?? false,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`OPEN_GAPS=${openGaps.map((gap) => `${gap.topic}:${gap.cause}`).join(" ")}`);
console.log(`UNFETCHED_LOSS=${unfetchedLoss} WITHHELD=${gaps.withheldByPolicyAfter.length}`);
console.log(`REPORT_WRITTEN=${dir}`);
