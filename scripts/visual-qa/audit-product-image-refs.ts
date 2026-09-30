import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { getCampaignBySlug } from "../../src/lib/campaigns.ts";

const IMAGE_URL = /https?:\/\/[^\s"'<>]+?\.(?:png|jpe?g|webp|gif|avif)(?:\?[^\s"'<>]*)?/gi;

function collect(value: unknown, found: Set<string>, depth = 0) {
  if (depth > 8 || value == null) return;
  if (typeof value === "string") {
    for (const match of value.matchAll(IMAGE_URL)) found.add(match[0]);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collect(item, found, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (/affiliate|hop|clickbank/i.test(key)) continue;
      collect(item, found, depth + 1);
    }
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid";
  }
}

const campaign = getCampaignBySlug("joint-genesis-controlled-ready-13");
if (!campaign) {
  console.log("CAMPAIGN=MISSING");
  process.exit(1);
}
console.log(`PRODUCT_IMAGE_SRC=${campaign.productImageSrc || ""}`);
console.log(`PRODUCT_IMAGE_PROVENANCE=${campaign.productImageProvenance || ""}`);
console.log(`PRODUCT_ASSET_STATUS=${campaign.productAssetStatus || ""}`);
const facts = campaign.sourceFactsJson ? (JSON.parse(campaign.sourceFactsJson) as Record<string, unknown>) : null;
console.log(`FACTS_IMAGE_URL=${typeof facts?.productImageUrl === "string" ? facts.productImageUrl : ""}`);
console.log(`FACTS_IMAGE_PROVENANCE=${typeof facts?.productImageProvenance === "string" ? facts.productImageProvenance : ""}`);
console.log(`SOURCE_HOST=${typeof facts?.sourceUrl === "string" ? hostOf(facts.sourceUrl) : ""}`);

const found = new Set<string>();
collect(facts, found);
const files = [
  "data/controlled-ready-13/2026-09-21-controlled-visual-13/import-facts.json",
  "data/web-anatomy-lab/v1/controlled-rich-replay-v4/pre-model.json",
  "data/web-anatomy-lab/v1/controlled-rich-replay-v4/REPORT.json",
];
for (const file of files) {
  try {
    collect(JSON.parse(readFileSync(file, "utf8")), found);
    console.log(`SCANNED=${file}`);
  } catch {
    console.log(`MISSING=${file}`);
  }
}
console.log(`IMAGE_URL_COUNT=${found.size}`);
for (const url of found) console.log(`IMAGE_URL=${url}`);

const dir = "data/product-images";
for (const name of readdirSync(dir)) {
  const file = path.join(dir, name);
  if (!statSync(file).isFile()) continue;
  console.log(`LOCAL=${name} BYTES=${statSync(file).size}`);
}
