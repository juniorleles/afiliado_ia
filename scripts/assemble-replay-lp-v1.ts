/**
 * Assembles a replay's frozen content plus its visual artifacts into a draft
 * campaign the generic renderer can present. Copy is never rewritten here and
 * the campaign stays a draft: publication remains a separate human decision.
 *
 * npx tsx scripts/assemble-replay-lp-v1.ts --dir=<replay dir> --slug=<campaign slug>
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createCampaign, getCampaignBySlug, updateCampaign, type Campaign } from "../src/lib/campaigns.ts";
import { applyDesignToCampaign } from "../src/lib/design/optimize.ts";
import { PRODUCTION_PRESENTATION_ID, saveProductionCandidateSnapshot } from "../src/lib/production-candidate.ts";
import { composePresellPage, serializePresellPage } from "../src/lib/presell-page.ts";
import { approachToTemplate } from "../src/lib/validation/pipeline.ts";
import { VALIDATION_SAFE_AFFILIATE } from "../src/lib/validation/constants.ts";
import { resolvePublicationGate } from "../src/lib/publication.ts";
import type { ProductFacts } from "../src/lib/product-facts.ts";

const replayDir = process.argv.find((item) => item.startsWith("--dir="))?.slice(6);
const slug = process.argv.find((item) => item.startsWith("--slug="))?.slice(7);
if (!replayDir || !slug) throw new Error("--dir and --slug are required");
const visualDir = path.join(replayDir, "visual-construction-v1");
const readJson = <T,>(file: string) => JSON.parse(readFileSync(file, "utf8")) as T;

const revalidation = readJson<{ contentReadiness: string }>(path.join(replayDir, "policy-semantics-v1", "revalidation.json"));
if (revalidation.contentReadiness !== "CONTENT_READY") {
  console.log(`STOP=CONTENT_NOT_READY readiness=${revalidation.contentReadiness}`);
  process.exit(0);
}

const facts = readJson<{ facts: ProductFacts }>(path.join(replayDir, "product-facts.json")).facts;
const copy = readJson<{ headline: string; body: string; ctaLabel: string }>(path.join(replayDir, "policy-semantics-v1", "copy.json"));

// ---- install the visual artifacts where the renderer reads them -----------
const masterRoot = path.join("data", "visual-design", slug, "visual-master");
const generatedOut = path.join(masterRoot, "assets", "generated");
const provenanceOut = path.join(masterRoot, "assets", "provenance");
mkdirSync(generatedOut, { recursive: true });
mkdirSync(provenanceOut, { recursive: true });
let installed = 0;
for (const name of readdirSync(path.join(visualDir, "generated"))) {
  copyFileSync(path.join(visualDir, "generated", name), path.join(generatedOut, name));
  installed += 1;
}
for (const name of readdirSync(path.join(visualDir, "provenance"))) {
  copyFileSync(path.join(visualDir, "provenance", name), path.join(provenanceOut, name));
}
copyFileSync(path.join(visualDir, "product-visual-plan.json"), path.join(masterRoot, "product-visual-plan.json"));

// ---- the page, composed from the frozen copy and the frozen facts ---------
const variant = { approach: "REVIEW" as const, headline: copy.headline, body: copy.body, ctaLabel: copy.ctaLabel };
const page = composePresellPage({ variant, facts, template: approachToTemplate(variant.approach) });
const pageComposition = serializePresellPage(page);

const input = {
  name: facts.productName,
  slug,
  headline: copy.headline,
  body: copy.body,
  ctaLabel: copy.ctaLabel,
  affiliateUrl: VALIDATION_SAFE_AFFILIATE,
  headScript: null,
  adHeadline: null,
  pageTemplate: approachToTemplate(variant.approach),
  pageComposition,
  productImageSrc: null,
  productImageProvenance: null,
  subheadline: null,
  sourceFactsJson: JSON.stringify(facts),
};

const existing = getCampaignBySlug(slug);
let campaign: Campaign = existing ? updateCampaign(existing.id, { ...input }) : createCampaign(input);
if (campaign.publicationStatus !== "draft") throw new Error("campaign is not a draft");

async function main() {
  const designed = await applyDesignToCampaign(slug);
  campaign = designed.campaign;
  if (!campaign.creativeCompositionJson) throw new Error("creative composition missing");
  if (campaign.headline !== copy.headline || campaign.body !== copy.body || campaign.ctaLabel !== copy.ctaLabel) {
    throw new Error("copy changed during design");
  }
  const snapshot = saveProductionCandidateSnapshot(campaign.id, {
    productionPageComposition: campaign.pageComposition ?? pageComposition,
    productionCreativeCompositionJson: campaign.creativeCompositionJson,
    productionPresentation: PRODUCTION_PRESENTATION_ID,
  });
  writeFileSync(
    path.join(visualDir, "assembly.json"),
    `${JSON.stringify(
      {
        assemblyVersion: "replay-lp-assembly-v1",
        slug,
        campaignId: snapshot.id,
        presentation: snapshot.productionPresentation,
        publicationStatus: snapshot.publicationStatus,
        publicationGate: resolvePublicationGate(snapshot),
        generatedAssetsInstalled: installed,
        visualMasterRoot: masterRoot,
        contentRegenerated: false,
        factsChanged: snapshot.sourceFactsJson !== JSON.stringify(facts),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(`CAMPAIGN=${snapshot.slug} id=${snapshot.id} status=${snapshot.publicationStatus} presentation=${snapshot.productionPresentation}`);
  console.log(`ASSETS_INSTALLED=${installed} PRODUCT_VISUAL_PLAN=${existsSync(path.join(masterRoot, "product-visual-plan.json")) ? "YES" : "NO"}`);
  console.log(`COPY_UNCHANGED=YES FACTS_UNCHANGED=${snapshot.sourceFactsJson === JSON.stringify(facts) ? "YES" : "NO"}`);
  console.log(`PUBLICATION_GATE=${resolvePublicationGate(snapshot)}`);
}

void main();
