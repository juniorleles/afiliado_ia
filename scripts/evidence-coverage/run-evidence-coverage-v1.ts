/**
 * Evidence coverage audit over an already fetched source dump.
 *
 * No network, no AI, no campaign writes. Compares the source units the page
 * publishes against the facts the extractor produced, before and after fixes.
 *
 * npx tsx scripts/evidence-coverage/run-evidence-coverage-v1.ts --source=<dir> --out=<dir> --name=<product> [--baseline=<product-facts.json>]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { extractProductFacts } from "../../src/lib/import-product.ts";
import {
  evaluateEvidenceCoverage,
  isLostEligibleUnit,
  topicGaps,
  type SourceUnitInput,
} from "../../src/lib/evidence-coverage.ts";
import { buildGenerationFactManifest, type ProductFacts } from "../../src/lib/product-facts.ts";
import { createGenerationPlan } from "../../src/lib/ai/generation-plan.ts";

const arg = (name: string) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const sourceDir = arg("source");
const outDir = arg("out");
const operatorName = arg("name") ?? "";
const baselineFile = arg("baseline");
if (!sourceDir || !outDir) throw new Error("--source and --out are required");

type BlockDump = {
  url: string;
  headings: Array<{ level: string; text: string }>;
  paragraphs: string[];
  listItems: string[];
  bold: string[];
};
type SecondaryDump = {
  pages: Array<{ url: string; headings?: string[]; paragraphs?: string[]; tableCells?: string[] }>;
};

const readJson = <T,>(file: string) => JSON.parse(readFileSync(path.join(sourceDir!, file), "utf8")) as T;
const primary = readJson<BlockDump>("source-blocks.json");
const secondary = readJson<SecondaryDump>("secondary-sources.json");
const html = readFileSync(path.join(sourceDir!, "source-raw.html"), "utf8");

const units: SourceUnitInput[] = [];
let seq = 0;
const push = (
  text: string,
  location: string,
  type: SourceUnitInput["type"],
  pageRole: SourceUnitInput["pageRole"] = "PRIMARY",
  fetchedByImporter = false,
) => {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return;
  seq += 1;
  units.push({ id: `SU${String(seq).padStart(3, "0")}`, text: trimmed, location, type, pageRole, fetchedByImporter });
};

for (const heading of primary.headings) push(heading.text, `primary#${heading.level}`, "HEADING", "PRIMARY", true);
for (const paragraph of primary.paragraphs) push(paragraph, "primary#p", "PARAGRAPH", "PRIMARY", true);
for (const item of primary.listItems) push(item, "primary#li", "LIST_ITEM", "PRIMARY", true);
for (const phrase of primary.bold) push(phrase, "primary#b", "CHIP", "PRIMARY", true);
/** Page role from its own slug: every storefront exposes the same policy pages. */
const roleOf = (pathname: string): SourceUnitInput["pageRole"] => {
  if (/refund|return/i.test(pathname)) return "RETURNS_POLICY";
  if (/shipping|delivery/i.test(pathname)) return "SHIPPING_POLICY";
  if (/terms|privacy|disclaimer|legal/i.test(pathname)) return "LEGAL";
  if (/reference|citation|studies|science/i.test(pathname)) return "RESEARCH_REFERENCES";
  if (/contact|support|faq/i.test(pathname)) return "SUPPORT";
  return "OTHER";
};

for (const page of secondary.pages) {
  const pathname = new URL(page.url).pathname.replace(/\/+/g, "/");
  const role = roleOf(pathname);
  for (const heading of page.headings ?? []) push(heading, `${pathname}#h`, "HEADING", role);
  for (const paragraph of page.paragraphs ?? []) push(paragraph, `${pathname}#p`, "PARAGRAPH", role);
  for (const cell of page.tableCells ?? []) push(cell, `${pathname}#td`, "TABLE_CELL", role);
}

const afterFacts = extractProductFacts(html, primary.url, operatorName ? { operatorProductName: operatorName } : {});
const baselineFacts = baselineFile
  ? (JSON.parse(readFileSync(baselineFile, "utf8")) as { facts: ProductFacts }).facts
  : afterFacts;

const before = evaluateEvidenceCoverage(units, baselineFacts);
const after = evaluateEvidenceCoverage(units, afterFacts);

const summarize = (label: string, result: typeof before) => {
  console.log(
    `${label} COLLECTED=${result.sourceUnitsCollected} MEANINGFUL=${result.sourceMeaningfulUnits} CAPTURED=${result.capturedUnits} COPY_ELIGIBLE=${result.copyEligibleUnits} LOST=${result.lostEligibleUnits} COVERAGE=${result.evidenceCoverage} EXHAUSTED=${result.evidenceExhausted ? "YES" : "NO"}`,
  );
  console.log(`${label} TOPICS_SUPPORTED=${result.informationTopicsSupported.join(",")}`);
  console.log(`${label} TOPICS_COPY_ELIGIBLE=${result.informationTopicsCopyEligible.join(",")}`);
  console.log(`${label} TOPICS_CLOSED=${result.informationTopicsClosed.join(",")}`);
};
summarize("BEFORE", before);
summarize("AFTER", after);

const statusCounts = (result: typeof before) => {
  const counts: Record<string, number> = {};
  for (const unit of result.units.filter((unit) => unit.productFactCandidate)) {
    counts[unit.status] = (counts[unit.status] ?? 0) + 1;
  }
  return counts;
};
console.log("BEFORE_STATUS", JSON.stringify(statusCounts(before)));
console.log("AFTER_STATUS", JSON.stringify(statusCounts(after)));
const lostAfter = after.units.filter((unit) => unit.productFactCandidate && ["UNMAPPED", "MISCLASSIFIED"].includes(unit.status));
console.log(`LOST_AFTER_DETAIL (${lostAfter.length})`);
for (const unit of lostAfter) {
  const flags = unit.safetyFindings.length > 0 ? ` flags=${unit.safetyFindings.join(",")}` : "";
  console.log(`  ${unit.id} ${unit.status} topic=${unit.topic} loc=${unit.location}${flags} :: ${unit.text.slice(0, 130)}`);
}
console.log("ATTRIBUTE_CHIP_UNITS");
for (const unit of after.units.filter((unit) => unit.topic === "features")) {
  console.log(`  ${unit.id} cand=${unit.productFactCandidate ? "Y" : "N"} ${unit.status} loc=${unit.location} :: ${unit.text}`);
}
console.log("WITHHELD_BY_POLICY");
for (const unit of after.units.filter((unit) => unit.productFactCandidate && unit.safetyFindings.length > 0 && unit.status !== "CAPTURED_COPY_ELIGIBLE")) {
  console.log(`  ${unit.id} topic=${unit.topic} flags=${unit.safetyFindings.join(",")} :: ${unit.text.slice(0, 110)}`);
}

mkdirSync(outDir!, { recursive: true });
writeFileSync(
  path.join(outDir!, "source-inventory.json"),
  `${JSON.stringify(
    {
      primarySource: primary.url,
      secondaryPages: secondary.pages.map((page) => page.url),
      totalUnitsCollected: units.length,
      meaningfulUnits: after.sourceMeaningfulUnits,
      units: after.units.map((unit) => ({
        PRODUCT_FACT_CANDIDATE: unit.productFactCandidate,
        SOURCE_UNIT_ID: unit.id,
        SOURCE_TEXT: unit.text,
        SOURCE_LOCATION: unit.location,
        SOURCE_TYPE: unit.type,
        POTENTIAL_TOPIC: unit.topic,
        CURRENT_PRODUCTFACT_MAPPING: unit.mapping ?? "NONE",
        CURRENT_STATUS: unit.status,
        SAFETY_FINDINGS: unit.safetyFindings,
        REASON: unit.reason,
      })),
    },
    null,
    2,
  )}\n`,
  "utf8",
);
writeFileSync(
  path.join(outDir!, "coverage-map.json"),
  `${JSON.stringify(
    {
      before: { ...before, units: undefined },
      after: { ...after, units: undefined },
      beforeStatusCounts: statusCounts(before),
      afterStatusCounts: statusCounts(after),
      factConfidenceBefore: baselineFacts.confidence,
      factConfidenceAfter: afterFacts.confidence,
      copyEligibleManifestBefore: buildGenerationFactManifest(baselineFacts).items.filter((item) => item.copyEligible).length,
      copyEligibleManifestAfter: buildGenerationFactManifest(afterFacts).items.filter((item) => item.copyEligible).length,
      openTopicsBefore: createGenerationPlan(baselineFacts).allowedTopics,
      openTopicsAfter: createGenerationPlan(afterFacts).allowedTopics,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
const gapsBefore = topicGaps(before);
const gapsAfter = topicGaps(after);
console.log("TOPIC_GAPS_AFTER");
for (const gap of gapsAfter) {
  console.log(
    `  ${gap.topic} units=${gap.sourceUnits} eligible=${gap.capturedCopyEligible} lower=${gap.capturedNotCopyEligible} lost=${gap.lostEligible} field=${gap.schemaField ? "Y" : "N"} cause=${gap.cause}`,
  );
}

writeFileSync(
  path.join(outDir!, "coverage-gaps.json"),
  `${JSON.stringify(
    {
      before: gapsBefore,
      after: gapsAfter,
      lostUnitsAfter: after.units
        .filter((unit) => unit.productFactCandidate && isLostEligibleUnit(unit))
        .map((unit) => ({
          SOURCE_UNIT_ID: unit.id,
          TOPIC: unit.topic,
          SOURCE_LOCATION: unit.location,
          FETCHED_BY_IMPORTER: unit.fetchedByImporter ?? false,
          SOURCE_TEXT: unit.text,
        })),
      withheldByPolicyAfter: after.units
        .filter((unit) => unit.productFactCandidate && unit.safetyFindings.length > 0 && !unit.copyEligible)
        .map((unit) => ({
          SOURCE_UNIT_ID: unit.id,
          TOPIC: unit.topic,
          POLICY_FINDINGS: unit.safetyFindings,
          SOURCE_TEXT: unit.text,
        })),
    },
    null,
    2,
  )}\n`,
  "utf8",
);

writeFileSync(
  path.join(outDir!, "reextracted-facts.json"),
  `${JSON.stringify({ facts: afterFacts }, null, 2)}\n`,
  "utf8",
);
console.log(`ARTIFACTS_WRITTEN=${outDir}`);
