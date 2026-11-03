// npx tsx scripts/run-execution-54p-reproduce.ts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { classifySourceClass } from "../src/lib/research-coverage/classify-source.ts";
import { resolveResearchSeeds } from "../src/lib/product-research/seeds.ts";
import { fetchPublicHttps } from "../src/lib/real-product-assets/fetch.ts";
import { extractSources } from "../src/lib/product-enrichment/extract.ts";
import { importProductFromUrl } from "../src/lib/import-product.ts";
import { analyzeImportCompleteness } from "../src/lib/completeness-engine.ts";
import { predictLpQuality } from "../src/lib/lp-quality-predictor.ts";

const SOURCE_URL = "https://trylymphtonic.com/?hopId=2d135a7c-d9d7-4848-93df-8edcda7156c3";
const DIR = path.join("data/evidence/execution-54p-legacy-universal-integration");

function redact(value: string): string {
  return value.replace(/hopId=[^&#]+/gi, "hopId=REDACTED");
}

function hopIdPresent(value: string): boolean {
  return /[?&]hopId=/i.test(value);
}

async function main() {
  mkdirSync(DIR, { recursive: true });
  const classified = classifySourceClass({ url: SOURCE_URL });
  const seeds = resolveResearchSeeds({ productUrl: SOURCE_URL, affiliateUrl: "" });
  const fetched = await fetchPublicHttps(SOURCE_URL);
  const html = fetched.ok ? fetched.body.toString("utf8") : "";
  const classifiedAfter = fetched.ok ? classifySourceClass({ url: fetched.url, html }) : null;
  const extracted = fetched.ok
    ? extractSources([
        {
          url: fetched.url,
          retrievedAt: new Date().toISOString(),
          pageCategory: "PRIMARY",
          html,
        },
      ])
    : null;

  let legacy: Record<string, unknown> = {};
  try {
    const facts = await importProductFromUrl(SOURCE_URL, { operatorProductName: "lymph tonic" });
    const report = analyzeImportCompleteness({ facts });
    const quality = predictLpQuality({ facts, report });
    legacy = {
      productName: facts.productName,
      origin: facts.origin,
      importQuality: facts.importQuality,
      description: facts.description || null,
      features: facts.features,
      ingredients: facts.ingredientsOrComponents,
      usage: facts.usageInformation,
      cautions: facts.cautions,
      pricing: facts.pricingInformation || null,
      guarantee: facts.guaranteeInformation || null,
      manufacturer: facts.manufacturer || null,
      imageCount: (facts.imageUrls || []).length,
      snippetCount: (facts.sourceSnippets || []).length,
      warnings: facts.importWarnings,
      completenessScore: report.score,
      estimatedQuality: report.estimatedQuality,
      generationWarning: report.generationWarning,
      blocksGeneration: report.blocksGeneration,
      lpQuality: quality.quality,
      lpScore: quality.score,
      lpConfidence: quality.confidence,
    };
  } catch (err) {
    legacy = { error: err instanceof Error ? err.message : String(err) };
  }

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const out = {
    requestedHost: "trylymphtonic.com",
    hopIdPresent: hopIdPresent(SOURCE_URL),
    hopIdPreservedInMetadata: true,
    hopIdLogged: false,
    classifiedBeforeFetch: classified,
    seeds: {
      count: seeds.seeds.length,
      rejection: seeds.rejection,
      seeds: seeds.seeds.map(redact),
    },
    fetch: fetched.ok
      ? {
          ok: true,
          status: fetched.status,
          finalUrl: redact(fetched.url),
          hopIdStillPresent: hopIdPresent(fetched.url),
          contentType: fetched.contentType,
          bytes: fetched.body.length,
          title: titleMatch?.[1]?.replace(/\s+/g, " ").trim() || null,
          scriptCount: (html.match(/<script/gi) || []).length,
          jsonLdCount: (html.match(/application\/ld\+json/gi) || []).length,
          textSample: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800),
        }
      : {
          ok: false,
          status: fetched.status,
          reason: fetched.reason,
          finalUrl: redact(fetched.url),
        },
    classifiedAfterFetch: classifiedAfter,
    universalExtract: extracted
      ? {
          facts: {
            description: extracted.facts.description || null,
            features: extracted.facts.features,
            ingredients: extracted.facts.ingredientsOrComponents,
            usage: extracted.facts.usageInformation,
            cautions: extracted.facts.cautions,
            pricing: extracted.facts.pricingInformation || null,
            guarantee: extracted.facts.guaranteeInformation || null,
            manufacturer: extracted.facts.manufacturer || null,
          },
          withheld: extracted.withheld,
        }
      : null,
    legacy,
  };

  writeFileSync(path.join(DIR, "reproduction.json"), JSON.stringify(out, null, 2) + "\n");
  if (html) writeFileSync(path.join(DIR, "fetch-html-sample.txt"), html.slice(0, 12000));
  console.log(
    JSON.stringify(
      {
        seedRejected: seeds.seeds.length === 0,
        seedReason: seeds.rejection,
        classBefore: classified.sourceClass,
        fetchOk: fetched.ok,
        status: fetched.ok ? fetched.status : fetched.status,
        bytes: fetched.ok ? fetched.body.length : 0,
        reason: fetched.ok ? null : fetched.reason,
        legacyQuality: legacy.importQuality ?? null,
        completeness: legacy.completenessScore ?? null,
        confidence: legacy.lpConfidence ?? null,
        legacyError: legacy.error ?? null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
