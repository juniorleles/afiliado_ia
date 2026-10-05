import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createProductAnalysisPipeline } from "../src/lib/product-intelligence/product-analysis-pipeline.ts";
import { PRODUCT_ANALYSIS_STAGES, PRODUCT_ANALYSIS_SNAPSHOT_KEYS, PRODUCT_ANALYSIS_STATUSES, PRODUCT_ANALYSIS_WORKFLOW_ID } from "../src/lib/product-intelligence/product-analysis-snapshot.ts";
import { createProductAnalysisRecorder } from "../src/lib/product-intelligence/product-analysis-recorder.ts";
import { createProductAnalysisValidator } from "../src/lib/product-intelligence/product-analysis-validator.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));

function marketplaceHtml() {
  return `
<dl>
  <dt>Product Name</dt><dd>Alpha Tonic</dd>
  <dt>Vendor</dt><dd>Vendor North</dd>
  <dt>Vendor ID</dt><dd>vendor-north</dd>
  <dt>Category</dt><dd>Health &amp; Fitness</dd>
  <dt>Gravity</dt><dd>12.5</dd>
  <dt>Initial $/sale</dt><dd>$47.00</dd>
  <dt>Avg $/sale</dt><dd>$51.25</dd>
  <dt>Avg $/rebill</dt><dd>$19.00</dd>
  <dt>Commission Type</dt><dd>recurring</dd>
  <dt>Language</dt><dd>English</dd>
  <dt>Affiliate Page</dt><dd>https://example.test/offer/alpha</dd>
  <dt>Support URL</dt><dd>https://example.test/support</dd>
  <dt>Refund Policy</dt><dd>60-day refund window as stated by the vendor</dd>
  <dt>Description</dt><dd>A restated marketplace description.</dd>
  <dt>Disclaimer</dt><dd>Statements on the marketplace page are seller claims.</dd>
  <dt>Affiliate Resources</dt><dd>https://example.test/resources/one, https://example.test/resources/two</dd>
</dl>`;
}

function landingHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <title>Alpha Offer</title>
  <meta name="description" content="A restated destination page.">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="canonical" href="https://example.test/offer/alpha">
</head>
<body>
  <h1 data-field="headline">Alpha Offer</h1>
  <a data-field="primaryCta" class="cta" href="#buy">Get Alpha</a>
  <p data-field="price">$47.00</p>
  <p data-field="guarantee">60-day refund as stated on the page.</p>
  <span data-field="trust">secure checkout badge</span>
</body>
</html>`;
}

function searchHtml() {
  return `<div>
  <a data-field="organic" href="https://example.test/offer/alpha">A restated organic result</a>
  <a data-field="officialWebsite" href="https://example.test/offer/alpha">Official site</a>
  <a data-field="marketplace" href="https://example.test/marketplace/alpha">Marketplace listing</a>
  <p data-field="faq">What is the offer?</p>
  <a data-field="sponsored" data-advertiser="official" href="https://example.test/offer/alpha">Official</a>
  <a data-field="sponsored" data-advertiser="affiliate" href="https://hops.example.test/a">Affiliate</a>
</div>`;
}

function inputOf(over: Record<string, unknown> = {}) {
  return {
    marketplaceUrl: "https://example.test/marketplace/alpha-1",
    marketplaceProductId: "alpha-1",
    rawHtml: marketplaceHtml(),
    landingHtml: landingHtml(),
    searchContext: searchHtml(),
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "m1" },
    ...over,
  };
}

function pipelineOf() {
  return createProductAnalysisPipeline({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => "analysis-1",
  });
}

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) out.push(...listTs(p));
    else if (name.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

const validator = createProductAnalysisValidator();
check("statuses are OK and REJECTED", PRODUCT_ANALYSIS_STATUSES.join() === "OK,REJECTED");
check(
  "stages follow the business flow",
  PRODUCT_ANALYSIS_STAGES.join() ===
    "ClickBankImporter,LandingPageIntelligence,GoogleSearchIntelligence,CompetitionIntelligence,CommercialIntelligence,ProductIntelligenceReport,Discovery,Opportunity,Traffic,Decision,Workflow,ExecutionPlanner,GoogleAdsCampaignBuilder",
);
check("snapshot keys are analysis id, product name, landing page, created at, and metadata", PRODUCT_ANALYSIS_SNAPSHOT_KEYS.join() === "analysisId,productName,landingPage,createdAt,metadata");
check("Missing ProductFacts: a missing record is rejected", has(validator.validateInput(null), /Missing ProductFacts/));
check("Invalid Metadata: a nested record is rejected", has(validator.validateInput(inputOf({ executionMetadata: { nested: { a: 1 } } })), /Invalid Metadata/));
check("Invalid Metadata: an unexpected member is rejected", has(validator.validateInput(inputOf({ extra: true })), /Invalid Metadata/));
const repeated = PRODUCT_ANALYSIS_STAGES.map((stage) => ({ stage, count: stage === "Discovery" ? 2 : 1 }));
check("a repeated module is rejected", has(validator.validateExecutions(repeated), /Discovery" must execute once/));

const recorder = createProductAnalysisRecorder();
recorder.record("ClickBankImporter");
check("the recorder counts one stage and leaves the rest at zero", recorder.executions()[0]?.count === 1 && recorder.executions().slice(1).every((entry) => entry.count === 0));

async function main() {
const built = await pipelineOf().run(inputOf());
if (built.status !== "OK") console.log(JSON.stringify({ issues: built.issues, executions: built.executions }, null, 2));
check("a complete walk returns OK", built.status === "OK" && built.issues.length === 0 && built.analysis !== null && built.snapshot !== null);
check("every module executes once", built.executions.length === PRODUCT_ANALYSIS_STAGES.length && built.executions.every((entry) => entry.count === 1));
check("ProductFacts stay the imported record", built.analysis?.productFacts.productName === "Alpha Tonic" && built.analysis?.productFacts.affiliatePage === "https://example.test/offer/alpha");
check("the evidence graph is present", Array.isArray(built.analysis?.evidenceGraph.nodes) && (built.analysis?.evidenceGraph.nodes as unknown[]).length === 5);
check("discovery restates the candidate", built.analysis?.discovery.id === "alpha-tonic" && built.analysis?.discovery.status === "NEW" && built.analysis?.discovery.source === "product-intelligence");
check("opportunity and traffic analyses completed", built.analysis?.opportunityAnalysis.status === "COMPLETED" && built.analysis?.trafficAnalysis.status === "COMPLETED");
check("decision analysis is present", typeof built.analysis?.decisionAnalysis.analysisId === "string" && built.analysis?.decisionAnalysis.analysisId === "decision-1");
check("workflow moved from created to discovered", built.analysis?.workflow.currentState === "DISCOVERED" && built.analysis?.workflow.previousState === "CREATED");
check("execution plan is ready", built.analysis?.executionPlan.id === "plan-1" && built.analysis?.executionPlan.workflowSnapshotId === PRODUCT_ANALYSIS_WORKFLOW_ID);
check(
  "google ads draft is offline",
  built.analysis?.googleAdsDraft.id === "campaign-1" &&
    built.analysis?.googleAdsDraft.executionPlanId === "plan-1" &&
    built.analysis?.googleAdsDraft.decisionAnalysisId === "decision-1" &&
    built.analysis?.googleAdsDraft.workflowSnapshotId === PRODUCT_ANALYSIS_WORKFLOW_ID &&
    Array.isArray(built.analysis?.googleAdsDraft.campaigns) &&
    (built.analysis?.googleAdsDraft.campaigns as { id: string; name: string }[])[0]?.id === "campaign-draft" &&
    (built.analysis?.googleAdsDraft.campaigns as { name: string }[])[0]?.name === "search",
);
check("execution metadata is restated", built.metadata.run === "r1" && built.analysis?.executionMetadata.run === "r1");
check("the snapshot names the product and the landing page", built.snapshot?.analysisId === "analysis-1" && built.snapshot?.productName === "Alpha Tonic" && built.snapshot?.landingPage === "https://example.test/offer/alpha" && built.snapshot?.metadata.modules === 13);

const source = inputOf();
const observed = await pipelineOf().run(source);
source.rawHtml = "changed";
source.landingHtml = "changed";
source.searchContext = "changed";
(source.executionMetadata as { run: string }).run = "changed";
try {
  (observed.analysis!.productFacts.productName as string) = "hacked";
  (observed.analysis!.evidenceGraph as { nodes: unknown }).nodes = [];
  (observed.analysis!.decisionAnalysis as { analysisId: string }).analysisId = "hacked";
  (observed.analysis!.workflow as { currentState: string }).currentState = "hacked";
  (observed.analysis!.executionPlan as { id: string }).id = "hacked";
  (observed.analysis!.googleAdsDraft as { id: string }).id = "hacked";
  (observed.snapshot!.productName as string) = "hacked";
} catch {
  /* frozen */
}
check(
  "No mutation: changing the input leaves ProductFacts, the graph, the decision, the workflow, the plan, and the draft unchanged",
  observed.analysis?.productFacts.productName === "Alpha Tonic" &&
    (observed.analysis?.evidenceGraph.nodes as unknown[]).length === 5 &&
    observed.analysis?.decisionAnalysis.analysisId === "decision-1" &&
    observed.analysis?.workflow.currentState === "DISCOVERED" &&
    observed.analysis?.executionPlan.id === "plan-1" &&
    observed.analysis?.googleAdsDraft.id === "campaign-1" &&
    observed.metadata.run === "r1" &&
    observed.snapshot?.productName === "Alpha Tonic",
);
check(
  "immutable artifacts stay frozen",
  observed.analysis !== null && validator.validateArtifacts(observed.analysis).length === 0,
);

const left = pipelineOf();
const right = pipelineOf();
await left.run(inputOf());
await right.run(null);
check("Independent pipeline: pipelines do not share snapshots", left.getSnapshot("analysis-1")?.productName === "Alpha Tonic" && right.getSnapshot("analysis-1") === null);

const again = await pipelineOf().run(inputOf());
check(
  "deterministic pipeline: a second walk matches the first",
  JSON.stringify({
    status: again.status,
    name: again.snapshot?.productName,
    page: again.snapshot?.landingPage,
    decision: again.analysis?.decisionAnalysis.analysisId,
    plan: again.analysis?.executionPlan.id,
    draft: again.analysis?.googleAdsDraft.id,
    workflow: again.analysis?.workflow.currentState,
    counts: again.executions.map((entry) => entry.count),
  }) ===
    JSON.stringify({
      status: built.status,
      name: built.snapshot?.productName,
      page: built.snapshot?.landingPage,
      decision: built.analysis?.decisionAnalysis.analysisId,
      plan: built.analysis?.executionPlan.id,
      draft: built.analysis?.googleAdsDraft.id,
      workflow: built.analysis?.workflow.currentState,
      counts: built.executions.map((entry) => entry.count),
    }),
);

const missing = await pipelineOf().run(null);
check("a missing product stores no snapshot", missing.status === "REJECTED" && has(missing.issues, /Missing ProductFacts/) && missing.snapshot === null && missing.executions.every((entry) => entry.count === 0));
const nested = await pipelineOf().run(inputOf({ configuration: { nested: { a: 1 } } }));
check("invalid metadata stores no snapshot", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/) && nested.snapshot === null);
const emptyHtml = await pipelineOf().run(inputOf({ rawHtml: "<p>no labeled fields</p>" }));
check(
  "a refused importer stops the later modules",
  emptyHtml.status === "REJECTED" && emptyHtml.executions.find((entry) => entry.stage === "ClickBankImporter")?.count === 1 && emptyHtml.executions.filter((entry) => entry.stage !== "ClickBankImporter").every((entry) => entry.count === 0) && emptyHtml.snapshot === null,
);

const dir = join(process.cwd(), "src/lib/product-intelligence");
const files = readdirSync(dir).filter((f) => /^product-analysis-[a-z]+\.ts$/.test(f));
check(
  "five product analysis modules exist: pipeline, recorder, runner, snapshot, validator",
  files.sort().join() === "product-analysis-pipeline.ts,product-analysis-recorder.ts,product-analysis-runner.ts,product-analysis-snapshot.ts,product-analysis-validator.ts",
);
const lines = files.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
const code = lines.filter(isCode);
const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
const bare = code.map(stripStrings);
check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
check("no live fetch in code", !code.some((l) => /fetch\(|oauth|googleapis|access_token|node:http|node:https|Authorization:|upload\(|retry|rate.?limit|Promise\.all/i.test(l)));
check("no scoring, ranking, weights, formulas, recommendations, or optimization in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend|optimiz/i.test(l)));
check("no AI, network, database, file access, or timers in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
const runner = readFileSync(join(dir, "product-analysis-runner.ts"), "utf8");
check("the runner calls the campaign builder and not a publisher, transport, sign-in, or client", /google-ads-campaign-builder/.test(runner) && !/google-ads-campaign-publisher|google-ads-publish|google-ads-transport|google-ads-authentication|google-ads-client/.test(runner));
const prefixes = ["clickbank", "landing-page", "google-search", "competition", "commercial", "product-report", "product-opportunity"];
for (const prefix of prefixes) {
  const siblings = readdirSync(dir).filter((f) => new RegExp(`^${prefix}[a-z-]*\\.ts$`).test(f) && !f.startsWith("product-analysis-"));
  check(`${prefix} modules do not import the product analysis pipeline`, siblings.every((f) => !/product-analysis-/.test(readFileSync(join(dir, f), "utf8"))));
}
const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform"];
for (const folder of folders) {
  const sources = listTs(join(process.cwd(), "src/lib", folder));
  check(`${folder} modules do not import the product analysis pipeline`, !sources.some((f) => /product-analysis-/.test(readFileSync(f, "utf8"))));
}

if (failures > 0) {
  console.log(`PRODUCT_ANALYSIS_FAILURES=${failures}`);
  process.exit(1);
}
console.log("PRODUCT_ANALYSIS_FAILURES=0");
}

main();
