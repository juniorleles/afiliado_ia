/**
 * Real ProDentim import + generate + compose three templates + DRAFT (no publish).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { importProductFromUrl } from "../src/lib/import-product.ts";
import { generateVariants, lintVariant, wordCount } from "../src/lib/ai/generate-variants.ts";
import {
  composePresellPage,
  includedComponentLabels,
  reconstructPageBody,
  serializePresellPage,
  validateComposedPage,
  type PageTemplateId,
} from "../src/lib/presell-page.ts";
import { createCampaign, getCampaignBySlug } from "../src/lib/campaigns.ts";
import { slugify } from "../src/lib/slug.ts";

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
    if (!process.env[key]) process.env[key] = value;
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

  const templates: PageTemplateId[] = ["REVIEW", "BUYER_GUIDE", "EDITORIAL"];
  const preferred = linted.find((v) => v.approach === "BUYER_GUIDE") ?? linted[0];
  const composed = templates.map((template) => {
    const page = composePresellPage({ variant: preferred, facts, template });
    const validation = validateComposedPage(page, facts, affiliateUrl);
    return {
      template,
      headline: page.hero.headline,
      included: includedComponentLabels(page),
      omitted: page.omitted,
      imageProvenance: page.hero.image.provenance,
      imageSrcKind: page.hero.image.src.startsWith("/media/product/")
        ? "LOCAL"
        : page.hero.image.src.startsWith("http")
          ? "REMOTE"
          : "PLACEHOLDER",
      policy: validation.policy,
      grounding: validation.grounding.status,
      finalGate: validation.finalGate,
      unsupported: validation.grounding.unsupportedClaims.map((c) => c.claim.slice(0, 120)),
    };
  });

  const buyerGuidePage = composePresellPage({ variant: preferred, facts, template: "BUYER_GUIDE" });
  const validation = validateComposedPage(buyerGuidePage, facts, affiliateUrl);
  let slug = `${slugify(facts.productName || "prodentim")}-page-builder-v2`;
  if (getCampaignBySlug(slug)) slug = `${slug}-${Date.now()}`;
  const campaign = createCampaign({
    name: `${facts.productName || "ProDentim"} Page Builder V2`,
    slug,
    headline: buyerGuidePage.hero.headline,
    body: reconstructPageBody(buyerGuidePage),
    ctaLabel: buyerGuidePage.ctaLabel,
    affiliateUrl,
    headScript: null,
    adHeadline: null,
    pageTemplate: "BUYER_GUIDE",
    pageComposition: serializePresellPage(buyerGuidePage),
    productImageSrc: buyerGuidePage.hero.image.src || null,
    productImageProvenance: buyerGuidePage.hero.image.provenance,
    subheadline: buyerGuidePage.hero.subheadline,
    sourceFactsJson: JSON.stringify(facts),
  });

  const report = {
    product: facts.productName,
    importQuality: facts.importQuality,
    productImageUrl: facts.productImageUrl ?? null,
    productImageProvenance: facts.productImageProvenance,
    variantApproach: preferred.approach,
    variantGate: preferred.finalGate,
    variantGrounding: preferred.grounding.status,
    variantWordCount: wordCount(preferred.body),
    composed,
    draft: {
      id: campaign.id,
      slug: campaign.slug,
      publicationStatus: campaign.publicationStatus,
      template: campaign.pageTemplate,
      finalGate: validation.finalGate,
      published: false,
    },
    variants: linted.map((v) => ({
      approach: v.approach,
      headline: v.headline,
      wordCount: wordCount(v.body),
      grounding: v.grounding.status,
      policy: v.lint.gate,
      finalGate: v.finalGate,
    })),
  };

  mkdirSync("data", { recursive: true });
  writeFileSync("data/page-builder-e2e-last.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : "unknown");
  process.exit(1);
});
