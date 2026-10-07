import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { analyzeImportCompleteness } from "../src/lib/completeness-engine.ts";
import { predictLpQuality } from "../src/lib/lp-quality-predictor.ts";
import { classifyMarketSourceDetailed } from "../src/lib/market-research/classify.ts";
import {
  MARKET_INTENT_KINDS,
  MARKET_RESEARCH_QUALITIES,
  MARKET_RESEARCH_STATUSES,
  MARKET_SOURCE_CLASSES,
  type MarketResearchReport,
} from "../src/lib/market-research/types.ts";
import { planPresentation } from "../src/lib/presentation-plan.ts";
import { analyzeProductProfile } from "../src/lib/product-profile.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { analyzeEvidence } from "../src/lib/opportunity/evidence-analyzer.ts";
import { registerEvidenceSignal } from "../src/lib/opportunity/evidence-signal.ts";
import { registerLandingPagePotentialSignal } from "../src/lib/opportunity/landing-page-potential-signal.ts";
import type { LandingPagePotentialInputs } from "../src/lib/opportunity/landing-page-potential-result.ts";
import { CompetitionInputError, SELLER_PLATFORM_REASON, analyzeCompetition } from "../src/lib/opportunity/competition-analyzer.ts";
import { COMPETITION_DIMENSIONS, competitionResultToSignalOutput, type CompetitionDimension } from "../src/lib/opportunity/competition-result.ts";
import {
  COMPETITION_SIGNAL_ID,
  createCompetitionSignal,
  defaultCompetitionContextFactory,
  registerCompetitionSignal,
} from "../src/lib/opportunity/competition-signal.ts";
import {
  COMPETITION_INTENT_KINDS,
  COMPETITION_RESEARCH_QUALITIES,
  COMPETITION_RESEARCH_STATUSES,
  COMPETITION_SOURCE_CLASSES,
  validateCompetitionContext,
  validateCompetitionDimensions,
  validateCompetitionInputs,
  validateCompetitionProviders,
  validateCompetitionResult,
} from "../src/lib/opportunity/competition-validator.ts";
import { createSignalContext } from "../src/lib/opportunity/opportunity-signal-context.ts";
import { executeSignal } from "../src/lib/opportunity/opportunity-signal-executor.ts";
import { createSignalPipeline } from "../src/lib/opportunity/opportunity-signal-pipeline.ts";
import { createSignalRegistry, SignalFrameworkError } from "../src/lib/opportunity/opportunity-signal-registry.ts";
import { validateSignalModule } from "../src/lib/opportunity/opportunity-signal-validator.ts";
import type { OpportunitySignalModule } from "../src/lib/opportunity/opportunity-signal-contract.ts";
import { createEvidenceContext, isDeepFrozen } from "../src/lib/opportunity/providers/evidence-provider-context.ts";
import type { EvidenceKind, EvidenceProvider } from "../src/lib/opportunity/providers/evidence-provider-contract.ts";
import { createEvidenceResolver } from "../src/lib/opportunity/providers/evidence-provider-resolver.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const clock = () => 0;
const URL_A = "https://example.test/gizmo";
const candidate = { id: "cand-1", source: "feed", url: URL_A, title: "Fictional item", status: "NEW" as const, createdAt: "2026-01-01T00:00:00.000Z" };
const ectx = createEvidenceContext({ candidate });
const sctx = createSignalContext({ candidate });
const emptySctx = createSignalContext();

type Src = Record<string, unknown>;
function src(url: string, classification: string, over: Src = {}): Src {
  const parsed = new URL(url);
  return {
    url,
    title: "A fictional page",
    retrievedAt: "2026-01-01T00:00:00.000Z",
    relevantEvidence: "fixture",
    classification,
    classificationReason: "fixture-reason",
    query: "fixture query",
    queryFamily: "PRODUCT",
    domain: parsed.hostname,
    path: parsed.pathname,
    promotional: false,
    usable: true,
    discoveredByProvider: "BRAVE",
    ...over,
  };
}

interface ReportOver {
  status?: string;
  quality?: string;
  signals?: Record<string, unknown>;
  diversity?: Record<string, unknown>;
}
function rep(sources: Src[], over: ReportOver = {}): MarketResearchReport {
  const usable = sources.filter((s) => s.usable === true);
  return {
    productName: "Fictional Gizmo",
    researchedAt: "2026-01-01T00:00:00.000Z",
    queriesUsed: [],
    queryFamilies: [],
    queryOutcomes: [],
    providerMix: {},
    searchProvider: { name: "fixture", configured: true },
    maxAgeHours: 24,
    discardedFabrications: 0,
    status: over.status ?? "FRESH",
    quality: over.quality ?? "HIGH",
    sources,
    signals: {
      currentPositioning: [],
      categoryPositioning: [],
      commonQuestions: [],
      purchaseConsiderations: [],
      commonObjections: [],
      recurringTerminology: [],
      competitorMessaging: [],
      reviewOrientedResults: 0,
      educationalResults: 0,
      buyerGuideResults: 0,
      observedIntents: [],
      ...(over.signals ?? {}),
    },
    diversity: {
      UNIQUE_DOMAINS: usable.length,
      SOURCE_CLASS_DIVERSITY: 1,
      SOURCE_CLASSES: [],
      PROMOTIONAL_SOURCES: usable.filter((s) => s.promotional === true).length,
      PROMOTIONAL_SOURCE_RATIO: 0,
      PROMOTIONAL_PATTERN_DETECTED: false,
      SEARCH_RESULTS_TOTAL: sources.length,
      USABLE_SOURCES: usable.length,
      ...(over.diversity ?? {}),
    },
  } as unknown as MarketResearchReport;
}
const intent = (kind: string) => ({ kind, strength: "WEAK", evidence: "fixture" });

let log: string[] = [];
interface FakeOpts {
  id?: string;
  kind?: EvidenceKind;
  priority?: number;
  enabled?: boolean;
  supports?: boolean;
  validate?: Array<{ field: string; message: string }>;
  collect?: () => unknown;
  warnings?: string[];
  version?: string;
}
function provider(payload: unknown, over: FakeOpts = {}): EvidenceProvider {
  const id = over.id ?? "research-a";
  const kind = over.kind ?? "RESEARCH";
  return {
    id,
    name: `Provider ${id}`,
    version: over.version ?? "1.0.0",
    kind,
    priority: over.priority ?? 100,
    enabled: over.enabled ?? true,
    supports: () => {
      log.push(`supports:${id}`);
      return over.supports ?? true;
    },
    collect:
      over.collect ??
      (() => {
        log.push(`collect:${id}`);
        return { payload, metadata: { by: id }, warnings: over.warnings ?? [] };
      }),
    validate: () => {
      log.push(`validate:${id}`);
      return over.validate ?? [];
    },
  } as unknown as EvidenceProvider;
}

function resolverWith(...providers: EvidenceProvider[]) {
  const resolver = createEvidenceResolver({ now: clock });
  for (const p of providers) resolver.registerProvider(p);
  return resolver;
}
async function mergedOf(payload: unknown, over: FakeOpts = {}) {
  return (await resolverWith(provider(payload, over)).run(ectx, { kind: "RESEARCH" })).merged;
}
async function analyze(sources: Src[], reportOver: ReportOver = {}, inputsOver: Record<string, unknown> = {}) {
  const evidence = await mergedOf(rep(sources, reportOver));
  return analyzeCompetition({ candidate, evidence, ...inputsOver } as never, clock);
}
const sameSet = (a: readonly string[], b: readonly string[]) => [...a].sort().join() === [...b].sort().join();
const has = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));
const stable = (value: unknown) => JSON.stringify(value, (k, v) => (k === "executionTime" ? 0 : v));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function storedResearch(): Array<{ file: string; report: unknown }> {
  const dataDir = join(process.cwd(), "data");
  if (!existsSync(dataDir)) return [];
  const found: Array<{ file: string; report: unknown }> = [];
  for (const a of readdirSync(dataDir)) {
    const pa = join(dataDir, a);
    if (!statSync(pa).isDirectory()) continue;
    for (const b of readdirSync(pa)) {
      const file = join(pa, b, "market-research.json");
      if (!existsSync(file)) continue;
      try {
        found.push({ file, report: JSON.parse(readFileSync(file, "utf8")) });
      } catch {
        // unreadable files are skipped, never rewritten
      }
    }
  }
  return found;
}

async function main() {
  // ---------- constants ----------
  check("ten dimensions, in the requested order", COMPETITION_DIMENSIONS.join() === "SEARCH_PRESENCE,MARKETPLACE_PRESENCE,BRAND_STRENGTH,AFFILIATE_AVAILABILITY,CONTENT_SATURATION,LANDING_PAGE_AVAILABILITY,PRICING_VISIBILITY,REVIEW_AVAILABILITY,AUTHORITY_PRESENCE,ADVERTISING_PRESENCE");
  check("source classes match the platform", JSON.stringify(COMPETITION_SOURCE_CLASSES) === JSON.stringify([...MARKET_SOURCE_CLASSES]));
  check("intent kinds match the platform", JSON.stringify(COMPETITION_INTENT_KINDS) === JSON.stringify([...MARKET_INTENT_KINDS]));
  check("research statuses and qualities match the platform", JSON.stringify(COMPETITION_RESEARCH_STATUSES) === JSON.stringify([...MARKET_RESEARCH_STATUSES]) && JSON.stringify(COMPETITION_RESEARCH_QUALITIES) === JSON.stringify([...MARKET_RESEARCH_QUALITIES]));
  const platformSeller = classifyMarketSourceDetailed({ url: "https://offers.gumroad.test/item", productName: "Zzqx Fictional" });
  check("the seller-platform reason matches what the platform classifier records", platformSeller.classification === "SELLER" && platformSeller.reason === SELLER_PLATFORM_REASON);

  // ---------- analyzer: presence rules ----------
  const none = await analyze([]);
  check("no sources and no signals: everything missing, confidence null, still COMPLETED", none.status === "COMPLETED" && none.availableDimensions.length === 0 && none.missingDimensions.length === 10 && none.confidence === null);

  const editorial = await analyze([src("https://news.example.test/a", "EDITORIAL")]);
  check("a usable editorial source: search, content, and authority are available", sameSet(editorial.availableDimensions, ["SEARCH_PRESENCE", "CONTENT_SATURATION", "AUTHORITY_PRESENCE"]) && editorial.confidence === 0.3);
  const retailer = await analyze([src("https://shop.example.test/a", "RETAILER")]);
  check("a retailer source: search and marketplace are available", sameSet(retailer.availableDimensions, ["SEARCH_PRESENCE", "MARKETPLACE_PRESENCE"]));
  const brand = await analyze([src("https://brand.example.test/a", "BRAND")]);
  check("a brand source: search and brand are available", sameSet(brand.availableDimensions, ["SEARCH_PRESENCE", "BRAND_STRENGTH"]));
  const seller = await analyze([src("https://seller.example.test/a", "SELLER", { classificationReason: "commerce-path" })]);
  check("a seller source: landing page is available, affiliate is not", sameSet(seller.availableDimensions, ["SEARCH_PRESENCE", "LANDING_PAGE_AVAILABILITY"]));
  const platformSource = await analyze([src("https://seller.example.test/a", "SELLER", { classificationReason: SELLER_PLATFORM_REASON })]);
  check("a seller-platform source: affiliate is available too", sameSet(platformSource.availableDimensions, ["SEARCH_PRESENCE", "LANDING_PAGE_AVAILABILITY", "AFFILIATE_AVAILABILITY"]));
  const promo = await analyze([src("https://promo.example.test/a", "EDITORIAL", { promotional: true })]);
  check("a promotional editorial source is advertising, not authority", sameSet(promo.availableDimensions, ["SEARCH_PRESENCE", "CONTENT_SATURATION", "ADVERTISING_PRESENCE"]) && promo.missingDimensions.includes("AUTHORITY_PRESENCE"));
  const unusable = await analyze([src("https://news.example.test/a", "EDITORIAL", { usable: false }), src("https://shop.example.test/a", "RETAILER", { usable: false, promotional: true })]);
  check("unusable sources are not evidence of anything", unusable.availableDimensions.length === 0 && unusable.metadata.usableSourceCount === 0);
  const other = await analyze([src("https://x.example.test/a", "OTHER"), src("https://y.example.test/a", "UNKNOWN"), src("https://z.example.test/a", "FORUM/COMMUNITY")]);
  check("other, unknown, and forum sources show search presence only", sameSet(other.availableDimensions, ["SEARCH_PRESENCE"]));
  const reviews = await analyze([], { signals: { reviewOrientedResults: 2 } });
  const reviewIntent = await analyze([], { signals: { observedIntents: [intent("REVIEW_INTENT")] } });
  check("review-oriented results or a review intent make reviews available", sameSet(reviews.availableDimensions, ["REVIEW_AVAILABILITY"]) && sameSet(reviewIntent.availableDimensions, ["REVIEW_AVAILABILITY"]));
  const educational = await analyze([], { signals: { educationalResults: 1 } });
  const guide = await analyze([], { signals: { buyerGuideResults: 1 } });
  check("educational or buyer-guide results make content available", sameSet(educational.availableDimensions, ["CONTENT_SATURATION"]) && sameSet(guide.availableDimensions, ["CONTENT_SATURATION"]));
  const price = await analyze([], { signals: { observedIntents: [intent("PRICE_CONCERN")] } });
  const otherIntent = await analyze([], { signals: { observedIntents: [intent("SAFETY_CONCERN"), intent("TRUST_CONCERN")] } });
  check("only a price concern makes pricing visible; other intents show nothing", sameSet(price.availableDimensions, ["PRICING_VISIBILITY"]) && otherIntent.availableDimensions.length === 0);
  const everything = await analyze(
    [
      src("https://a.example.test/1", "EDITORIAL"),
      src("https://b.example.test/1", "RETAILER"),
      src("https://c.example.test/1", "BRAND"),
      src("https://d.example.test/1", "SELLER", { classificationReason: SELLER_PLATFORM_REASON }),
      src("https://e.example.test/1", "OTHER", { promotional: true }),
    ],
    { signals: { reviewOrientedResults: 1, educationalResults: 1, observedIntents: [intent("PRICE_CONCERN")] } },
  );
  check("full evidence: all ten available, confidence 1", everything.availableDimensions.length === 10 && everything.missingDimensions.length === 0 && everything.confidence === 1);
  check("counts are recorded per dimension and carry a basis", everything.metadata["count.MARKETPLACE_PRESENCE"] === 1 && everything.metadata["count.SEARCH_PRESENCE"] === 5 && COMPETITION_DIMENSIONS.every((d) => typeof everything.metadata[`basis.${d}`] === "string" && everything.metadata[`dimension.${d}`] === "AVAILABLE"));

  // ---------- analyzer: own page, closed evidence, quality ----------
  const own = await analyze([src(`${URL_A}/`, "SELLER"), src(`${URL_A}#section`, "SELLER"), src("https://example.test/other-item", "SELLER")]);
  check("the candidate's own page is excluded, however its URL is written", own.metadata.excludedOwnPageCount === 2 && own.metadata["count.SEARCH_PRESENCE"] === 1 && own.metadata.usableSourceCount === 3);
  const onlyOwn = await analyze([src(URL_A, "SELLER")]);
  check("a candidate that is the only source finds no competition evidence", onlyOwn.availableDimensions.length === 0);
  const oddCandidate = analyzeCompetition({ candidate: { ...candidate, url: "not a url" }, evidence: await mergedOf(rep([src("https://q.example.test/a", "RETAILER")])) }, clock);
  check("a candidate URL that cannot be parsed excludes nothing", oddCandidate.metadata.excludedOwnPageCount === 0 && oddCandidate.availableDimensions.includes("MARKETPLACE_PRESENCE"));

  const unavailable = await analyze([src("https://a.example.test/1", "EDITORIAL")], { status: "UNAVAILABLE", signals: { reviewOrientedResults: 3 } });
  check("unavailable research supplies no evidence: every dimension is missing", unavailable.availableDimensions.length === 0 && unavailable.confidence === null && unavailable.warnings.some((w) => /unavailable/i.test(w)) && unavailable.metadata.researchStatus === "UNAVAILABLE");
  const stale = await analyze([src("https://a.example.test/1", "RETAILER")], { status: "STALE" });
  check("stale research is used but flagged", stale.availableDimensions.includes("MARKETPLACE_PRESENCE") && stale.warnings.some((w) => /stale/i.test(w)));
  const lowQuality = await analyze([src("https://a.example.test/1", "RETAILER")], { quality: "INSUFFICIENT" });
  check("thin research is flagged so absence is not over-read", lowQuality.warnings.some((w) => /INSUFFICIENT/.test(w)));
  const mismatch = await analyze([src("https://a.example.test/1", "RETAILER", { promotional: true })], { diversity: { USABLE_SOURCES: 4, PROMOTIONAL_SOURCES: 0 } });
  check("reported counts that disagree with the listed sources are flagged, and the list is used", mismatch.warnings.length === 2 && mismatch.availableDimensions.includes("MARKETPLACE_PRESENCE"));
  const noResearch = analyzeCompetition({ candidate, evidence: (await resolverWith().run(ectx)).merged }, clock);
  check("no research item: everything missing, with a warning", noResearch.status === "COMPLETED" && noResearch.availableDimensions.length === 0 && noResearch.warnings.length >= 1 && noResearch.metadata.researchStatus === "NONE" && !("provider.RESEARCH" in noResearch.metadata));
  check("the absence note says missing is not absent", /does not mean the competition is absent/.test(String(none.metadata.absenceNote)));

  // ---------- analyzer: shape ----------
  const subset = await analyze([src("https://a.example.test/1", "RETAILER")], {}, { dimensions: ["REVIEW_AVAILABILITY", "MARKETPLACE_PRESENCE", "SEARCH_PRESENCE"] });
  check("a subset keeps canonical order and says what it left out", subset.availableDimensions.join() === "SEARCH_PRESENCE,MARKETPLACE_PRESENCE" && subset.missingDimensions.join() === "REVIEW_AVAILABILITY" && String(subset.metadata.notEvaluated).split(",").length === 7 && subset.metadata.evaluatedCount === 3);
  check("confidence is the covered share of the checked dimensions", subset.confidence === 0.667);
  check("a dimension not checked has no entry", !("dimension.BRAND_STRENGTH" in subset.metadata));
  const parts = [...everything.availableDimensions, ...everything.missingDimensions];
  check("available and missing never overlap and together cover what was checked", editorial.availableDimensions.filter((d) => editorial.missingDimensions.includes(d)).length === 0 && editorial.availableDimensions.length + editorial.missingDimensions.length === 10 && parts.length === 10);
  check("dimensions are listed in canonical order", [editorial.availableDimensions, editorial.missingDimensions].every((l) => l.join() === COMPETITION_DIMENSIONS.filter((d) => l.includes(d)).join()));
  check("the result carries exactly the requested fields", Object.keys(editorial).sort().join() === "availableDimensions,confidence,executionTime,metadata,missingDimensions,status,warnings");
  check("no score, ranking, or recommendation anywhere", !/score|rank|recommend|strength rating/i.test(JSON.stringify(Object.keys(everything.metadata)) + Object.keys(everything).join()));
  check("metadata is flat", Object.values(everything.metadata).every((v) => v === null || ["string", "number", "boolean"].includes(typeof v)));
  check("provenance survives: provider id, version, status, quality, candidate", everything.metadata["provider.RESEARCH"] === "research-a" && everything.metadata["providerVersion.RESEARCH"] === "1.0.0" && everything.metadata.researchStatus === "FRESH" && everything.metadata.researchQuality === "HIGH" && everything.metadata.candidateId === "cand-1" && everything.metadata.candidateSource === "feed");
  check("the provenance note says the source's wording is not verified", /not independently verified/.test(String(everything.metadata.provenanceNote)));
  const passthrough = await analyze([], {}, { metadata: { run: "r1", flag: true } });
  check("input metadata passes through under input.<key>", passthrough.metadata["input.run"] === "r1" && passthrough.metadata["input.flag"] === true);
  const withWarnings = analyzeCompetition({ candidate, evidence: await mergedOf(rep([]), { warnings: ["provider says hello"] }) }, clock);
  check("provider warnings travel with the result", withWarnings.warnings.some((w) => /provider says hello/.test(w)));
  let tick = 0;
  const stepping = analyzeCompetition({ candidate, evidence: await mergedOf(rep([])) }, () => (tick += 5));
  check("execution time comes from the injected clock", stepping.executionTime >= 5);
  check("the analysis is deterministic", stable(await analyze([src("https://a.example.test/1", "BRAND")])) === stable(await analyze([src("https://a.example.test/1", "BRAND")])));
  const out = competitionResultToSignalOutput(everything);
  check("the framework output has no errors and no execution time", out.errors.length === 0 && !("executionTime" in out) && out.status === "COMPLETED" && out.confidence === 1);

  // ---------- read-only ----------
  const frozenEvidence = await mergedOf(rep([src("https://a.example.test/1", "RETAILER")]));
  const frozenCandidate = Object.freeze({ ...candidate });
  const before = JSON.stringify(frozenEvidence);
  analyzeCompetition({ candidate: frozenCandidate, evidence: frozenEvidence }, clock);
  check("the payload is frozen and the analysis leaves evidence and candidate unchanged", isDeepFrozen(frozenEvidence.items.RESEARCH?.payload) && JSON.stringify(frozenEvidence) === before);

  // ---------- validator ----------
  check("duplicate dimensions are rejected", has(validateCompetitionDimensions(["SEARCH_PRESENCE", "SEARCH_PRESENCE"]), /Duplicate dimension/));
  check("unknown, empty, and non-list dimensions are rejected", has(validateCompetitionDimensions(["NOPE"]), /not supported/) && validateCompetitionDimensions([]).length === 1 && validateCompetitionDimensions("SEARCH_PRESENCE").length === 1);
  check("all dimensions are valid", validateCompetitionDimensions([...COMPETITION_DIMENSIONS]).length === 0);
  const goodInputs = { candidate, evidence: frozenEvidence };
  check("valid inputs pass; dimensions and metadata are optional", validateCompetitionInputs(goodInputs).length === 0 && validateCompetitionInputs({ ...goodInputs, dimensions: null, metadata: null }).length === 0);
  check("missing inputs are rejected", validateCompetitionInputs(null).length === 1 && validateCompetitionInputs(undefined).length === 1);
  check("a missing or malformed candidate is rejected", has(validateCompetitionInputs({ evidence: frozenEvidence }), /Candidate is required/) && has(validateCompetitionInputs({ ...goodInputs, candidate: { id: "", source: "s", url: "u", title: "t" } }), /Candidate is invalid/) && has(validateCompetitionInputs({ ...goodInputs, candidate: "x" }), /Candidate is invalid/));
  check("missing or malformed evidence is rejected", has(validateCompetitionInputs({ candidate }), /Evidence is required/) && has(validateCompetitionInputs({ candidate, evidence: {} }), /Evidence is invalid/) && has(validateCompetitionInputs({ candidate, evidence: { items: {}, failed: [], warnings: [1] } }), /warnings/));
  check("a duplicate dimension in the inputs is rejected", has(validateCompetitionInputs({ ...goodInputs, dimensions: ["BRAND_STRENGTH", "BRAND_STRENGTH"] }), /Duplicate dimension/));
  for (const metadata of [{ a: { b: 1 } }, { a: Number.NaN }, { "": 1 }, { a: [1] }, "text", []]) {
    check(`invalid metadata ${JSON.stringify(metadata)} is rejected`, has(validateCompetitionInputs({ ...goodInputs, metadata }), /Metadata is invalid/));
  }
  const withItem = (payload: unknown, extra: Record<string, unknown> = {}) => ({ candidate, evidence: { items: { RESEARCH: { kind: "RESEARCH", providerId: "p", providerVersion: "1.0.0", priority: 1, payload, metadata: {}, warnings: [], ...extra } }, failed: [], warnings: [] } });
  const goodReport = JSON.parse(JSON.stringify(rep([src("https://a.example.test/1", "RETAILER")])));
  check("a well-formed research item passes", validateCompetitionInputs(withItem(goodReport)).length === 0);
  const broken: Array<[string, (r: Record<string, any>) => void]> = [
    ["status", (r) => { r.status = "OLD"; }],
    ["quality", (r) => { r.quality = "GREAT"; }],
    ["source class", (r) => { r.sources[0].classification = "STORE"; }],
    ["source reason", (r) => { delete r.sources[0].classificationReason; }],
    ["source flag", (r) => { r.sources[0].promotional = "yes"; }],
    ["signal count", (r) => { r.signals.reviewOrientedResults = -1; }],
    ["intent kind", (r) => { r.signals.observedIntents = [{ kind: "BUY_NOW" }]; }],
    ["diversity", (r) => { r.diversity.USABLE_SOURCES = "3"; }],
    ["sources list", (r) => { r.sources = "none"; }],
  ];
  for (const [name, mutate] of broken) {
    const copy = JSON.parse(JSON.stringify(goodReport));
    mutate(copy);
    check(`a research report with a bad ${name} is rejected`, has(validateCompetitionInputs(withItem(copy)), /Research is invalid/));
  }
  check("a research item with the wrong kind, no provider, or a bad version is rejected", has(validateCompetitionInputs(withItem(goodReport, { kind: "COMPLETENESS" })), /kind RESEARCH/) && has(validateCompetitionInputs(withItem(goodReport, { providerId: "" })), /name its provider/) && has(validateCompetitionInputs(withItem(goodReport, { providerVersion: "one" })), /version/));
  check("the analyzer throws on invalid inputs and says why", (() => { try { analyzeCompetition({ candidate, evidence: {} } as never, clock); return false; } catch (error) { return error instanceof CompetitionInputError && error.issues.length > 0; } })());
  check("an invalid evidence context is rejected", has(validateCompetitionContext({ candidate: 5 }), /Invalid evidence context/) && has(validateCompetitionContext(createEvidenceContext({ metadata: { a: { b: 1 } } as never })), /context\.metadata/) && validateCompetitionContext(ectx).length === 0);
  check("a missing provider is rejected", has(validateCompetitionProviders(0), /Missing provider/) && validateCompetitionProviders(1).length === 0);
  const goodResult = { status: "COMPLETED", confidence: 0.5, availableDimensions: ["SEARCH_PRESENCE"], missingDimensions: ["BRAND_STRENGTH"], warnings: [], metadata: {}, executionTime: 0 };
  check("a valid result passes", validateCompetitionResult(goodResult).length === 0 && validateCompetitionResult(everything).length === 0);
  check("a result with a dimension listed twice or on both sides is rejected", has(validateCompetitionResult({ ...goodResult, missingDimensions: ["SEARCH_PRESENCE"] }), /Duplicate dimension/) && has(validateCompetitionResult({ ...goodResult, availableDimensions: ["SEARCH_PRESENCE", "SEARCH_PRESENCE"] }), /Duplicate dimension/));
  check("a result with a bad status, confidence, warning list, or metadata is rejected", has(validateCompetitionResult({ ...goodResult, status: "DONE" }), /Status/) && has(validateCompetitionResult({ ...goodResult, confidence: 2 }), /Confidence/) && has(validateCompetitionResult({ ...goodResult, warnings: [1] }), /warnings/) && has(validateCompetitionResult({ ...goodResult, metadata: { a: {} } }), /Metadata is invalid/) && validateCompetitionResult(null).length === 1);

  // ---------- the signal contract ----------
  const resolver = resolverWith(provider(rep([src("https://a.example.test/1", "RETAILER")])));
  const signal = createCompetitionSignal({ resolver, now: clock });
  check("the signal meets the framework's module contract", validateSignalModule(signal).length === 0);
  check("identity: id, name, version, category, enabled, priority", signal.id === COMPETITION_SIGNAL_ID && COMPETITION_SIGNAL_ID === "competition" && signal.name === "Competition" && signal.version === "1.0.0" && signal.category === "COMPETITION" && signal.enabled === true && signal.priority === 80);
  check("the signal is independent: no dependencies of any kind", signal.dependencies.requires.length === 0 && signal.dependencies.optional.length === 0 && signal.dependencies.conflicts.length === 0);
  check("the signal supports a context with a candidate only", signal.supportsCandidate(sctx) === true && signal.supportsCandidate(emptySctx) === false);
  check("options set enabled and priority", createCompetitionSignal({ resolver, enabled: false, priority: 7 }).enabled === false && createCompetitionSignal({ resolver, priority: 7 }).priority === 7);

  // registration
  const registry = createSignalRegistry();
  const entry = registerCompetitionSignal(registry, { resolver, now: clock });
  check("the signal registers in a registry as a COMPETITION signal", entry.id === "competition" && entry.enabled === true && registry.get("competition")?.module.category === "COMPETITION" && registry.list({ category: "COMPETITION" }).length === 1);
  let duplicateRejected = false;
  try {
    registerCompetitionSignal(registry, { resolver });
  } catch (error) {
    duplicateRejected = error instanceof SignalFrameworkError;
  }
  check("registering the signal twice is rejected", duplicateRejected && registry.count() === 1);
  const pipeline = createSignalPipeline();
  registerCompetitionSignal(pipeline, { resolver, now: clock });
  check("the pipeline accepts it with valid dependencies and an order of one", pipeline.validateDependencies().length === 0 && pipeline.resolveExecutionOrder().order.join() === "competition");
  check("it can be disabled and enabled like any other", pipeline.disable("competition").enabled === false && pipeline.enable("competition").enabled === true);

  // ---------- the signal run ----------
  log = [];
  const report = await pipeline.run(sctx);
  const result = report.results[0];
  check("the pipeline runs it and collects a COMPLETED result", report.results.length === 1 && result.signalId === "competition" && result.status === "COMPLETED" && typeof result.executionTime === "number" && result.errors.length === 0);
  check("the result matches the standalone analysis", stable(result.metadata) === stable((await analyze([src("https://a.example.test/1", "RETAILER")])).metadata) && result.metadata.availableDimensions === "SEARCH_PRESENCE,MARKETPLACE_PRESENCE" && result.confidence === 0.2);
  check("the collected result has no score", !("score" in result) && !("ranking" in result) && !("recommendation" in result));
  const direct = await executeSignal(signal, sctx, {}, clock);
  check("the executor runs it with no pipeline, and skips a context with no candidate", direct.status === "COMPLETED" && (await executeSignal(signal, emptySctx, {}, clock)).status === "SKIPPED");
  check("a second run gives the same result: nothing is cached or kept", stable(await executeSignal(signal, sctx, {}, clock)) === stable(direct));

  // evidence provider integration
  log = [];
  const spies = resolverWith(
    provider(rep([src("https://a.example.test/1", "EDITORIAL")]), { id: "research-spy" }),
    provider({ x: 1 }, { id: "facts-spy", kind: "PRODUCT_FACTS" }),
    provider({ x: 1 }, { id: "completeness-spy", kind: "COMPLETENESS" }),
    provider({ x: 1 }, { id: "lp-spy", kind: "LP_QUALITY" }),
    provider({ x: 1 }, { id: "plan-spy", kind: "PRESENTATION_PLAN" }),
    provider([{ x: 1 }], { id: "overrides-spy", kind: "MANUAL_OVERRIDES" }),
  );
  const spied = await executeSignal(createCompetitionSignal({ resolver: spies, now: clock }), sctx, {}, clock);
  check("only RESEARCH evidence is requested: no other provider is asked to support, validate, or collect", spied.status === "COMPLETED" && log.length > 0 && log.every((entryText) => entryText.endsWith(":research-spy")) && log.some((l) => l === "collect:research-spy"));
  check("the evidence comes from the provider, which is named in the result", spied.metadata["provider.RESEARCH"] === "research-spy");
  const winner = await executeSignal(createCompetitionSignal({ resolver: resolverWith(provider(rep([src("https://a.example.test/1", "BRAND")]), { id: "low", priority: 10 }), provider(rep([src("https://a.example.test/1", "RETAILER")]), { id: "high", priority: 500 })), now: clock }), sctx, {}, clock);
  check("when two providers supply research, the framework's winner is used whole", winner.metadata["provider.RESEARCH"] === "high" && winner.metadata["dimension.MARKETPLACE_PRESENCE"] === "AVAILABLE" && winner.metadata["dimension.BRAND_STRENGTH"] === "MISSING");
  const mapped = defaultCompetitionContextFactory(createSignalContext({ candidate, importedMetadata: { a: 1 }, runtime: { r: "x" }, configuration: { c: true }, extensions: { e: null }, executionMetadata: { skipped: 1 } }));
  check("the default factory builds a frozen evidence context from the signal context", isDeepFrozen(mapped) && mapped.candidate?.id === "cand-1" && mapped.metadata.a === 1 && mapped.runtime.r === "x" && mapped.configuration.c === true && mapped.extensions.e === null && Object.keys(mapped.resolvedProductData).length === 0);
  let factoryCalls = 0;
  const custom = await executeSignal(createCompetitionSignal({ resolver, now: clock, contextFactory: (c) => { factoryCalls++; return defaultCompetitionContextFactory(c); } }), sctx, {}, clock);
  check("a custom context factory is used", custom.status === "COMPLETED" && factoryCalls >= 2);

  // rejections through the signal
  const failedOf = async (module: OpportunitySignalModule) => executeSignal(module, sctx, {}, clock);
  const badContext = await failedOf(createCompetitionSignal({ resolver, now: clock, contextFactory: () => createEvidenceContext({ candidate, metadata: { a: { b: 1 } } as never }) }));
  check("Invalid Evidence Context: rejected before any provider is asked", badContext.status === "FAILED" && badContext.errors.some((e) => /Invalid evidence context/.test(e)) && badContext.metadata.availableDimensions === undefined);
  const throwing = await failedOf(createCompetitionSignal({ resolver, now: clock, contextFactory: () => { throw new Error("boom"); } }));
  check("Invalid Evidence Context: a factory that throws is rejected", throwing.status === "FAILED" && throwing.errors.some((e) => /Invalid evidence context.*boom/.test(e)));
  const notObject = await failedOf(createCompetitionSignal({ resolver, now: clock, contextFactory: () => null as never }));
  check("Invalid Evidence Context: a factory that returns nothing is rejected", notObject.status === "FAILED" && notObject.errors.some((e) => /Invalid evidence context/.test(e)));
  const noCandidate = await failedOf(createCompetitionSignal({ resolver, now: clock, contextFactory: () => createEvidenceContext() }));
  check("a context that carries no candidate is rejected", noCandidate.status === "FAILED" && noCandidate.errors.some((e) => /Candidate is required/.test(e)));
  const noProviders = await failedOf(createCompetitionSignal({ resolver: resolverWith(), now: clock }));
  check("Missing Provider: no providers at all", noProviders.status === "FAILED" && noProviders.errors.some((e) => /Missing provider/.test(e)));
  const wrongKind = await failedOf(createCompetitionSignal({ resolver: resolverWith(provider({ x: 1 }, { kind: "PRODUCT_FACTS", id: "facts-only" })), now: clock }));
  check("Missing Provider: only providers of other kinds", wrongKind.status === "FAILED" && wrongKind.errors.some((e) => /Missing provider/.test(e)) && !log.includes("collect:facts-only"));
  const disabledProvider = await failedOf(createCompetitionSignal({ resolver: resolverWith(provider(rep([]), { enabled: false })), now: clock }));
  const unsupported = await failedOf(createCompetitionSignal({ resolver: resolverWith(provider(rep([]), { supports: false })), now: clock }));
  check("Missing Provider: a disabled provider, or one that does not support the context", disabledProvider.status === "FAILED" && unsupported.status === "FAILED" && [disabledProvider, unsupported].every((r) => r.errors.some((e) => /Missing provider/.test(e))));
  const dup = await failedOf(createCompetitionSignal({ resolver, now: clock, dimensions: ["BRAND_STRENGTH", "BRAND_STRENGTH"] }));
  check("Duplicate Dimension: rejected", dup.status === "FAILED" && dup.errors.some((e) => /Duplicate dimension/.test(e)));
  const unknownDimension = await failedOf(createCompetitionSignal({ resolver, now: clock, dimensions: ["NOPE" as CompetitionDimension] }));
  check("an unknown dimension is rejected", unknownDimension.status === "FAILED" && unknownDimension.errors.some((e) => /not supported/.test(e)));
  const badMetadata = await failedOf(createCompetitionSignal({ resolver, now: clock, contextFactory: () => createEvidenceContext({ candidate, runtime: { a: Number.NaN } }) }));
  check("Invalid Metadata: rejected with the field named", badMetadata.status === "FAILED" && badMetadata.errors.some((e) => /context\.runtime/.test(e)));
  check("a signal validate() reports the same problems before analyze", createCompetitionSignal({ resolver: resolverWith(), now: clock }).validate(sctx).some((i) => /Missing provider/.test(i.message)) && createCompetitionSignal({ resolver, dimensions: ["BRAND_STRENGTH", "BRAND_STRENGTH"] }).validate(sctx).some((i) => /Duplicate/.test(i.message)) && signal.validate(sctx).length === 0);

  // failed versus empty research
  const throwingProvider = await failedOf(createCompetitionSignal({ resolver: resolverWith(provider(null, { collect: () => { throw new Error("upstream down"); } })), now: clock }));
  check("a research provider that throws gives FAILED, never an all-missing COMPLETED", throwingProvider.status === "FAILED" && throwingProvider.errors.some((e) => /research-a/.test(e) && /upstream down/.test(e)));
  const invalidProvider = await failedOf(createCompetitionSignal({ resolver: resolverWith(provider(rep([]), { validate: [{ field: "x", message: "not ready" }] })), now: clock }));
  check("a research provider that fails its own validation gives FAILED", invalidProvider.status === "FAILED");
  const emptyProvider = await failedOf(createCompetitionSignal({ resolver: resolverWith(provider(null)), now: clock }));
  check("a research provider that collected nothing gives COMPLETED with everything missing and a warning", emptyProvider.status === "COMPLETED" && emptyProvider.metadata.missingCount === 10 && emptyProvider.confidence === null && emptyProvider.warnings.length >= 1);
  const malformed = await failedOf(createCompetitionSignal({ resolver: resolverWith(provider({ productName: "x" })), now: clock }));
  check("a research payload that is not a research report gives FAILED", malformed.status === "FAILED" && malformed.errors.some((e) => /Research is invalid/.test(e)));
  const brokenThenWorking = await failedOf(createCompetitionSignal({ resolver: resolverWith(provider(null, { id: "broken", priority: 500, collect: () => { throw new Error("x"); } }), provider(rep([src("https://a.example.test/1", "BRAND")]), { id: "working", priority: 100 })), now: clock }));
  check("a failing provider does not hide a working one", brokenThenWorking.status === "COMPLETED" && brokenThenWorking.metadata["provider.RESEARCH"] === "working");
  const unavailableRun = await failedOf(createCompetitionSignal({ resolver: resolverWith(provider(rep([src("https://a.example.test/1", "BRAND")], { status: "UNAVAILABLE" }))), now: clock }));
  check("unavailable research stays closed through the signal", unavailableRun.status === "COMPLETED" && unavailableRun.metadata.availableCount === 0 && unavailableRun.confidence === null);

  // read-only
  const frozenCtx = createSignalContext({ candidate });
  const snapshot = JSON.stringify(frozenCtx);
  await executeSignal(signal, frozenCtx, {}, clock);
  check("the signal context and the candidate are unchanged by a run", JSON.stringify(frozenCtx) === snapshot && Object.isFrozen(frozenCtx.candidate));
  const liveFacts = emptyProductFacts("Gizmo Prime", URL_A, "IMPORTED");
  const factsBefore = JSON.stringify(liveFacts);
  await executeSignal(createCompetitionSignal({ resolver, now: clock, contextFactory: (c) => createEvidenceContext({ candidate: c.candidate, resolvedProductData: { facts: liveFacts } }) }), sctx, {}, clock);
  check("ProductFacts handed to the context are not mutated", JSON.stringify(liveFacts) === factsBefore);

  // ---------- independent execution next to the other signals ----------
  const facts = emptyProductFacts("Gizmo Prime", URL_A, "IMPORTED");
  const completeness = analyzeImportCompleteness({ facts });
  const plan = planPresentation(facts, analyzeProductProfile(facts));
  const lpInputs: LandingPagePotentialInputs = {
    facts,
    completeness,
    presentationPlan: plan,
    qualityPrediction: predictLpQuality({ facts, report: completeness }),
    evidence: analyzeEvidence({ facts, completeness, presentationPlan: plan }, { now: clock }),
    manualOverrides: [],
  };
  const lone = createSignalPipeline();
  registerCompetitionSignal(lone, { resolver, now: clock });
  const loneResult = (await lone.run(sctx)).results[0];
  const trio = createSignalPipeline();
  registerEvidenceSignal(trio, { provider: () => ({ facts }) });
  registerLandingPagePotentialSignal(trio, { provider: () => lpInputs });
  registerCompetitionSignal(trio, { resolver, now: clock });
  const trioReport = await trio.run(sctx);
  const byId = (id: string) => trioReport.results.find((r) => r.signalId === id)!;
  check("all three signals run and complete, each with its own result", trioReport.results.length === 3 && trioReport.results.every((r) => r.status === "COMPLETED"));
  check("the Competition result is the same alone or beside the others", stable(byId("competition")) === stable(loneResult));
  const evidenceAlone = createSignalPipeline();
  registerEvidenceSignal(evidenceAlone, { provider: () => ({ facts }) });
  const lpAlone = createSignalPipeline();
  registerLandingPagePotentialSignal(lpAlone, { provider: () => lpInputs });
  check("the Evidence and Landing Page Potential results are unchanged by Competition", stable(byId("evidence")) === stable((await evidenceAlone.run(sctx)).results[0]) && byId("landing-page-potential").metadata.strongCount !== undefined && stable(byId("landing-page-potential")) === stable((await lpAlone.run(sctx)).results[0]));
  check("Competition adds no ordering constraint: it needs nothing and nothing needs it", trio.validateDependencies().length === 0 && trio.resolveExecutionOrder().order.indexOf("evidence") < trio.resolveExecutionOrder().order.indexOf("landing-page-potential"));
  const failing = createSignalPipeline();
  registerEvidenceSignal(failing, { provider: () => ({ facts }) });
  registerCompetitionSignal(failing, { resolver: resolverWith(), now: clock });
  const failingReport = await failing.run(sctx);
  check("a failing Competition Signal does not change another signal's result", failingReport.results.find((r) => r.signalId === "competition")?.status === "FAILED" && stable(failingReport.results.find((r) => r.signalId === "evidence")) === stable(byId("evidence")));
  trio.disable("evidence");
  trio.disable("landing-page-potential");
  check("Competition runs alone when the others are disabled", (await trio.run(sctx)).results.map((r) => r.signalId).join() === "competition");

  // ---------- replay of stored research (read-only) ----------
  const stored = storedResearch();
  if (stored.length === 0) console.log("NOTE: no stored market research reports exist in the repository; the replay below is skipped.");
  let replayOk = true;
  let replayed = 0;
  let sample = "";
  for (const { file, report: raw } of stored) {
    const snapshotText = JSON.stringify(raw);
    const evidence = await mergedOf(JSON.parse(snapshotText));
    const inputs = { candidate, evidence };
    const valid = validateCompetitionInputs(inputs).length === 0;
    const a = analyzeCompetition(inputs, clock);
    const b = analyzeCompetition(inputs, clock);
    const partition = a.availableDimensions.length + a.missingDimensions.length === 10 && validateCompetitionResult(a).length === 0;
    const r = raw as MarketResearchReport;
    const searchMatches = (a.metadata["dimension.SEARCH_PRESENCE"] === "AVAILABLE") === (r.sources.filter((s) => s.usable).length > 0);
    const authority = r.sources.filter((s) => s.usable && s.classification === "EDITORIAL" && !s.promotional).length > 0;
    const authorityMatches = (a.metadata["dimension.AUTHORITY_PRESENCE"] === "AVAILABLE") === authority;
    const closed = r.status !== "UNAVAILABLE" || a.availableDimensions.length === 0;
    replayOk = replayOk && valid && stable(a) === stable(b) && partition && searchMatches && authorityMatches && closed && a.status === "COMPLETED" && JSON.stringify(raw) === snapshotText && statSync(file).isFile();
    replayed += 1;
    if (!sample) sample = `${a.availableDimensions.length}/10 available (${a.availableDimensions.join(",") || "none"}) | confidence ${a.confidence} | ${a.warnings.length} warning(s)`;
  }
  if (stored.length > 0) {
    check(`replay of ${replayed} stored research report(s) is valid, deterministic, read-only, and consistent with the stored classifications`, replayOk);
    console.log(`  first report -> ${sample}`);
  }

  // ---------- genericity and boundaries ----------
  const dir = join(process.cwd(), "src/lib/opportunity");
  const files = readdirSync(dir).filter((f) => /^competition-[a-z]+\.ts$/.test(f)).map((f) => join(dir, f));
  check("four modules exist: signal, analyzer, result, validator", files.map((f) => f.split(/[\\/]/).pop()).sort().join() === "competition-analyzer.ts,competition-result.ts,competition-signal.ts,competition-validator.ts");
  const lines = files.flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/));
  const code = lines.filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l));
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no campaign ids, named marketplaces or sellers, or slugs", !lines.some((l) => /campaign|clickbank|hotmart|amazon|shopify|ebay|aliexpress|walmart|digistore|gumroad|slug/i.test(l)));
  check("no hostname or path parsing for classification", !code.some((l) => /\.hostname|\.host\b|\.test\(\s*(host|domain|url)|includes\(["'][a-z]+\.[a-z]{2,}/i.test(l.replace(/\$\{parsed\.host\}/, ""))));
  check("no Google, ads, or search access", !code.some((l) => /google|adwords|gclid|serp|searchProvider/i.test(l)));
  check("no scoring, ranking, or recommendations in code", !code.some((l) => /\bscor(e|es|ing)\b|\brank|recommendation|\brecommend\b/i.test(l)));
  check("no AI, network, crawling, database, timers, or file access", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|robots|crawl|scrap/i.test(l)));
  check("no randomness or wall-clock reads", !code.some((l) => /Math\.random|Date\.now|new Date\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no ProductFacts access of any kind", !code.some((l) => /ProductFacts|product-facts|PRODUCT_FACTS|resolvedProductData|\bfacts\b/.test(l)));
  check("no provider kind other than RESEARCH is named", !code.some((l) => /COMPLETENESS|LP_QUALITY|PRESENTATION_PLAN|MANUAL_OVERRIDES/.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 10);
  check("platform imports are type-only", imports.filter((i) => i.from.startsWith("@/")).every((i) => i.typeOnly) && imports.some((i) => i.from.startsWith("@/")));
  check("the only platform module read is the market research types", [...new Set(imports.filter((i) => i.from.startsWith("@/")).map((i) => i.from))].join() === "@/lib/market-research/types");
  check("nothing imports the LP Builder, Discovery runtime, Importer, Grounding, Policy, Publication, Tracking, Analytics, or the database", !imports.some((i) => !i.typeOnly && /lp-builder|discovery|import|grounding|policy|publication|tracking|analytics|db/i.test(i.from.replace(/providers\/evidence-provider-/, ""))));
  check("other imports stay inside opportunity and its providers folder", imports.filter((i) => !i.from.startsWith("@/")).every((i) => i.from.startsWith("./") || i.from.startsWith("../discovery/discovery-types")));
  check("the Discovery import is type-only", imports.filter((i) => /discovery/.test(i.from)).every((i) => i.typeOnly));
  check("the code never assigns into its inputs or evidence", !code.some((l) => /\b(inputs|evidence|report|candidate|research|merged)\.[A-Za-z.[\]]+\s*=[^=>]/.test(l)));
  check("no in-place array mutation of inputs", !code.some((l) => /(inputs|evidence|report|candidate|research|merged|sources|signals)\.[A-Za-z.]*\.?(splice|sort|reverse|push|pop|shift)\(/.test(l)));
  const openCoverage = readFileSync(join(dir, "competition-signal.ts"), "utf8");
  check("the signal asks for RESEARCH evidence only", (openCoverage.match(/kind: "RESEARCH"/g) ?? []).length === 2 && !/kind: "(?!RESEARCH)/.test(openCoverage));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nCompetition signal: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
