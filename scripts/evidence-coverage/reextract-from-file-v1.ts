/**
 * Re-runs the deterministic extractor over an already fetched source file.
 * No network, no AI, no campaign writes.
 *
 * npx tsx scripts/evidence-coverage/reextract-from-file-v1.ts --file=<html> --url=<sourceUrl> [--name=<operator name>] [--out=<file>]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { extractProductFacts } from "../../src/lib/import-product.ts";
import { buildGenerationFactManifest, getConsumerCopyEligibleFacts } from "../../src/lib/product-facts.ts";
import { createGenerationPlan } from "../../src/lib/ai/generation-plan.ts";

const arg = (name: string) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const file = arg("file") ?? "data/generic-lp-engine/v1/prodentim-evidence-coverage-v1/source/source-raw.html";
const url = arg("url") ?? process.env.EVIDENCE_SOURCE_URL ?? "";
const operatorName = arg("name") ?? process.env.EVIDENCE_PRODUCT_NAME ?? "";
const out = arg("out");

const facts = extractProductFacts(readFileSync(file, "utf8"), url, operatorName ? { operatorProductName: operatorName } : {});
const eligible = getConsumerCopyEligibleFacts(facts);
const plan = createGenerationPlan(facts);
const manifest = buildGenerationFactManifest(facts);

console.log("CONFIDENCE", JSON.stringify(facts.confidence, null, 1));
console.log("FEATURES", JSON.stringify(facts.features, null, 1));
console.log("INGREDIENTS", JSON.stringify(facts.ingredientsOrComponents, null, 1));
console.log("USAGE", JSON.stringify(facts.usageInformation, null, 1));
console.log("CAUTIONS", JSON.stringify(facts.cautions, null, 1));
console.log("GUARANTEE", JSON.stringify(facts.guaranteeInformation));
console.log("DESCRIPTION", JSON.stringify(facts.description));
console.log("MANUFACTURER", JSON.stringify(facts.manufacturer));
console.log("PRICING", JSON.stringify(facts.pricingInformation));
console.log("IMPORT_QUALITY", facts.importQuality);
console.log("OPEN_TOPICS", plan.allowedTopics.join(", "));
console.log("CLOSED_TOPICS", plan.closedTopics.join(", "));
console.log("COPY_ELIGIBLE_MANIFEST_ITEMS", manifest.items.filter((item) => item.copyEligible).length);
console.log("ELIGIBLE_FEATURES", eligible.features.length);

if (out) {
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify({ facts, plan, manifest }, null, 2)}\n`, "utf8");
}
