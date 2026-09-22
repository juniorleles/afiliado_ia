import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { uniqueIntentKinds } from "../src/lib/market-research/signals.ts";
import { researchAndRecommend } from "../src/lib/strategy/execute-recommended.ts";

async function main() {
  const productName = process.argv.slice(2).join(" ").trim() || "Joint Genesis";
  const facts = emptyProductFacts(productName, "", "MANUAL");
  facts.importQuality = "SUFFICIENT";
  facts.confidence.productName = "MANUAL";

  const { research, recommendation } = await researchAndRecommend(facts);
  const classes = [...new Set(research.sources.map((source) => source.classification))];
  const intents = uniqueIntentKinds(research.signals.observedIntents || []);

  const lines = [
    `PRODUCT=${productName}`,
    `QUERIES_RUN=${research.queriesUsed.length}`,
    `QUERIES=${research.queriesUsed.join(" | ")}`,
    `SEARCH_RESULTS_TOTAL=${research.diversity?.SEARCH_RESULTS_TOTAL ?? 0}`,
    `USABLE_SOURCES=${research.diversity?.USABLE_SOURCES ?? research.sources.length}`,
    `UNIQUE_DOMAINS=${research.diversity?.UNIQUE_DOMAINS ?? 0}`,
    `SOURCE_CLASSES=${classes.join(",") || "none"}`,
    `PROMOTIONAL_SOURCES=${research.diversity?.PROMOTIONAL_SOURCES ?? 0}`,
    `PROMOTIONAL_PATTERN_DETECTED=${research.diversity?.PROMOTIONAL_PATTERN_DETECTED ? "true" : "false"}`,
    `MARKET_RESEARCH_QUALITY=${research.quality}`,
    `OBSERVED_INTENT_SIGNALS=${intents.join(",") || "none"}`,
    `RECOMMENDED_STRATEGY=${recommendation.recommendedStrategy}`,
    `STRATEGY_CONFIDENCE=${recommendation.confidence}`,
    `RATIONALE=${recommendation.rationale}`,
    "",
    "SOURCES:",
  ];
  for (const source of research.sources) {
    lines.push(
      `- class=${source.classification} domain=${source.domain} query=${JSON.stringify(source.query)} title=${JSON.stringify(source.title)} promo=${source.promotional}`,
    );
  }
  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
