import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PORTFOLIO_CONTEXT_MEMBERS } from "../src/lib/opportunity-portfolio/portfolio-context.ts";
import { createOpportunityPortfolioBuilder } from "../src/lib/opportunity-portfolio/portfolio-builder.ts";
import {
  OPPORTUNITY_PORTFOLIO_KEYS,
  PORTFOLIO_EXECUTION_STATISTICS_KEYS,
  PORTFOLIO_GROUP_KEYS,
  PORTFOLIO_RESULT_KEYS,
  PORTFOLIO_SNAPSHOT_KEYS,
} from "../src/lib/opportunity-portfolio/portfolio-snapshot.ts";
import {
  GROUP_DIMENSIONS,
  PORTFOLIO_ORIGINS,
  PORTFOLIO_PROVENANCE,
  PORTFOLIO_STATISTICS_KEYS,
  PORTFOLIO_STATUSES,
  PORTFOLIO_TYPE_NAMES,
} from "../src/lib/opportunity-portfolio/portfolio-types.ts";
import { createOpportunityRankingEngine } from "../src/lib/opportunity-ranking/opportunity-ranking-engine.ts";
import { type OpportunityMetrics } from "../src/lib/opportunity-scoring/opportunity-score-types.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((item) => text.test(`${item.field} ${item.message}`));
const T0 = "2026-01-01T00:00:00.000Z";

function metrics(over: Partial<OpportunityMetrics> = {}): OpportunityMetrics {
  return {
    sponsoredAdvertiserCount: 1,
    uniqueDomainCount: 1,
    uniqueLandingPageCount: 1,
    observedProductCount: 1,
    observedBrandCount: 1,
    observedCategoryCount: 1,
    priceVariance: 0,
    languageConsistency: 1,
    serpCoverage: 1,
    evidenceCompleteness: 1,
    ...over,
  };
}

function rankingOf(ids: string[]) {
  return {
    policyId: "balanced",
    ordered: ids.map((opportunityId, index) => ({ position: index + 1, opportunityId })),
    origin: "OBSERVED" as const,
    provenance: "DIRECT_SOURCE" as const,
  };
}

function builder(idFactory?: () => string) {
  let tick = 0;
  return createOpportunityPortfolioBuilder({ now: () => tick++, timestamp: () => T0, idFactory });
}

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) out.push(...listTs(path));
    else if (name.name.endsWith(".ts")) out.push(path);
  }
  return out;
}

function main() {
  check("statuses are OK and REJECTED", PORTFOLIO_STATUSES.join() === "OK,REJECTED");
  check("origin is OBSERVED and provenance is DIRECT_SOURCE", PORTFOLIO_ORIGINS.join() === "OBSERVED" && PORTFOLIO_PROVENANCE.join() === "DIRECT_SOURCE");
  check("portfolio types are health, beauty, finance, software, pets, education, and custom", PORTFOLIO_TYPE_NAMES.join() === "health,beauty,finance,software,pets,education,custom");
  check("grouping dimensions are the supplied attributes", GROUP_DIMENSIONS.join() === "category,market,language,country,priceRange,brand,merchant,affiliateNetwork,searchIntent");
  check("context members name the ranking and the grouping records", PORTFOLIO_CONTEXT_MEMBERS.join() === "ranking,opportunities,executionMetadata,runtimeMetadata,configuration");

  const ranking = rankingOf(["zebra-offer", "plain-offer", "desk-offer"]);
  const records = [
    { opportunityId: "desk-offer", portfolioTypes: [{ portfolioType: "custom", portfolioId: "outdoor-desk" }], searchIntent: "zebra offer", priceRange: "40-50", country: "US", merchant: "Vendor North", affiliateNetwork: "example-network" },
    { opportunityId: "plain-offer", category: "beauty", language: "en", market: "us" },
    { opportunityId: "zebra-offer", category: "health", language: "en", brand: "North Brand", portfolioTypes: ["health"] },
  ];
  const input = { ranking, opportunities: records, executionMetadata: { note: "kept" } };
  const host = builder();
  const built = host.build(input);
  ranking.ordered[0].position = 9;
  records[2].category = "changed";
  input.executionMetadata.note = "changed";
  const groups = built.portfolio?.portfolios ?? [];
  const group = (dimension: string, value: string) => groups.find((item) => item.dimension === dimension && item.value === value);
  const covered = new Set(groups.flatMap((item) => item.opportunityIds));
  check(
    "ranked opportunities are grouped without a new order",
    built.status === "OK" &&
      built.portfolio?.ordered.map((item) => `${item.position}:${item.opportunityId}`).join() === "1:zebra-offer,2:plain-offer,3:desk-offer" &&
      built.portfolio.policyId === "balanced" &&
      group("category", "health")?.portfolioType === "health" &&
      group("category", "health")?.opportunityIds.join() === "zebra-offer" &&
      group("category", "beauty")?.portfolioType === "beauty" &&
      group("category", "beauty")?.opportunityIds.join() === "plain-offer" &&
      group("language", "en")?.opportunityIds.join() === "zebra-offer,plain-offer" &&
      group("brand", "North Brand")?.value === "North Brand" &&
      group("portfolioType", "health")?.opportunityIds.join() === "zebra-offer" &&
      group("portfolioType", "outdoor-desk")?.portfolioType === "custom" &&
      group("priceRange", "40-50")?.value === "40-50" &&
      group("country", "US")?.value === "US" &&
      group("merchant", "Vendor North")?.value === "Vendor North" &&
      group("affiliateNetwork", "example-network")?.value === "example-network" &&
      group("searchIntent", "zebra offer")?.value === "zebra offer" &&
      group("market", "us")?.opportunityIds.join() === "plain-offer" &&
      covered.has("zebra-offer") &&
      covered.has("plain-offer") &&
      covered.has("desk-offer") &&
      groups.every((item) => new Set(item.opportunityIds).size === item.opportunityIds.length) &&
      built.portfolio.statistics.opportunityCount === 3 &&
      built.portfolio.statistics.portfolioCount === groups.length &&
      built.portfolio.statistics.membershipCount === groups.reduce((sum, item) => sum + item.opportunityIds.length, 0) &&
      built.statistics.portfolioCount === built.portfolio.statistics.portfolioCount &&
      !JSON.stringify(built.portfolio).includes("sponsoredAdvertiserCount") &&
      Object.keys(built).join() === PORTFOLIO_RESULT_KEYS.join() &&
      Object.keys(built.portfolio ?? {}).join() === OPPORTUNITY_PORTFOLIO_KEYS.join() &&
      Object.keys(built.portfolio?.statistics ?? {}).join() === PORTFOLIO_STATISTICS_KEYS.join() &&
      Object.keys(built.statistics).join() === PORTFOLIO_EXECUTION_STATISTICS_KEYS.join() &&
      Object.keys(groups[0] ?? {}).join() === PORTFOLIO_GROUP_KEYS.join() &&
      Object.keys(built.snapshot ?? {}).join() === PORTFOLIO_SNAPSHOT_KEYS.join(),
  );
  check(
    "the snapshot is stored and later input changes leave the ranking and the groups unchanged",
    built.snapshot !== null &&
      host.getSnapshot("opportunity-portfolio-1") === built.snapshot &&
      Object.isFrozen(built.snapshot) &&
      Object.isFrozen(built.portfolio) &&
      built.snapshot?.portfolio.ordered[0]?.position === 1 &&
      built.snapshot?.portfolio.ordered[0]?.opportunityId === "zebra-offer" &&
      group("category", "health")?.opportunityIds.join() === "zebra-offer" &&
      built.snapshot?.metadata.note === "kept",
  );

  const again = builder().build({
    ranking: rankingOf(["zebra-offer", "plain-offer", "desk-offer"]),
    opportunities: records.map((record) => ({ ...record, category: record.opportunityId === "zebra-offer" ? "health" : record.category })),
  });
  check("an independent build keeps its own snapshot", again.status === "OK" && again.snapshot !== built.snapshot && again.portfolio?.ordered.map((item) => item.opportunityId).join() === "zebra-offer,plain-offer,desk-offer");

  const named = builder().build({
    ranking: rankingOf(["plain-offer"]),
    opportunities: [{ opportunityId: "plain-offer", portfolioTypes: ["finance", "software", "pets", "education"] }],
  });
  check(
    "finance, software, pets, and education are separate portfolios",
    named.status === "OK" && named.portfolio?.portfolios.map((item) => item.value).join() === "finance,software,pets,education" && named.portfolio.portfolios.every((item) => item.portfolioType === item.value && item.opportunityIds.join() === "plain-offer"),
  );

  const ranked = createOpportunityRankingEngine({ now: () => 0, timestamp: () => T0 }).rank({
    opportunities: [
      { opportunityId: "zebra-offer", metrics: metrics({ evidenceCompleteness: 1 }) },
      { opportunityId: "plain-offer", metrics: metrics({ evidenceCompleteness: 0.2 }) },
    ],
    policy: "balanced",
  });
  const before = JSON.stringify(ranked.ranking);
  const fromRanking = builder().build({
    ranking: ranked.ranking,
    opportunities: [
      { opportunityId: "plain-offer", category: "beauty" },
      { opportunityId: "zebra-offer", category: "health" },
    ],
  });
  check(
    "a ranking result is grouped and the ranking stays as it was",
    ranked.status === "OK" &&
      fromRanking.status === "OK" &&
      JSON.stringify(ranked.ranking) === before &&
      fromRanking.portfolio?.ordered.map((item) => `${item.position}:${item.opportunityId}`).join() === ranked.ranking?.ordered.map((item) => `${item.position}:${item.opportunityId}`).join() &&
      fromRanking.portfolio?.portfolios.find((item) => item.value === "health")?.opportunityIds.join() === "zebra-offer",
  );

  const missing = builder().build({ ranking: null, opportunities: [] });
  check("a missing ranking stores nothing", missing.status === "REJECTED" && has(missing.issues, /Missing Opportunity Ranking/) && missing.snapshot === null && missing.portfolio === null);

  const duplicate = builder().build({
    ranking: {
      policyId: "balanced",
      ordered: [
        { position: 1, opportunityId: "plain-offer" },
        { position: 2, opportunityId: "plain-offer" },
      ],
      origin: "OBSERVED",
      provenance: "DIRECT_SOURCE",
    },
    opportunities: [{ opportunityId: "plain-offer", category: "health" }],
  });
  check("duplicate opportunities store nothing", duplicate.status === "REJECTED" && has(duplicate.issues, /Duplicate Opportunities/) && duplicate.snapshot === null);

  const invalid = builder().build({
    ranking: rankingOf(["plain-offer"]),
    opportunities: [{ opportunityId: "plain-offer", portfolioTypes: ["best"] }],
  });
  check("an invalid portfolio stores nothing", invalid.status === "REJECTED" && has(invalid.issues, /Invalid Portfolio/) && invalid.snapshot === null);

  const ungrouped = builder().build({
    ranking: rankingOf(["plain-offer"]),
    opportunities: [{ opportunityId: "plain-offer" }],
  });
  check("an opportunity with no group stores nothing", ungrouped.status === "REJECTED" && has(ungrouped.issues, /Invalid Portfolio/) && ungrouped.snapshot === null);

  const nested = builder().build({
    ranking: rankingOf(["plain-offer"]),
    opportunities: [{ opportunityId: "plain-offer", category: "health" }],
    configuration: { nested: { inner: true } },
  });
  check("nested metadata stores nothing", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/) && nested.snapshot === null);

  const badId = builder(() => "BAD").build({
    ranking: rankingOf(["plain-offer"]),
    opportunities: [{ opportunityId: "plain-offer", category: "health" }],
  });
  check("a corrupted build id stores nothing", badId.status === "REJECTED" && has(badId.issues, /Invalid Metadata/) && badId.snapshot === null && builder().getSnapshot("opportunity-portfolio-1") === null);

  const dir = join(process.cwd(), "src/lib/opportunity-portfolio");
  const names = [
    "portfolio-builder.ts",
    "portfolio.ts",
    "portfolio-validator.ts",
    "portfolio-types.ts",
    "portfolio-context.ts",
    "portfolio-snapshot.ts",
  ];
  check("six portfolio modules exist", names.every((name) => readdirSync(dir).includes(name)));
  const bundled = names.map((name) => readFileSync(join(dir, name), "utf8")).join("\n");
  const isCode = (line: string) => !/^\s*(\/\/|\/\*|\*)/.test(line);
  const code = bundled.split(/\r?\n/).filter(isCode);
  check("no product names", !bundled.split(/\r?\n/).some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line)));
  check("the builder does not retrieve a page or call a model", !code.some((line) => /fetch\(|searchapi\.io|process\.env|anthropic|openai|clickbank|product-intelligence|google-ads/i.test(line)));
  check("no reordering, hidden weights, or outside catalogs in code", !code.some((line) => /\.sort\(|Math\.random|campaign|recommend|\bdecision\b|\bweight\b|\brank\b/i.test(line)));
  check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "portfolio-context.ts"), "utf8")));
  check("the portfolio modules do not import another host", !/from\s+["']\.\.\//.test(bundled));
  const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform", "product-intelligence", "market-discovery", "search-intelligence", "search-provider", "real-landing-page", "real-product", "real-market-report", "opportunity-scoring", "opportunity-ranking"];
  for (const folder of folders) {
    const sources = listTs(join(process.cwd(), "src/lib", folder));
    check(`${folder} modules do not import the portfolio builder`, !sources.some((file) => /opportunity-portfolio/.test(readFileSync(file, "utf8"))));
  }

  if (failures > 0) {
    console.log(`OPPORTUNITY_PORTFOLIO_FAILURES=${failures}`);
    process.exit(1);
  }
  console.log("OPPORTUNITY_PORTFOLIO_FAILURES=0");
}

main();
