/**
 * Exec 38 — clean captures of the adaptive Premium V1 renderer.
 * Does not publish and does not change Product Facts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { getCampaignBySlug } from "../src/lib/campaigns.ts";

const OUT = path.join(process.cwd(), "data", "evidence", "premium-adaptive-render-v1");
const BASE = "http://127.0.0.1:3000";

const PAGES = [
  ["neuroprime", "/visual-frame/neuroprime"],
  ["cholibrium", "/admin/lab/product-showcase/cholibrium"],
  ["powder", "/admin/lab/product-showcase-powder"],
  ["image-hero-demo", "/admin/lab/product-showcase-demo"],
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
          return {
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            technical: /official image not available|NO_APPROVED_PACKSHOT|CONTENT GATE|PREVIEW — NOT PUBLISHED/i.test(text),
            demoAsset: /demo-assets/i.test(html),
            editorial: !!document.querySelector("[data-editorial='1']"),
            hero: document.querySelector(".psp")?.getAttribute("data-hero") ?? "",
            format: document.querySelector(".psp")?.getAttribute("data-format") ?? "",
            cta: !!document.querySelector("a.psp-cta"),
            emptyMedia: !!document.querySelector(".psp-hero-media") && !document.querySelector(".psp-hero-media img"),
          };
        });
        if (metrics.overflow) throw new Error(`overflow ${name} ${width}`);
        if (metrics.technical) throw new Error(`technical consumer text ${name} ${width}`);
        if (metrics.emptyMedia) throw new Error(`empty media ${name} ${width}`);
        if (name !== "image-hero-demo" && metrics.demoAsset) throw new Error(`demo asset on ${name}`);
        if (name !== "image-hero-demo" && !metrics.editorial) throw new Error(`editorial renderer missing on ${name}`);
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

  let lighthouse: { status: "RECORDED" | "EVIDENCE_MISSING"; detail: string } = { status: "EVIDENCE_MISSING", detail: "not run" };
  try {
    const { execFileSync } = await import("node:child_process");
    const output = path.join(OUT, "lighthouse-neuroprime.json");
    execFileSync(
      "npx",
      ["lighthouse", `${BASE}/visual-frame/neuroprime`, "--quiet", "--chrome-flags=--headless", "--only-categories=performance,accessibility,seo,best-practices", "--output=json", `--output-path=${output}`],
      { stdio: "inherit", timeout: 180_000, shell: true },
    );
    lighthouse = { status: "RECORDED", detail: output };
  } catch (error) {
    lighthouse = { status: "EVIDENCE_MISSING", detail: error instanceof Error ? error.message : "lighthouse failed" };
    writeFileSync(path.join(OUT, "lighthouse-evidence-missing.json"), JSON.stringify(lighthouse, null, 2));
  }

  writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({
    viewports: results,
    lighthouse,
    publicationUnchanged: true,
    visualReview: "PENDING_HUMAN_REVIEW",
  }, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, lighthouse: lighthouse.status }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
