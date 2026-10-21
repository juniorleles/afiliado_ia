/**
 * Density composition captures. Does not publish and does not change Product Facts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { getCampaignBySlug } from "../src/lib/campaigns.ts";

const OUT = path.join(process.cwd(), "data", "evidence", "premium-density-composition-v2");
const BASE = "http://127.0.0.1:3000";

const PAGES = [
  ["neuroprime", "/visual-frame/neuroprime"],
  ["cholibrium", "/admin/lab/product-showcase/cholibrium"],
  ["powder", "/admin/lab/product-showcase-powder"],
] as const;

async function main() {
  const before = {
    neuroprime: getCampaignBySlug("neuroprime"),
    cholibrium: getCampaignBySlug("cholibrium"),
  };
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results: Array<Record<string, unknown>> = [];
  try {
    const page = await browser.newPage();
    for (const [name, route] of PAGES) {
      for (const [label, width] of [
        ["desktop-1440", 1440],
        ["tablet-768", 768],
        ["mobile-390", 390],
      ] as const) {
        await page.setViewportSize({ width, height: 900 });
        const response = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
        if (response?.status() !== 200) throw new Error(`${route} ${width} status ${response?.status()}`);
        await page.waitForSelector(".psp", { timeout: 30_000 });
        const metrics = await page.evaluate(() => {
          const text = document.body.innerText;
          const html = document.documentElement.innerHTML;
          const names = document.querySelector(".psp-names-type");
          return {
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            technical: /official image not available|NO_APPROVED_PACKSHOT|PRICE_CONTEXT_INSUFFICIENT|CONTENT GATE|PREVIEW — NOT PUBLISHED/i.test(text),
            demoAsset: /demo-assets/i.test(html),
            editorial: !!document.querySelector("[data-editorial='1']"),
            hero: document.querySelector(".psp")?.getAttribute("data-hero") ?? "",
            format: document.querySelector(".psp")?.getAttribute("data-format") ?? "",
            depth: names?.getAttribute("data-depth") ?? "",
            characteristics: !!document.querySelector("#psp-characteristics"),
            price: !!document.querySelector("#psp-price"),
            cta: !!document.querySelector("a.psp-cta"),
            emptyMedia: !!document.querySelector(".psp-hero-media") && !document.querySelector(".psp-hero-media img"),
            isolatedAmount: /(?:^|\s)\$\d+(?:\.\d+)?(?:\s|$)/m.test(text) && !/bottle|pouch|total/i.test(text),
          };
        });
        if (metrics.overflow) throw new Error(`overflow ${name} ${width}`);
        if (metrics.technical) throw new Error(`technical consumer text ${name} ${width}`);
        if (metrics.emptyMedia) throw new Error(`empty media ${name} ${width}`);
        if (metrics.demoAsset) throw new Error(`demo asset on ${name}`);
        if (!metrics.editorial) throw new Error(`editorial renderer missing on ${name}`);
        if (metrics.isolatedAmount) throw new Error(`isolated price on ${name} ${width}`);
        if (name === "cholibrium" && (metrics.price || metrics.characteristics)) {
          throw new Error(`cholibrium still has a price or characteristics section at ${width}`);
        }
        if (name === "neuroprime" && !metrics.price) throw new Error("neuroprime dropped a contextual price");
        if (name === "powder" && !metrics.price) throw new Error("powder dropped a contextual price");
        const file = `${name}-${label}.png`;
        await page.screenshot({ path: path.join(OUT, file), fullPage: true });
        results.push({ name, route, width, file, ...metrics });
      }
    }
  } finally {
    await browser.close();
  }

  const after = {
    neuroprime: getCampaignBySlug("neuroprime"),
    cholibrium: getCampaignBySlug("cholibrium"),
  };
  if (before.neuroprime?.sourceFactsJson !== after.neuroprime?.sourceFactsJson) throw new Error("neuroprime facts changed");
  if (before.neuroprime?.publicationStatus !== after.neuroprime?.publicationStatus) throw new Error("neuroprime publication changed");
  if (before.neuroprime?.presentationTemplate !== after.neuroprime?.presentationTemplate) throw new Error("neuroprime template changed");
  if (before.cholibrium?.sourceFactsJson !== after.cholibrium?.sourceFactsJson) throw new Error("cholibrium facts changed");
  if (before.cholibrium?.presentationTemplate !== after.cholibrium?.presentationTemplate) throw new Error("cholibrium template changed");
  if (before.cholibrium?.publicationStatus !== after.cholibrium?.publicationStatus) throw new Error("cholibrium publication changed");

  writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({
    viewports: results,
    visualReview: "PENDING_HUMAN",
    publicationUnchanged: true,
  }, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
