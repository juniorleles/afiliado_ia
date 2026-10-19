/**
 * NeuroPrime premium draft — campaign 190 only.
 * Uses existing strategy → blueprint → sections → compose → quality.
 * Does not publish, does not generate Google Ads, does not call paid models.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { getCampaignById, setCampaignPresentationTemplate } from "../src/lib/campaigns.ts";
import { readAffiliateProgram } from "../src/lib/affiliate-program.ts";
import { refreshLandingBlueprint } from "../src/lib/landing-blueprint/refresh.ts";
import { presentLandingDocument } from "../src/lib/landing-composer/present.ts";
import { refreshLandingDocument } from "../src/lib/landing-composer/refresh.ts";
import { readStoredLandingDocument } from "../src/lib/landing-composer/store.ts";
import { refreshLandingQuality } from "../src/lib/landing-quality/refresh.ts";
import { listOfficialPromoAssets } from "../src/lib/official-assets/store.ts";
import { adaptLandingToShowcase } from "../src/lib/product-showcase/adapt.ts";
import { refreshGeneratedSections } from "../src/lib/section-generation/refresh.ts";
import { refreshStrategyDecision } from "../src/lib/strategy-decision/refresh.ts";
import { getDb } from "../src/lib/db.ts";

const ID = 190;
const OUT = path.join(process.cwd(), "data", "evidence", "neuroprime-premium-draft-v1");

function peerSnapshot() {
  return getDb()
    .prepare(
      `SELECT id, slug, publicationStatus, presentationTemplate, productImageSrc,
              length(landingDocumentJson) AS docLen, length(sourceFactsJson) AS factsLen,
              affiliateUrl, ctaLabel
       FROM campaigns WHERE id IN (186,188,189) ORDER BY id`,
    )
    .all();
}

async function main() {
  const before = getCampaignById(ID);
  if (!before || before.slug !== "neuroprime") throw new Error("campaign 190 missing");
  const peersBefore = peerSnapshot();
  const programBefore = readAffiliateProgram(ID);
  if (!programBefore) throw new Error("affiliate program missing");

  refreshStrategyDecision(ID);
  refreshLandingBlueprint(ID);
  refreshGeneratedSections(ID);
  refreshLandingDocument(ID);
  refreshLandingQuality(ID);
  setCampaignPresentationTemplate(ID, "PRODUCT_SHOWCASE_PREMIUM_V1");

  const after = getCampaignById(ID);
  if (!after) throw new Error("campaign gone");
  if (after.publicationStatus !== "draft" || after.publishedAt) throw new Error("publication changed");
  if (after.affiliateUrl || after.ctaLabel) throw new Error("CTA fields must stay empty");
  if (after.productImageSrc) throw new Error("no packshot allowed");
  if (after.sourceFactsJson !== before.sourceFactsJson) throw new Error("facts must be unchanged");
  if (after.presentationTemplate !== "PRODUCT_SHOWCASE_PREMIUM_V1") throw new Error("template not set");

  const programAfter = readAffiliateProgram(ID);
  if (JSON.stringify(programAfter) !== JSON.stringify(programBefore)) throw new Error("affiliate program changed");

  const assets = listOfficialPromoAssets(ID);
  if (assets.some((asset) => asset.status === "approved" || asset.isHero || asset.localFile)) {
    throw new Error("rejected assets must not be attached");
  }

  const document = readStoredLandingDocument(ID);
  if (!document) throw new Error("landing document missing");
  const presented = presentLandingDocument(document);
  const showcase = adaptLandingToShowcase(after, document, {
    channel: "presell",
    siteName: "Product Reviews",
    affiliateDisclosure: "Disclosure.",
    healthDisclaimer: null,
    footerLinks: [],
  });

  const visibleText = [
    showcase.productName,
    showcase.eyebrow,
    showcase.lead,
    ...showcase.highlights,
    ...showcase.characteristics.map((item) => item.text),
    ...showcase.ingredients.map((item) => item.name),
    showcase.guarantee?.text,
    ...showcase.notices,
    ...showcase.faq.flatMap((item) => [item.question, item.answer]),
  ]
    .filter(Boolean)
    .join("\n");

  const forbidden = /\b(memory|cognitive|brain health|clinically proven|study shows|testimonial|demo-assets|cholesterol)\b/i;
  if (forbidden.test(visibleText)) throw new Error("forbidden consumer copy: " + visibleText.match(forbidden)?.[0]);
  if (showcase.image) throw new Error("showcase must not have packshot");
  if (showcase.cta) throw new Error("showcase must not have CTA");
  if (showcase.mode !== "facts") throw new Error("mode must be facts");

  const peersAfter = peerSnapshot();
  if (JSON.stringify(peersAfter) !== JSON.stringify(peersBefore)) throw new Error("peer campaigns changed");

  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    path.join(OUT, "summary.json"),
    JSON.stringify(
      {
        campaignId: ID,
        template: after.presentationTemplate,
        gates: document.metadata.gates,
        included: document.metadata.included,
        omitted: document.metadata.omitted,
        presentedSections: presented.sections.map((section) => section.kind),
        omittedClaims: presented.omitted,
        sellerContextPreserved: Boolean(
          JSON.parse(after.sourceFactsJson || "{}").ingredientContext?.some(
            (entry: { copyEligibility: string }) => entry.copyEligibility === "NO",
          ),
        ),
        showcase: {
          ingredients: showcase.ingredients.length,
          guarantee: showcase.guarantee?.text ?? null,
          image: showcase.image,
          cta: showcase.cta,
          highlights: showcase.highlights,
        },
        brandPpc: programAfter?.brandPpc,
        genericSearchPpc: programAfter?.genericSearchPpc,
      },
      null,
      2,
    ),
  );

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const [name, width] of [
      ["preview-desktop-1440", 1440],
      ["preview-mobile-390", 390],
    ] as const) {
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(`http://127.0.0.1:3000/admin/preview/neuroprime`, { waitUntil: "networkidle" });
      if (response?.status() !== 200) throw new Error(`preview ${width} status ${response?.status()}`);
      const metrics = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          memory: /\bmemory\b/i.test(text),
          cognitive: /\bcognitive\b/i.test(text),
          demo: /demo-assets/i.test(document.documentElement.innerHTML),
          packshot: !!document.querySelector(".psp-hero-media img, img[src*='campaign-asset'], img[src*='demo-assets']"),
          cta: !!document.querySelector("a.psp-cta, a[href*='hop.clickbank']"),
          product: /NeuroPrime/i.test(text),
          ingredients: (text.match(/Moringa|Ginkgo|Bacopa|Spirulina|Neem/g) || []).length,
          missing: /official image not available/i.test(text),
          premium: !!document.querySelector(".psp-page, [data-psp]"),
        };
      });
      if (metrics.memory || metrics.cognitive) throw new Error("preview shows suppressed claim");
      if (metrics.demo || metrics.packshot) throw new Error("preview shows forbidden image");
      if (metrics.cta) throw new Error("preview shows CTA");
      if (!metrics.product) throw new Error("preview missing product name");
      if (metrics.overflow) throw new Error(`overflow at ${width}`);
      await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
      writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(metrics, null, 2));
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    const builder = await page.goto(`http://127.0.0.1:3000/admin/lp-builder/${ID}`, { waitUntil: "networkidle" });
    if (builder?.status() !== 200) throw new Error("builder not 200");
    const publicPage = await page.goto(`http://127.0.0.1:3000/p/neuroprime`, { waitUntil: "domcontentloaded" });
    if (publicPage?.status() !== 404) throw new Error("public route must stay 404");
  } finally {
    await browser.close();
  }

  console.log(
    JSON.stringify(
      {
        campaignId: ID,
        template: after.presentationTemplate,
        gates: document.metadata.gates,
        sections: presented.sections.map((section) => section.kind),
        omitted: presented.omitted.length,
        ingredients: showcase.ingredients.length,
        guarantee: !!showcase.guarantee,
        image: !!showcase.image,
        cta: !!showcase.cta,
        out: OUT,
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
