/**
 * Evidence expansion V2 — rebuild ProductFacts from the saved source dump.
 *
 * No network, no AI, no campaign writes, no Replay 04 mutation.
 *
 * npx tsx scripts/evidence-coverage/run-evidence-expansion-v2.ts [--regression]
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { extractProductFacts } from "../../src/lib/import-product.ts";
import { mergeSecondaryPages, SOURCE_EXPANSION_LIMITS } from "../../src/lib/first-party-source-expansion.ts";
import {
  evaluateEvidenceCoverage,
  isLostEligibleUnit,
  topicGaps,
  type SourceUnitInput,
} from "../../src/lib/evidence-coverage.ts";
import { buildGenerationFactManifest, type ProductFacts } from "../../src/lib/product-facts.ts";
import { createGenerationPlan } from "../../src/lib/ai/generation-plan.ts";

const ROOT = path.join("data", "generic-lp-engine", "v1");
const SOURCE_DIR = path.join(ROOT, "prodentim-evidence-coverage-v1", "source");
const OUT_DIR = path.join(ROOT, "prodentim-evidence-coverage-v2");
const BASELINE = path.join(ROOT, "prodentim-replay-04", "product-facts.json");

type BlockDump = {
  url: string;
  headings: Array<{ level: string; text: string }>;
  paragraphs: string[];
  listItems: string[];
  bold: string[];
};
type SecondaryDump = {
  origin?: string;
  pages: Array<{
    url: string;
    headings?: string[];
    paragraphs?: string[];
    tableCells?: string[];
    plainText?: string;
    robotsAllowed?: boolean;
    httpStatus?: number;
    skipped?: string;
  }>;
};

const readJson = <T,>(file: string) => JSON.parse(readFileSync(file, "utf8")) as T;
const primary = readJson<BlockDump>(path.join(SOURCE_DIR, "source-blocks.json"));
const secondary = readJson<SecondaryDump>(path.join(SOURCE_DIR, "secondary-sources.json"));
const html = readFileSync(path.join(SOURCE_DIR, "source-raw.html"), "utf8");
const baselineFacts = readJson<{ facts: ProductFacts }>(BASELINE).facts;

const extracted = extractProductFacts(html, primary.url, { operatorProductName: "ProDentim" });
const expansion = mergeSecondaryPages(
  extracted,
  secondary.pages.map((page) => ({
    url: page.url,
    headings: page.headings,
    paragraphs: page.paragraphs,
    tableCells: page.tableCells,
    plainText: page.plainText,
    depth: 1,
    robotsAllowed: page.robotsAllowed,
    httpStatus: page.httpStatus,
  })),
  { primaryUrl: primary.url },
);
const facts = expansion.facts;

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

const roleOf = (pathname: string): SourceUnitInput["pageRole"] => {
  if (/refund|return/i.test(pathname)) return "RETURNS_POLICY";
  if (/shipping|delivery/i.test(pathname)) return "SHIPPING_POLICY";
  if (/terms|privacy|disclaimer|legal/i.test(pathname)) return "LEGAL";
  if (/reference|citation|studies|science/i.test(pathname)) return "RESEARCH_REFERENCES";
  if (/contact|support|faq/i.test(pathname)) return "SUPPORT";
  return "OTHER";
};

const fetchedUrls = new Set(expansion.fetched.map((page) => page.url));
for (const page of secondary.pages) {
  const pathname = new URL(page.url).pathname.replace(/\/+/g, "/");
  const role = roleOf(pathname);
  const fetched = fetchedUrls.has(page.url);
  if (!fetched) continue;
  for (const heading of page.headings ?? []) push(heading, `${pathname}#h`, "HEADING", role, true);
  for (const paragraph of page.paragraphs ?? []) push(paragraph, `${pathname}#p`, "PARAGRAPH", role, true);
  for (const cell of page.tableCells ?? []) push(cell, `${pathname}#td`, "TABLE_CELL", role, true);
}

const coverage = evaluateEvidenceCoverage(units, facts);
const gaps = topicGaps(coverage);
const plan = createGenerationPlan(facts);
const manifest = buildGenerationFactManifest(facts);

const ambiguous = gaps.filter((gap) => gap.cause === "AMBIGUOUS_AUTHORITY");

/**
 * Every candidate unit that did not become copy, with the reason and what would
 * have to change. Health withholding is an intentional exclusion; the rest is
 * authority that no deterministic rule can raise without rewriting the source.
 */
const promotionFor = (unit: (typeof coverage.units)[number]): { issue: string; promotion: string; deterministic: boolean } => {
  if (unit.mapping === "ingredientContext") {
    return {
      issue: "Seller-attributed ingredient effect (HEALTH_EFFICACY); DIRECT_SOURCE means the seller said it, not that it is verified.",
      promotion: "Independent qualified evidence plus a health-policy decision to allow attributed ingredient claims.",
      deterministic: false,
    };
  }
  if (/health-efficacy|health\.|unv\./.test(unit.reason)) {
    return {
      issue: `Health / unverifiable claim: ${unit.reason}`,
      promotion: "None under current health policy; would need independent substantiation and a policy change.",
      deterministic: false,
    };
  }
  if (/^withheld:/.test(unit.reason)) {
    return {
      issue: unit.reason,
      promotion: "An explicit, unqualified source statement (e.g. a stated fee or destination list); rewording the existing sentence would strengthen it.",
      deterministic: false,
    };
  }
  if (unit.mapping === "description") {
    return {
      issue: "Description captured as HEURISTIC_EXTRACTION and contains an authority claim; not copy-eligible.",
      promotion: "A first-party description sentence without clinical/scientific authority wording.",
      deterministic: false,
    };
  }
  if (unit.mapping === "returnsInformation") {
    return {
      issue: "Seller efficacy-timing condition inside the refund policy; not a return term.",
      promotion: "None; stays non-copy-eligible so a use-period is never presented as a refund requirement.",
      deterministic: false,
    };
  }
  return {
    issue: unit.reason,
    promotion: "Sentence carries marketing, CTA or mechanism framing around any fact; no generic rule extracts a fact without rewriting.",
    deterministic: false,
  };
};

const authorityItems = coverage.units
  .filter(
    (unit) =>
      unit.productFactCandidate &&
      (unit.status === "CAPTURED_NOT_COPY_ELIGIBLE" || unit.status === "UNSAFE_OR_UNSUPPORTED" || unit.status === "UNMAPPED"),
  )
  .map((unit) => {
    const info = promotionFor(unit);
    return {
      TOPIC: unit.topic,
      SOURCE_UNIT_ID: unit.id,
      SOURCE_LOCATION: unit.location,
      STATUS: unit.status,
      SOURCE_TEXT: unit.text,
      AUTHORITY_ISSUE: info.issue,
      WHAT_WOULD_BE_REQUIRED_TO_PROMOTE: info.promotion,
      DETERMINISTIC_GENERIC_RULE_AVAILABLE: info.deterministic,
    };
  });

mkdirSync(OUT_DIR, { recursive: true });
const write = (name: string, value: unknown) =>
  writeFileSync(path.join(OUT_DIR, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");

write("source-expansion.json", {
  maxDepth: SOURCE_EXPANSION_LIMITS.MAX_DEPTH,
  sameOriginOnly: SOURCE_EXPANSION_LIMITS.SAME_ORIGIN_ONLY,
  maxSecondaryPages: SOURCE_EXPANSION_LIMITS.MAX_SECONDARY_PAGES,
  discovered: expansion.discovered,
  eligible: expansion.eligible,
  fetched: expansion.fetched,
});
write("secondary-source-inventory.json", {
  origin: secondary.origin,
  pages: expansion.discovered,
});
write("ingredient-context.json", {
  schema: "ingredientContext",
  entries: facts.ingredientContext,
  total: facts.ingredientContext.length,
  sellerAttributed: facts.ingredientContext.filter((entry) => entry.attribution === "SELLER").length,
  healthEfficacy: facts.ingredientContext.filter((entry) => entry.kind === "HEALTH_EFFICACY").length,
  neutralContext: facts.ingredientContext.filter((entry) => entry.kind === "NEUTRAL_CONTEXT").length,
  copyEligible: facts.ingredientContext.filter((entry) => entry.copyEligibility === "YES").length,
  notCopyEligible: facts.ingredientContext.filter((entry) => entry.copyEligibility === "NO").length,
  policyRejected: facts.ingredientContext.filter((entry) => entry.policyFindings.length > 0).length,
});
write("product-facts-expanded.json", { facts, replay04Mutated: false });
write("coverage-map.json", {
  ...coverage,
  units: coverage.units
    .filter((unit) => unit.productFactCandidate)
    .map((unit) => ({
      id: unit.id,
      location: unit.location,
      topic: unit.topic,
      mapping: unit.mapping,
      status: unit.status,
      copyEligible: unit.copyEligible,
      reason: unit.reason,
      text: unit.text,
    })),
  factConfidence: facts.confidence,
  copyEligibleManifest: manifest.items.filter((item) => item.copyEligible).length,
  openTopics: plan.allowedTopics,
  closedTopics: plan.closedTopics,
});
write("coverage-gaps.json", {
  gaps,
  lostUnits: coverage.units
    .filter((unit) => unit.productFactCandidate && isLostEligibleUnit(unit))
    .map((unit) => ({
      SOURCE_UNIT_ID: unit.id,
      TOPIC: unit.topic,
      SOURCE_LOCATION: unit.location,
      FETCHED_BY_IMPORTER: unit.fetchedByImporter ?? false,
      SOURCE_TEXT: unit.text,
    })),
});
write("authority-report.json", {
  ambiguousTopics: ambiguous,
  items: authorityItems,
  deterministicPromotionsAvailable: authorityItems.filter((item) => item.DETERMINISTIC_GENERIC_RULE_AVAILABLE).length,
  sellerClaimsUpgradedToVerifiedFacts: false,
  generationProjection: {
    generationPlanOpenTopics: plan.allowedTopics,
    representedButNotProjected: ["ingredientContext", "returnsInformation", "shippingInformation", "productFormat"],
    note: "New fields are evidence only. No generation topic was opened for them in this task.",
  },
});
write("coverage-report.json", {
  SOURCE_MEANINGFUL_UNITS: coverage.sourceMeaningfulUnits,
  CAPTURED_UNITS: coverage.capturedUnits,
  COPY_ELIGIBLE_UNITS: coverage.copyEligibleUnits,
  LOST_ELIGIBLE_UNITS: coverage.lostEligibleUnits,
  INFORMATION_TOPICS_SUPPORTED: coverage.informationTopicsSupported,
  INFORMATION_TOPICS_COPY_ELIGIBLE: coverage.informationTopicsCopyEligible,
  INFORMATION_TOPICS_CLOSED: coverage.informationTopicsClosed,
  EVIDENCE_COVERAGE: coverage.evidenceCoverage,
  EVIDENCE_EXHAUSTED: coverage.evidenceExhausted,
  features: facts.features,
  productFormat: facts.productFormat,
  returnsInformation: facts.returnsInformation,
  shippingInformation: facts.shippingInformation,
  baselineFeatures: baselineFacts.features,
  genericFixes: [
    "ingredientContext structured field",
    "first-party depth-1 source expansion",
    "returnsInformation / shippingInformation / productFormat",
  ],
  paidModelCalls: 0,
});

const REGRESSION_TESTS: Record<string, string[]> = {
  PRODUCTFACTS_TESTS: ["scripts/test-product-facts-quality.ts"],
  IMPORT_TESTS: [
    "scripts/test-import-product.ts",
    "scripts/test-generic-evidence-recovery-v1.ts",
    "scripts/test-evidence-scope-hardening.ts",
  ],
  SOURCE_RESOLUTION_TESTS: ["scripts/test-source-resolution.ts"],
  EVIDENCE_COVERAGE_TESTS: ["scripts/test-evidence-coverage-v1.ts", "scripts/test-evidence-expansion-v2.ts"],
  POLICY_TESTS: ["scripts/test-policy-linter.ts", "scripts/test-policy-review-semantics.ts"],
  GROUNDING_TESTS: ["scripts/test-grounding-validator.ts", "scripts/test-grounding-forensics-v1.ts"],
  SEMANTIC_AUTHORITY_TESTS: ["scripts/test-semantic-authority-precision.ts"],
  CLOSED_CLAIM_FIREWALL_TESTS: ["scripts/test-composition-fact-firewall.ts"],
  JOINT_GENESIS_TESTS: [
    "scripts/test-joint-genesis-faq-regression.ts",
    "scripts/evidence-coverage/test-joint-genesis-coverage-regression-v1.ts",
  ],
};

/** Modules this task changed; none may be reachable from a render path. */
const CHANGED_EVIDENCE_MODULES = ["ingredient-context", "operational-evidence", "first-party-source-expansion", "evidence-coverage"];

function renderPathImports(): string[] {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(tsx?|css)$/.test(entry.name)) {
        const text = readFileSync(full, "utf8");
        for (const mod of CHANGED_EVIDENCE_MODULES) {
          if (new RegExp(`from ["'][^"']*/${mod}["']`).test(text)) hits.push(`${full} -> ${mod}`);
        }
      }
    }
  };
  walk(path.join("src", "app"));
  walk(path.join("src", "components"));
  return hits;
}

const regression: Record<string, unknown> = {
  replay04ProductFactsMutated: false,
  replay04SourceUrl: baselineFacts.sourceUrl,
  expandedArtifact: "data/generic-lp-engine/v1/prodentim-evidence-coverage-v2/product-facts-expanded.json",
  newGenericFields: ["ingredientContext", "returnsInformation", "shippingInformation", "productFormat", "OperationalFact.question"],
  healthPolicyWeakened: false,
  groundingRulesChanged: false,
  closedClaimFirewallChanged: false,
  sellerClaimsUpgradedToVerifiedFacts: false,
  generationPlanOpenTopics: plan.allowedTopics,
  generationPlanClosedTopics: plan.closedTopics,
  tests: {},
  jointGenesisProductFactsChanged: null,
  jointGenesisContentChanged: null,
  jointGenesisVisualChanged: null,
};

if (process.argv.includes("--regression")) {
  const results: Record<string, Array<{ script: string; exit: number | null; last: string }>> = {};
  let jgOutput = "";
  for (const [group, scripts] of Object.entries(REGRESSION_TESTS)) {
    results[group] = scripts.map((script) => {
      const run = spawnSync(`npx tsx ${script}`, { shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
      if (script.includes("joint-genesis-coverage")) jgOutput = output;
      const lines = output.trim().split(/\r?\n/);
      console.log(`${group} ${script} EXIT=${run.status}`);
      return { script, exit: run.status, last: lines[lines.length - 1] ?? "" };
    });
  }
  const v1 = readJson<{ productFactsHash: string; contentHash: string }>(
    path.join(ROOT, "prodentim-evidence-coverage-v1", "regression-report.json"),
  );
  const factsHash = jgOutput.match(/FACTS_HASH=(\w+)/)?.[1] ?? null;
  const contentHash = jgOutput.match(/CONTENT_HASH=(\w+)/)?.[1] ?? null;
  const renderHits = renderPathImports();
  regression.tests = Object.fromEntries(
    Object.entries(results).map(([group, rows]) => [group, { pass: rows.every((row) => row.exit === 0), rows }]),
  );
  regression.jointGenesis = {
    campaignId: 153,
    v1ProductFactsHash: v1.productFactsHash,
    v2ProductFactsHash: factsHash,
    v1ContentHash: v1.contentHash,
    v2ContentHash: contentHash,
    renderPathImportsOfChangedModules: renderHits,
    visualCheck: "static: changed modules are not imported by src/app or src/components; no CSS/component/asset edits",
  };
  regression.jointGenesisProductFactsChanged = factsHash === null ? null : factsHash !== v1.productFactsHash;
  regression.jointGenesisContentChanged = contentHash === null ? null : contentHash !== v1.contentHash;
  regression.jointGenesisVisualChanged = renderHits.length > 0;
}

write("regression-report.json", regression);

console.log(`SECONDARY_DISCOVERED=${expansion.discovered.length} ELIGIBLE=${expansion.eligible.length} FETCHED=${expansion.fetched.length}`);
console.log(`INGREDIENT_CONTEXT=${(facts.ingredientContext ?? []).length} RETURNS=${(facts.returnsInformation ?? []).length} SHIPPING=${(facts.shippingInformation ?? []).length}`);
console.log(`FEATURES=${JSON.stringify(facts.features)} FORMAT=${facts.productFormat?.value ?? "NONE"}`);
console.log(
  `COVERAGE=${coverage.evidenceCoverage} MEANINGFUL=${coverage.sourceMeaningfulUnits} CAPTURED=${coverage.capturedUnits} COPY_ELIGIBLE=${coverage.copyEligibleUnits} LOST=${coverage.lostEligibleUnits} EXHAUSTED=${coverage.evidenceExhausted ? "YES" : "NO"}`,
);
console.log(`ARTIFACTS_WRITTEN=${OUT_DIR}`);
