/**
 * Exec 34 — capture clean Premium V1 presentation without official image.
 * Does not change Product Facts, gates, assets, CTA, or publicationStatus.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { getCampaignById } from "../src/lib/campaigns.ts";

const ID = 190;
const OUT = path.join(process.cwd(), "data", "evidence", "neuroprime-no-image-presentation-v1");
const BASE = "http://127.0.0.1:3000";

async function main() {
  const campaign = getCampaignById(ID);
  if (!campaign || campaign.slug !== "neuroprime") throw new Error("campaign 190 missing");
  if (campaign.publicationStatus !== "draft") throw new Error("must remain draft");
  if (campaign.presentationTemplate !== "PRODUCT_SHOWCASE_PREMIUM_V1") throw new Error("Premium V1 required");
  if (campaign.productImageSrc) throw new Error("this capture expects no official image");

  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const results: Array<Record<string, unknown>> = [];

    for (const [name, width] of [
      ["clean-desktop-1440", 1440],
      ["clean-tablet-768", 768],
      ["clean-mobile-390", 390],
    ] as const) {
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(`${BASE}/visual-frame/neuroprime`, { waitUntil: "networkidle" });
      if (response?.status() !== 200) throw new Error(`visual-frame ${width} status ${response?.status()}`);

      const metrics = await page.evaluate(() => {
        const text = document.body.innerText;
        const html = document.documentElement.innerHTML;
        return {
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          technicalMissing: /official image not available/i.test(text),
          adminChrome: /PREVIEW — NOT PUBLISHED|CONTENT GATE|Design Studio|Clean LP preview/i.test(text),
          memory: /\bmemory\b/i.test(text),
          cognitive: /\bcognitive\b/i.test(text),
          demo: /demo-assets/i.test(html),
          packshot: !!document.querySelector(".psp-hero-media img, img[src*='campaign-asset'], img[src*='demo-assets']"),
          emptyMediaSlot: !!document.querySelector(".psp-hero-media"),
          editorialHero: !!document.querySelector(".psp-hero-editorial"),
          typeGrid: !!document.querySelector(".psp-names-type"),
          cta: !!document.querySelector("a.psp-cta, a[href*='hop.clickbank']"),
          product: /NeuroPrime/i.test(text),
          ingredients: (text.match(/Moringa|Ginkgo|Bacopa|Spirulina|Neem/g) || []).length,
          hasImageAttr: document.querySelector('.psp[data-has-image="0"]') != null,
        };
      });

      if (metrics.technicalMissing) throw new Error("consumer technical missing-image text still present");
      if (metrics.adminChrome) throw new Error("clean preview still shows admin chrome");
      if (metrics.memory || metrics.cognitive) throw new Error("suppressed claim visible");
      if (metrics.demo || metrics.packshot) throw new Error("forbidden image visible");
      if (metrics.emptyMediaSlot) throw new Error("empty media slot still reserved");
      if (!metrics.editorialHero) throw new Error("editorial no-image hero missing");
      if (!metrics.typeGrid) throw new Error("typographic ingredient grid missing");
      if (metrics.cta) throw new Error("CTA must stay absent without hoplink");
      if (!metrics.product) throw new Error("product name missing");
      if (metrics.overflow) throw new Error(`overflow at ${width}`);
      if (!metrics.hasImageAttr) throw new Error("data-has-image=0 missing");

      await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
      writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(metrics, null, 2));
      results.push({ name, width, ...metrics });
    }

    const publicPage = await page.goto(`${BASE}/p/neuroprime`, { waitUntil: "domcontentloaded" });
    if (publicPage?.status() !== 404) throw new Error("public draft must stay 404");

    const adminPreview = await page.goto(`${BASE}/admin/preview/neuroprime`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    if (adminPreview?.status() !== 200) throw new Error("admin preview must remain available");
    await page.waitForSelector("text=Clean LP preview", { timeout: 30_000 });
    const adminHasLink = await page.evaluate(() => /Clean LP preview/i.test(document.body.innerText));
    if (!adminHasLink) throw new Error("admin preview missing Clean LP preview link");

    writeFileSync(
      path.join(OUT, "summary.json"),
      JSON.stringify(
        {
          campaignId: ID,
          slug: campaign.slug,
          template: campaign.presentationTemplate,
          publicationStatus: campaign.publicationStatus,
          productImageSrc: campaign.productImageSrc,
          cleanPreviewRoute: "/visual-frame/neuroprime",
          adminPreviewPreserved: true,
          publicDraft404: true,
          viewports: results,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify({ ok: true, out: OUT }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
