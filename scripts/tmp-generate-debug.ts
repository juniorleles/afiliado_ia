/**
 * SAFE generation diagnostic. Does not print or write API keys.
 * Reproduces the old 4096 unstructured path, then runs generateVariants
 * (structured output + parser). Does not create or publish a campaign.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { classifyJsonPayload, extractJsonText } from "../src/lib/ai/parse-ai-json.ts";
import {
  generateVariants,
  parseVariantsResponse,
  VARIANT_JSON_SCHEMA,
  wordCount,
} from "../src/lib/ai/generate-variants.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";

function loadLocalEnv() {
  if (!existsSync(".env.local")) return;
  const text = readFileSync(".env.local", "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key === "ANTHROPIC_API_KEY" && !process.env.ANTHROPIC_API_KEY) {
      process.env.ANTHROPIC_API_KEY = value;
    }
  }
}

function prodentimFacts() {
  const facts = emptyProductFacts("ProDentim", "https://prodentim.com/", "IMPORTED");
  facts.description = "a chewable oral probiotic tablet with 3.5 billion probiotic strains.";
  facts.confidence.description = "DIRECT_SOURCE";
  facts.features = ["supports gums", "supports mouth bacteria"];
  facts.confidence.features = "DIRECT_SOURCE";
  facts.ingredientsOrComponents = ["Lactobacillus Paracasei", "Lactobacillus Reuteri"];
  facts.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
  facts.usageInformation = ["chew a tablet every morning"];
  facts.confidence.usageInformation = "DIRECT_SOURCE";
  facts.guaranteeInformation = "60-day money-back guarantee";
  facts.confidence.guaranteeInformation = "DIRECT_SOURCE";
  facts.importQuality = "SUFFICIENT";
  return facts;
}

async function reproduceLegacyPath(apiKey: string) {
  const SYSTEM = `You are a native English editorial writer.
Respond with ONLY a JSON array of exactly 3 objects:
[{"approach":"REVIEW","headline":string,"body":string,"ctaLabel":string},
 {"approach":"EDUCATIONAL","headline":string,"body":string,"ctaLabel":string},
 {"approach":"BUYER_GUIDE","headline":string,"body":string,"ctaLabel":string}]
Each body must include ## What Is, ## Key Features, ## FAQ, ## Final Thoughts and several paragraphs.`;

  const USER = `PRODUCT FACTS
Product name: ProDentim
Description: a chewable oral probiotic tablet with 3.5 billion probiotic strains.
Features: supports gums; supports mouth bacteria
Ingredients: Lactobacillus Paracasei; Lactobacillus Reuteri
Usage: chew a tablet every morning
Guarantee: 60-day money-back guarantee
Generate exactly three variants now as a JSON array only.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      system: SYSTEM,
      messages: [{ role: "user", content: USER }],
    }),
  });

  const payload = (await response.json()) as {
    stop_reason?: string;
    content?: Array<{ type: string; text?: string }>;
    error?: { type?: string };
  };

  const text = payload.content?.find((b) => b.type === "text")?.text ?? "";
  let parseOk = false;
  let parseError = "";
  try {
    parseVariantsResponse(text);
    parseOk = true;
  } catch (err) {
    parseError = err instanceof Error ? err.message : "unknown";
  }

  let extractSource = null as string | null;
  try {
    extractSource = extractJsonText(text).source;
  } catch {
    extractSource = null;
  }

  return {
    httpStatus: response.status,
    stopReason: payload.stop_reason ?? null,
    errorType: payload.error?.type ?? null,
    contentLength: text.length,
    startsWith: text.slice(0, 80).replace(/\s+/g, " "),
    endsWith: text.slice(-80).replace(/\s+/g, " "),
    hasFence: /```/.test(text),
    classification: classifyJsonPayload(text),
    extractSource,
    parseOk,
    parseError: parseError.slice(0, 200),
  };
}

async function probeStructuredSchema(apiKey: string) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 256,
      system: "Return JSON matching the schema.",
      messages: [{ role: "user", content: "Return one REVIEW variant about ProDentim using only: chewable oral probiotic." }],
      output_config: {
        format: {
          type: "json_schema",
          schema: VARIANT_JSON_SCHEMA,
        },
      },
    }),
  });
  const payload = (await response.json()) as {
    stop_reason?: string;
    error?: { type?: string; message?: string };
    content?: Array<{ type: string; text?: string }>;
  };
  const errMsg = payload.error?.message ?? "";
  return {
    httpStatus: response.status,
    errorType: payload.error?.type ?? null,
    errorMentionsMinItems: /minItems|maxItems/i.test(errMsg),
    stopReason: payload.stop_reason ?? null,
    hasText: Boolean(payload.content?.some((b) => b.type === "text" && b.text)),
  };
}

async function main() {
  loadLocalEnv();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("NO_API_KEY");
    process.exit(2);
  }

  const legacy = await reproduceLegacyPath(apiKey);
  const structuredProbe = await probeStructuredSchema(apiKey);

  let live: Record<string, unknown> = { skipped: true };
  try {
    const variants = await generateVariants({
      productName: "ProDentim",
      sourceUrl: "https://prodentim.com/",
      facts: prodentimFacts(),
    });
    live = {
      skipped: false,
      count: variants.length,
      approaches: variants.map((v) => v.approach),
      headlines: variants.map((v) => v.headline.slice(0, 80)),
      wordCounts: variants.map((v) => wordCount(v.body)),
      ctaLabels: variants.map((v) => v.ctaLabel),
    };
  } catch (err) {
    live = {
      skipped: false,
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 240) : "unknown",
    };
  }

  const summary = { legacy, structuredProbe, live };
  mkdirSync("data", { recursive: true });
  writeFileSync("data/generate-last-debug.json", JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "unknown");
  process.exit(1);
});
