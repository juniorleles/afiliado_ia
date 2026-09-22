import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetDbForTests } from "../src/lib/db.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { buildPrompt, lintVariant, parseVariantsResponse } from "../src/lib/ai/generate-variants.ts";
import { classifyMarketSource } from "../src/lib/market-research/classify.ts";
import { looksLikeFabricatedMarketMetric, stripFabricatedMarketClaims } from "../src/lib/market-research/forbidden.ts";
import { freshnessStatus, withFreshness } from "../src/lib/market-research/freshness.ts";
import { marketResearchQueries, marketResearchQueryFamilies } from "../src/lib/market-research/queries.ts";
import { runMarketResearch } from "../src/lib/market-research/research.ts";
import { emptyMarketSignals, formatSafeMarketContext } from "../src/lib/market-research/signals.ts";
import { selectStrategy, nextStrategyIfBlocked, sanitizeRecommendation, scoresFromResearch } from "../src/lib/strategy/select.ts";
import { recommendedLpPreviewPath, recommendedLpPreviewUrl } from "../src/lib/strategy/preview.ts";
import { factsAreHealthSensitive } from "../src/lib/strategy/execute-recommended.ts";
import { createValidationRun, insertValidationCandidate, listValidationCandidates, updateValidationRun } from "../src/lib/validation/store.ts";
import { composeCandidateFromVariant } from "../src/lib/validation/pipeline.ts";
import { validationAnalyticsAllowed, validationRenderFlags } from "../src/lib/validation/isolation.ts";
import { validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import { STRATEGY_CONFIDENCE_LEVELS, STRATEGY_FAMILIES } from "../src/lib/strategy/types.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function slugQuery(query: string): string {
  return query.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function stubResearch(intents: Array<{
  kind: "REVIEW_INTENT" | "BUYER_GUIDE_INTENT" | "EDUCATIONAL_INTENT" | "COMPARISON_INTENT" | "QUESTION_INTENT" | "SAFETY_CONCERN" | "INGREDIENT_RESEARCH" | "PRICE_CONCERN" | "TRUST_CONCERN";
  evidence: string;
  sourceUrl?: string;
  fromQueryFamily?: "PRODUCT" | "PURCHASE_INTENT" | "CATEGORY_INTENT" | "QUESTIONS_OBJECTIONS";
  strength?: "WEAK" | "MODERATE";
}>, extra?: { status?: "FRESH" | "STALE" | "UNAVAILABLE"; quality?: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT"; questions?: string[]; considerations?: string[]; terminology?: string[] }) {
  const signals = emptyMarketSignals();
  signals.observedIntents = intents.map((item) => ({
    kind: item.kind,
    strength: item.strength || "WEAK",
    evidence: item.evidence,
    sourceUrl: item.sourceUrl,
    fromQueryFamily: item.fromQueryFamily,
  }));
  signals.commonQuestions = extra?.questions || [];
  signals.purchaseConsiderations = extra?.considerations || [];
  signals.recurringTerminology = extra?.terminology || [];
  return {
    productName: "Sample Product",
    researchedAt: "2026-09-20T18:57:00.708Z",
    status: extra?.status || "FRESH",
    quality: extra?.quality || "MEDIUM",
    queriesUsed: ["Sample Product"],
    queryFamilies: [],
    queryOutcomes: [],
    providerMix: { DDG_QUERY_SUCCESS: 0, BRAVE_FALLBACK_ATTEMPTS: 0, BRAVE_FALLBACK_SUCCESS: 0, BRAVE_FALLBACK_FAILED: 0 },
    sources: [
      {
        url: "https://example.com/review",
        title: "Sample Product Review",
        retrievedAt: "2026-09-20T18:57:00.708Z",
        relevantEvidence: "Sample Product Review",
        classification: "EDITORIAL" as const,
        classificationReason: "editorial-signals",
        query: "Sample Product",
        queryFamily: "PRODUCT" as const,
        domain: "example.com",
        path: "/review",
        promotional: false,
        usable: true,
        discoveredByProvider: "DUCKDUCKGO_HTML" as const,
      },
      {
        url: "https://forum.example/thread",
        title: "Discussion",
        retrievedAt: "2026-09-20T18:57:00.708Z",
        relevantEvidence: "Discussion",
        classification: "FORUM/COMMUNITY" as const,
        classificationReason: "forum-path",
        query: "Sample Product",
        queryFamily: "PRODUCT" as const,
        domain: "forum.example",
        path: "/thread",
        promotional: false,
        usable: true,
        discoveredByProvider: "DUCKDUCKGO_HTML" as const,
      },
    ],
    signals,
    diversity: {
      UNIQUE_DOMAINS: 2,
      SOURCE_CLASS_DIVERSITY: 2,
      SOURCE_CLASSES: ["EDITORIAL", "FORUM/COMMUNITY"] as const,
      PROMOTIONAL_SOURCES: 0,
      PROMOTIONAL_SOURCE_RATIO: 0,
      PROMOTIONAL_PATTERN_DETECTED: false,
      SEARCH_RESULTS_TOTAL: 2,
      USABLE_SOURCES: 2,
    },
    searchProvider: { name: "DUCKDUCKGO_HTML", configured: true, realWebSearchAvailable: true },
    maxAgeHours: 24,
    discardedFabrications: [],
  };
}

async function main() {
  const facts = emptyProductFacts("Joint Support Pro", "https://merchant.example/jsp", "IMPORTED");
  facts.description = "Glucosamine and chondroitin joint supplement.";
  facts.features = ["Helps support joint flexibility"];
  facts.ingredientsOrComponents = ["Glucosamine"];
  facts.confidence.description = "DIRECT_SOURCE";
  facts.confidence.features = "DIRECT_SOURCE";
  facts.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
  facts.importQuality = "SUFFICIENT";
  const factsSnapshot = JSON.stringify(facts);

  const queries = marketResearchQueries(facts);
  const families = marketResearchQueryFamilies(facts);
  assert(queries[0] === "Joint Support Pro", "primary research query is the product name");
  assert(queries.some((q) => /review/i.test(q)), "research includes review query");
  assert(queries.some((q) => /worth it/i.test(q)), "research includes purchase-intent query");
  assert(queries.some((q) => /buying guide/i.test(q)), "research includes category buying-guide query");
  assert(queries.some((q) => /what to look for/i.test(q)), "research includes question/objection query");
  assert(families.map((item) => item.family).join(",") === "PRODUCT,PURCHASE_INTENT,CATEGORY_INTENT,QUESTIONS_OBJECTIONS", "four generic query families from ProductFacts");
  assert(!fs.readFileSync(path.join(process.cwd(), "src/lib/market-research/queries.ts"), "utf8").includes("Joint Genesis"), "query families are not hardcoded to Joint Genesis");

  assert(classifyMarketSource("https://www.amazon.com/dp/1", "Joint Support Pro") === "RETAILER", "amazon is RETAILER");
  assert(classifyMarketSource("https://www.healthline.com/x", "Joint Support Pro") === "EDITORIAL", "healthline is EDITORIAL");
  assert(classifyMarketSource("https://www.reddit.com/r/supplements", "Joint Support Pro") === "FORUM/COMMUNITY", "reddit is FORUM");
  assert(classifyMarketSource("https://jointsupportpro.com/p", "Joint Support Pro") === "BRAND", "exact product-domain identity can be BRAND");
  assert(
    classifyMarketSource({
      url: "https://jointgenesisofficial.com/",
      productName: "Joint Genesis",
      title: "Joint Genesis Official Website",
    }) === "SELLER",
    "Official-title squat domain is SELLER not BRAND",
  );
  assert(
    classifyMarketSource({
      url: "https://tryjointnow.net/offer",
      productName: "Joint Genesis",
      title: "Official USA",
    }) === "SELLER",
    "Official USA title is not BRAND evidence",
  );
  assert(
    classifyMarketSource({
      url: "https://getdeal.example/x",
      productName: "Joint Genesis",
      title: "Get 50% Off Today",
    }) === "SELLER",
    "discount promotional title is SELLER",
  );

  assert(looksLikeFabricatedMarketMetric("ROAS 4.2 and $2M revenue"), "fabricated ROAS is detected");
  assert(stripFabricatedMarketClaims("400% conversion rate of customers").discarded, "conversion-rate snippet discarded");
  assert(!stripFabricatedMarketClaims("Honest review of Joint Support Pro").discarded, "plain review title kept");

  const research = await runMarketResearch({
    facts,
    now: new Date("2026-09-18T20:00:00.000Z"),
    searchWeb: async (query) => {
      if (/buying guide|alternatives|worth it|complaints/i.test(query)) {
        return [{ url: `https://www.healthline.com/${slugQuery(query)}`, title: "Joint supplement buying guide", snippet: "Compare ingredients and which option is worth it" }];
      }
      if (/side effects|what to look for|effectiveness/i.test(query)) {
        return [{ url: `https://www.webmd.com/${slugQuery(query)}`, title: "What to look for in joint supplements?", snippet: "How do ingredients work and side effects explained" }];
      }
      if (/ingredients/i.test(query)) {
        return [{ url: `https://www.reddit.com/r/supplements/${slugQuery(query)}`, title: "Joint Support Pro ingredients discussion", snippet: "What's inside the formula" }];
      }
      if (/review/i.test(query)) {
        return [{ url: "https://www.amazon.com/jsp", title: "Joint Support Pro review", snippet: "Honest review: is it worth it?" }];
      }
      return [
        { url: "https://merchant.example/sales", title: "Sold millions ROAS 900%", snippet: "conversion rate 80% of customers" },
      ];
    },
  });
  assert(research.researchedAt === "2026-09-18T20:00:00.000Z", "research is timestamped");
  assert(research.status === "FRESH", "fresh research is FRESH");
  assert(research.sources.every((s) => s.retrievedAt === research.researchedAt), "each source has retrievedAt");
  assert(research.sources.every((s) => Boolean(s.classification && s.url && s.title)), "source provenance stored");
  assert(!research.sources.some((s) => /ROAS|conversion rate/i.test(s.relevantEvidence)), "fabricated metrics never stored as evidence");
  assert(research.signals.reviewOrientedResults >= 1, "review intent counted");
  assert(research.signals.buyerGuideResults >= 1, "buyer-guide intent counted");
  assert(research.signals.educationalResults >= 1, "educational intent counted");
  assert(research.quality, "research quality is recorded separately from confidence");
  assert(research.diversity.UNIQUE_DOMAINS >= 3, "research tracks unique domains");
  assert(research.queryOutcomes.length === research.queriesUsed.length, "every executed query has an outcome");
  assert(research.queryOutcomes.every((row) => ["SUCCESS", "SUCCESS_EMPTY", "SEARCH_TIMEOUT", "HTTP_ERROR", "PARSE_ERROR", "ABORTED"].includes(row.status)), "query outcomes use explicit statuses");
  assert(new Set(research.sources.map((s) => s.queryFamily)).size >= 2, "usable sources cover multiple query families");
  assert(!research.sources.some((s) => s.classification === "BRAND" && /official/i.test(s.title)), "Official titles are not classified BRAND");
  assert(JSON.stringify(facts) === factsSnapshot, "market research does not mutate ProductFacts");
  const researchSnapshot = JSON.stringify(research);

  const stale = withFreshness(
    { ...research, researchedAt: new Date(Date.now() - 48 * 3600_000).toISOString(), maxAgeHours: 24 },
  );
  assert(stale.status === "STALE", "research older than MARKET_RESEARCH_MAX_AGE_HOURS is STALE");
  assert(freshnessStatus(new Date().toISOString(), 24) === "FRESH", "current research is FRESH");

  const recommendation = selectStrategy({
    factsName: facts.productName,
    healthSensitive: factsAreHealthSensitive(facts),
    factsSufficient: true,
    research,
  });
  assert(STRATEGY_FAMILIES.includes(recommendation.recommendedStrategy), "recommended strategy is a known family");
  assert(STRATEGY_CONFIDENCE_LEVELS.includes(recommendation.confidence), "confidence is HIGH/MEDIUM/LOW not a numeric score");
  assert(recommendation.conversionClaim === false, "recommendation never claims conversion winner");
  assert(!/guaranteed best converting/i.test(recommendation.rationale), "rationale does not claim guaranteed conversion");
  assert(recommendation.alternatives.length === 2, "two alternative strategies remain");
  assert(recommendation.policyNotes.some((n) => /ProductFacts remain/i.test(n)), "policy notes keep ProductFacts as boundary");
  assert(factsAreHealthSensitive(facts), "supplement facts are health-sensitive");
  assert(recommendation.risks.some((r) => /medical/i.test(r)), "health products get medical-claim risk");
  assert(!/Search titles look review-oriented/i.test(recommendation.rationale), "strategy rationale is not title-keyword counting");
  assert(/intent|question|consideration|source/i.test(recommendation.rationale), "strategy rationale uses intent/source evidence");

  const unavailable = selectStrategy({
    factsName: facts.productName,
    healthSensitive: true,
    factsSufficient: true,
    research: { ...research, status: "UNAVAILABLE", sources: [], signals: { ...research.signals, reviewOrientedResults: 0, educationalResults: 0, buyerGuideResults: 0 } },
  });
  assert(unavailable.recommendedStrategy === "REVIEW", "unavailable search defaults to REVIEW");
  assert(unavailable.confidence === "LOW", "unavailable search is LOW confidence");
  assert(unavailable.recommendedStrategy === "REVIEW" && unavailable.confidence === "LOW", "TEST I: UNAVAILABLE → REVIEW LOW");

  const provenanceRec = selectStrategy({
    factsName: "Sample Product",
    healthSensitive: false,
    factsSufficient: true,
    research: stubResearch([
      {
        kind: "REVIEW_INTENT",
        sourceUrl: "https://example.com/review",
        fromQueryFamily: "PRODUCT",
        evidence: "Sample Product Review",
        strength: "MODERATE",
      },
    ]),
  });
  const trace = provenanceRec.evidenceTrace.find((item) => item.signal === "REVIEW_INTENT");
  assert(Boolean(trace), "TEST A: evidenceTrace keeps REVIEW_INTENT");
  assert(trace?.sourceUrl === "https://example.com/review", "TEST A: sourceUrl preserved");
  assert(trace?.queryFamily === "PRODUCT", "TEST A: queryFamily preserved");
  assert(trace?.evidence === "Sample Product Review", "TEST A: evidence preserved");
  assert(trace?.sourceType === "MARKET_OBSERVATION", "TEST B: sourceType=MARKET_OBSERVATION");
  assert(provenanceRec.evidenceTrace.every((item) => item.sourceType === "MARKET_OBSERVATION"), "TEST B: never PRODUCT_FACT");

  const leakFacts = emptyProductFacts("Sample Product", "https://merchant.example/s", "IMPORTED");
  leakFacts.importQuality = "SUFFICIENT";
  const leakBefore = JSON.stringify(leakFacts);
  const leakResearch = stubResearch(
    [
      { kind: "REVIEW_INTENT", evidence: "Manufacturer XYZ $49 60-day guarantee Pain Relief", sourceUrl: "https://news.example/pr" },
      { kind: "PRICE_CONCERN", evidence: "$49", sourceUrl: "https://news.example/pr" },
      { kind: "QUESTION_INTENT", evidence: "Arthritis?", sourceUrl: "https://news.example/pr", fromQueryFamily: "QUESTIONS_OBJECTIONS" },
    ],
    { questions: ["Pain Relief Arthritis Manufacturer XYZ $49 60-day guarantee"], terminology: ["Manufacturer XYZ", "Pain Relief", "Arthritis"] },
  );
  const leakResearchBefore = JSON.stringify(leakResearch);
  selectStrategy({
    factsName: leakFacts.productName,
    healthSensitive: true,
    factsSufficient: true,
    research: leakResearch,
  });
  assert(JSON.stringify(leakFacts) === leakBefore, "TEST C: ProductFacts unchanged");
  assert(!leakFacts.manufacturer, "TEST C: manufacturer stays NOT_FOUND");
  assert(!leakFacts.pricingInformation, "TEST C: pricing stays NOT_FOUND");
  assert(!leakFacts.guaranteeInformation, "TEST C: guarantee stays NOT_FOUND");
  assert(JSON.stringify(leakResearch) === leakResearchBefore, "TEST M: MarketResearch unchanged by selectStrategy");

  const safePrompt = buildPrompt({
    productName: leakFacts.productName,
    facts: leakFacts,
    targetApproach: "REVIEW",
    marketResearch: leakResearch,
  });
  assert(!/Pain Relief/i.test(safePrompt.user.split("STRATEGY CONTEXT")[0] || safePrompt.user), "TEST D: Pain Relief not in market context");
  assert(!/Arthritis/i.test(formatSafeMarketContext(leakResearch.signals)), "TEST D: Arthritis not in safe market context");
  assert(!/Manufacturer XYZ/i.test(formatSafeMarketContext(leakResearch.signals)), "TEST D: manufacturer string not in safe market context");
  assert(!/\$49/.test(formatSafeMarketContext(leakResearch.signals)), "TEST D: price not in safe market context");
  assert(!/60-day guarantee/i.test(formatSafeMarketContext(leakResearch.signals)), "TEST D: guarantee not in safe market context");
  assert(formatSafeMarketContext(leakResearch.signals).includes("REVIEW_INTENT"), "TEST D: abstract REVIEW_INTENT allowed");
  assert(formatSafeMarketContext(leakResearch.signals).includes("PRICE_CONCERN"), "TEST D: abstract PRICE_CONCERN allowed");
  assert(formatSafeMarketContext(leakResearch.signals).includes("QUESTION_INTENT"), "TEST D: abstract QUESTION_INTENT allowed");
  const factsPrompt = buildPrompt({ productName: facts.productName, facts, targetApproach: "REVIEW", marketResearch: research });
  assert(factsPrompt.user.includes("Glucosamine"), "TEST E: ProductFacts ingredient still in facts context");

  const noIngredient = selectStrategy({
    factsName: "Sample Product",
    healthSensitive: true,
    factsSufficient: true,
    research: stubResearch(
      [
        { kind: "BUYER_GUIDE_INTENT", evidence: "query: worth it", fromQueryFamily: "PURCHASE_INTENT", strength: "MODERATE" },
        { kind: "PRICE_CONCERN", evidence: "query: worth it", fromQueryFamily: "PURCHASE_INTENT", strength: "MODERATE" },
        { kind: "COMPARISON_INTENT", evidence: "query: alternatives", fromQueryFamily: "PURCHASE_INTENT", strength: "MODERATE" },
      ],
      { considerations: ["buying guide"] },
    ),
  });
  assert(noIngredient.recommendedStrategy === "BUYER_GUIDE", "TEST F: buyer-guide wins without ingredient research");
  assert(!/ingredient/i.test(noIngredient.rationale), "TEST F: rationale does not mention ingredient questions");

  const withIngredient = selectStrategy({
    factsName: "Sample Product",
    healthSensitive: true,
    factsSufficient: true,
    research: stubResearch(
      [
        { kind: "INGREDIENT_RESEARCH", evidence: "query: ingredients", fromQueryFamily: "PRODUCT", strength: "MODERATE" },
        { kind: "QUESTION_INTENT", evidence: "query: what is it", fromQueryFamily: "QUESTIONS_OBJECTIONS", strength: "MODERATE" },
        { kind: "EDUCATIONAL_INTENT", evidence: "query: how does it", fromQueryFamily: "QUESTIONS_OBJECTIONS", strength: "MODERATE" },
      ],
      { questions: ["what is inside"] },
    ),
  });
  assert(withIngredient.recommendedStrategy === "EDUCATIONAL", "TEST G: educational wins with ingredient research");
  assert(/ingredient-research/i.test(withIngredient.rationale), "TEST G: rationale may mention ingredient research");

  const sanitized = sanitizeRecommendation({
    ...provenanceRec,
    rationale: "This recommendation is not a conversion forecast.",
    risks: ["This recommendation is not a conversion forecast."],
  });
  assert(sanitized.rationale === "This recommendation is not a conversion forecast.", "TEST H: disclaimer not corrupted");
  assert(sanitized.risks[0] === "This recommendation is not a conversion forecast.", "TEST H: risk disclaimer preserved");
  const negated = sanitizeRecommendation({
    ...provenanceRec,
    rationale: "This is not a guaranteed best-converting variant.",
  });
  assert(negated.rationale === "This is not a guaranteed best-converting variant.", "TEST H: negated guaranteed phrase is not rewritten");

  const insufficient = selectStrategy({
    factsName: "Sample Product",
    healthSensitive: true,
    factsSufficient: true,
    research: stubResearch([{ kind: "BUYER_GUIDE_INTENT", evidence: "x" }], { quality: "INSUFFICIENT" }),
  });
  assert(insufficient.recommendedStrategy === "REVIEW", "TEST J: INSUFFICIENT → REVIEW");
  assert(insufficient.confidence === "LOW", "TEST J: INSUFFICIENT → LOW");

  const scoreProbe = scoresFromResearch(stubResearch([
    { kind: "REVIEW_INTENT", evidence: "a", sourceUrl: "https://a.example", strength: "MODERATE" },
  ]));
  assert(scoreProbe.REVIEW === 2, "TEST K: MODERATE REVIEW_INTENT still scores 2");
  assert(scoreProbe.BUYER_GUIDE === 0, "TEST K: unrelated family stays 0");
  assert(scoreProbe.EDUCATIONAL === 0, "TEST K: educational stays 0 without those intents");
  assert(STRATEGY_FAMILIES.join(",") === "REVIEW,EDUCATIONAL,BUYER_GUIDE", "TEST K: tie priority order unchanged");
  const selectSrc = fs.readFileSync(path.join(process.cwd(), "src/lib/strategy/select.ts"), "utf8");
  assert(selectSrc.includes("uniqueDomains >= 5"), "TEST K: HIGH uniqueDomains threshold unchanged");
  assert(selectSrc.includes("classDiversity >= 3"), "TEST K: HIGH classDiversity threshold unchanged");
  assert(selectSrc.includes("top >= 4"), "TEST K: HIGH top-score threshold unchanged");
  assert(selectSrc.includes("top - second >= 2"), "TEST K: HIGH score-gap threshold unchanged");

  const prompt = buildPrompt({
    productName: facts.productName,
    facts,
    targetApproach: recommendation.recommendedStrategy,
    marketResearch: research,
  });
  assert(prompt.user.includes("MARKET CONTEXT"), "generation prompt includes market context");
  assert(/NOT product facts/i.test(prompt.user), "market context is labeled not facts");
  assert(!prompt.user.includes("ROAS 900"), "fabricated ROAS does not enter generation prompt");
  assert(prompt.user.includes("Generate exactly one variant"), "recommended generation is single-strategy");
  assert(prompt.user.includes("Glucosamine"), "ProductFacts still bound the prompt");

  const single = parseVariantsResponse(
    JSON.stringify([{ approach: "REVIEW", headline: "A careful look at Joint Support Pro", body: "Joint Support Pro is described as a glucosamine joint supplement.\n\n## FAQ\n- What is it? A glucosamine supplement.\n\n## Final Thoughts\nCheck the source facts.", ctaLabel: "Check Current Price" }]),
    1,
  );
  assert(single.length === 1, "single-variant parse works");
  assert(single[0]!.approach === "REVIEW", "single variant keeps approach");

  const polluted = lintVariant(
    {
      approach: "REVIEW",
      headline: "Clinically proven to cure arthritis in 10 million customers",
      body: "This product is clinically proven and generally considered safe. Research shows it cures joint disease. Conversion rate is 80%.",
      ctaLabel: "Buy now",
    },
    facts.productName,
    "https://example.com/hop",
    facts,
  );
  assert(polluted.finalGate === "BLOCKED" || polluted.grounding.status === "UNGROUNDED" || polluted.lint.gate === "BLOCKED", "policy/grounding still blocks unsupported market claims in LP copy");
  const grounded = validateGrounding(polluted.body, facts);
  assert(grounded.status !== "GROUNDED", "unsupported market claim cannot enter LP as a grounded fact");

  const fallback = nextStrategyIfBlocked("BUYER_GUIDE", { ...recommendation, recommendedStrategy: "BUYER_GUIDE", fallbackIfBlocked: "REVIEW" });
  assert(fallback === "REVIEW", "blocked recommended strategy can fall back without changing facts");

  const prevDb = process.env.PRESELL_OS_DB;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mkt-"));
  process.env.PRESELL_OS_DB = path.join(tmp, "presell-os.db");
  resetDbForTests();
  const run = createValidationRun("market-strategy-test");
  const updated = updateValidationRun(run.id, {
    products: [
      {
        key: "p1",
        name: facts.productName,
        sourceUrl: facts.sourceUrl,
        origin: "IMPORT",
        affiliateUrlStored: false,
        MARKET_RESEARCH_STATUS: research.status,
        MARKET_RESEARCH_QUALITY: research.quality,
        MARKET_RESEARCH_DATE: research.researchedAt,
        MARKET_SOURCES: research.sources.length,
        RECOMMENDED_STRATEGY: recommendation.recommendedStrategy,
        STRATEGY_CONFIDENCE: recommendation.confidence,
        STRATEGY_RATIONALE: recommendation.rationale,
        ALTERNATIVES: recommendation.alternatives.map((item) => item.strategy),
      },
    ],
    marketResearch: research,
    strategy: recommendation,
  });
  assert(updated?.products[0]?.RECOMMENDED_STRATEGY === recommendation.recommendedStrategy, "Validation Lab persists RECOMMENDED_STRATEGY");
  assert(updated?.products[0]?.MARKET_RESEARCH_STATUS === "FRESH", "Validation Lab persists MARKET_RESEARCH_STATUS");
  assert(updated?.products[0]?.STRATEGY_CONFIDENCE === recommendation.confidence, "Validation Lab persists STRATEGY_CONFIDENCE");
  assert(updated?.products[0]?.MARKET_RESEARCH_QUALITY === research.quality, "Validation Lab persists MARKET_RESEARCH_QUALITY");
  assert((updated?.products[0]?.ALTERNATIVES || []).length === 2, "Validation Lab persists ALTERNATIVES");
  assert(updated?.strategy?.recommendedStrategy === recommendation.recommendedStrategy, "TEST L: strategyType preserved on run");
  assert(updated?.strategy?.confidence === recommendation.confidence, "TEST L: confidence preserved on run");
  assert(updated?.strategy?.rationale === recommendation.rationale, "TEST L: rationale preserved on run");
  assert((updated?.strategy?.evidenceTrace || []).length === recommendation.evidenceTrace.length, "TEST L: evidenceTrace preserved on run");
  assert(updated?.strategy?.researchQuality === research.quality, "TEST L: research quality preserved on recommendation/run");
  assert(updated?.products[0]?.MARKET_RESEARCH_QUALITY === research.quality, "TEST L: research quality preserved on product");
  assert(JSON.stringify(facts) === factsSnapshot, "TEST M: ProductFacts unchanged after Strategy");
  assert(JSON.stringify(research) === researchSnapshot, "TEST M: MarketResearch unchanged after Strategy");
  const candidate = insertValidationCandidate(
    composeCandidateFromVariant({
      runId: run.id,
      productKey: "p1",
      facts,
      approach: recommendation.recommendedStrategy,
      headline: "Joint Support Pro review",
      body: "Joint Support Pro includes glucosamine.\n\n## FAQ\n- Ingredient? Glucosamine.\n\n## Final Thoughts\nSee the merchant page.",
      ctaLabel: "Check Current Price",
      strategyMeta: {
        recommended: true,
        confidence: recommendation.confidence,
        rationale: recommendation.rationale,
        researchedAt: research.researchedAt,
      },
    }),
  );
  assert(candidate.strategyMeta?.recommended === true, "recommended candidate is flagged");
  assert(candidate.publicationStatus === "draft", "recommended LP stays draft");
  const listed = listValidationCandidates(run.id);
  assert(listed.length === 1, "candidate persisted on the validation run");
  const previewPath = recommendedLpPreviewPath(facts.productName, candidate.id);
  assert(previewPath.startsWith("/preview/"), "local preview path is /preview/slug/candidate");
  assert(previewPath.includes(candidate.id), "preview path includes candidate id");
  assert(!previewPath.startsWith("/p/"), "preview is not the public /p route");
  const previewUrl = recommendedLpPreviewUrl(facts.productName, candidate.id, "http://localhost:3000");
  assert(previewUrl.startsWith("http://localhost:3000/preview/"), "localhost preview URL");
  assert(validationAnalyticsAllowed() === false, "preview/validation analytics remain off");
  const flags = validationRenderFlags();
  assert(flags.renderPixel === false && flags.trackClicks === false, "no analytics/pixel in preview flags");
  assert(flags.disableAffiliateNavigation === true, "preview disables live affiliate hop");

  const generateSrc = fs.readFileSync(path.join(process.cwd(), "src/app/admin/generate/generate-client.tsx"), "utf8");
  const recPanel = fs.readFileSync(path.join(process.cwd(), "src/components/admin/market-recommendation-panel.tsx"), "utf8");
  assert(recPanel.includes("GENERATE RECOMMENDED LP"), "primary action is GENERATE RECOMMENDED LP");
  assert(recPanel.includes("View alternative strategies"), "human override alternatives remain");
  assert(recPanel.includes("Query families"), "research panel shows query families");
  assert(recPanel.includes("Query outcomes"), "research panel shows per-query outcomes");
  assert(recPanel.includes("Market signals"), "research panel shows market signals");
  assert(recPanel.includes("Source mix"), "research panel shows source mix");
  assert(recPanel.includes("Research quality"), "research panel shows research quality");
  assert(recPanel.includes("query:"), "each source shows the query that found it");
  assert(generateSrc.includes("View market research"), "operator can inspect research");
  assert(generateSrc.includes("OPEN LP"), "generated LP shows OPEN LP");
  const previewSrc = fs.readFileSync(path.join(process.cwd(), "src/app/preview/[slug]/[candidate]/page.tsx"), "utf8");
  assert(previewSrc.includes("renderPixel={VALIDATION_ISOLATION.renderPixel}"), "preview page disables pixel");
  assert(previewSrc.includes("NOT PUBLISHED"), "preview is labeled unpublished");
  const robotsSrc = fs.readFileSync(path.join(process.cwd(), "src/app/robots.ts"), "utf8");
  assert(robotsSrc.includes("/preview"), "robots disallows /preview");
  const safeCtx = formatSafeMarketContext(research.signals);
  assert(safeCtx.includes("Never invent search volume"), "safe context forbids fake analytics");
  assert(safeCtx.includes("Official"), "safe context warns Official titles are not brand evidence");

  const promoResearch = await runMarketResearch({
    facts,
    now: new Date("2026-09-18T20:00:00.000Z"),
    searchWeb: async () => [
      { url: "https://jointgenesisofficial.com/", title: "Joint Support Pro Official Website", snippet: "Buy now" },
      { url: "https://tryjointsupportusa.net/", title: "Official Site", snippet: "Official USA bottle" },
      { url: "https://getjointsupport.shop/", title: "Official USA", snippet: "Get 50% Off Today" },
      { url: "https://jointsupportpro-official.com/", title: "Official Website", snippet: "Order today" },
      { url: "https://buyjointnow.com/", title: "Joint Support Pro Official", snippet: "Official store" },
      { url: "https://jointsupportusaoffer.com/", title: "Official Site", snippet: "Limited offer" },
      { url: "https://jsp-official-site.net/", title: "Official Website", snippet: "Official USA" },
      { url: "https://jointsupportdeals.org/", title: "Get 50% Off Today", snippet: "Official website" },
    ],
  });
  assert(promoResearch.diversity.PROMOTIONAL_PATTERN_DETECTED, "repeated Official-title pattern is detected");
  assert(promoResearch.quality === "LOW" || promoResearch.quality === "INSUFFICIENT", "promo-dominated research is LOW/INSUFFICIENT quality");
  assert(!promoResearch.sources.some((source) => source.classification === "BRAND"), "promo Official pages are not BRAND");
  const promoRec = selectStrategy({
    factsName: facts.productName,
    healthSensitive: true,
    factsSufficient: true,
    research: promoResearch,
  });
  assert(promoRec.confidence === "LOW", "promo-dominated research keeps strategy confidence LOW");
  assert(promoResearch.signals.reviewOrientedResults === 0, "promotional Official titles do not count as review evidence");
  assert(promoResearch.signals.observedIntents.length === 0, "promotional pages are excluded from independent intent signals");

  resetDbForTests();
  if (prevDb) process.env.PRESELL_OS_DB = prevDb;
  else delete process.env.PRESELL_OS_DB;
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("\nMarket-aware strategy tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
