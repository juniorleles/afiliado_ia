/**
 * Real import + generate + lint + grounding. Does not create or publish a campaign.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { importProductFromUrl } from "../src/lib/import-product.ts";
import { generateVariants, lintVariant, wordCount } from "../src/lib/ai/generate-variants.ts";

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

async function main() {
  loadLocalEnv();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("NO_API_KEY");
    process.exit(2);
  }

  const sourceUrl =
    "https://prodentim101.com/text.php?hop=zzzzz&hopId=2f1ff64b-0003-4187-b22b-617d5ad45378";
  const affiliateUrl = "https://56356cy8tqllbwc9vdj7vqxd1e.hop.clickbank.net";

  const facts = await importProductFromUrl(sourceUrl, { operatorProductName: "ProDentim" });
  const variants = await generateVariants({
    productName: facts.productName || "ProDentim",
    sourceUrl: facts.sourceUrl || sourceUrl,
    facts,
  });
  const linted = variants.map((variant) =>
    lintVariant(variant, facts.productName || "ProDentim", affiliateUrl, facts),
  );

  const report = {
    product: facts.productName,
    importQuality: facts.importQuality,
    campaignCreated: false,
    campaignPublished: false,
    variants: linted.map((v) => ({
      approach: v.approach,
      headline: v.headline,
      wordCount: wordCount(v.body),
      grounding: v.grounding.status,
      policy: v.lint.gate,
      finalGate: v.finalGate,
      warnings: v.lint.warningCount,
      blocking: v.lint.blockingCount,
      unsupported: v.grounding.unsupportedClaims.map((c) => ({
        claim: c.claim.slice(0, 160),
        reason: c.reason,
      })),
      healthFindings: v.lint.majorFindings
        .filter((f) => f.ruleId.startsWith("health.") || f.ruleId.startsWith("unv."))
        .map((f) => ({ ruleId: f.ruleId, status: f.status, evidence: f.evidence })),
    })),
  };

  mkdirSync("data", { recursive: true });
  writeFileSync("data/grounding-e2e-last.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "unknown");
  process.exit(1);
});
