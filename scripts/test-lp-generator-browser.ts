// npx tsx scripts/test-lp-generator-browser.ts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { diskFreeGb, DISK_STOP_GB } from "../src/lib/quality-gate/disk.ts";
import { listGenerations } from "../src/lib/lp-generator/store.ts";

const OUT = path.join(process.cwd(), "data", "evidence", "execution-53-universal-lp-generator");
const SHOTS = path.join(OUT, "screenshots");
const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";

async function main() {
  const free = diskFreeGb();
  if (Number.isFinite(free) && free < DISK_STOP_GB) {
    throw new Error(`C: has ${free} GB free; stop below ${DISK_STOP_GB} GB`);
  }
  mkdirSync(SHOTS, { recursive: true });
  const latest = listGenerations().find((item) => item.productKey === "femicore" && item.previewPath);
  if (!latest?.previewPath) throw new Error("No FemiCore generation preview is available.");

  const browser = await chromium.launch({ headless: true, channel: "chrome" }).catch(() => chromium.launch({ headless: true }));
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const failures: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/admin/lab/") && !response.ok()) {
      failures.push(`${response.status()} ${response.url()}`);
    }
  });

  const generator = await page.goto(`${BASE}/admin/lab/lp-generator`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.screenshot({ path: path.join(SHOTS, "generator-form-1440.jpg"), type: "jpeg", quality: 70, fullPage: true });

  const detail = await page.goto(`${BASE}/admin/lab/lp-generator/${latest.id}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.screenshot({ path: path.join(SHOTS, "generation-detail-1440.jpg"), type: "jpeg", quality: 70, fullPage: true });

  const preview = await page.goto(`${BASE}${latest.previewPath}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector('[data-v4="page"]', { timeout: 60000 });
  await page.waitForFunction(
    () => {
      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>("[data-v4-image=commercial]"));
      return imgs.length === 0 || imgs.every((img) => img.complete);
    },
    { timeout: 60000 },
  );
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(800);

  const metrics = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('[data-v4="page"] img'));
    const sections = Array.from(document.querySelectorAll("[data-v4-section]")).map((node) => node.getAttribute("data-v4-section"));
    return {
      title: document.querySelector("h1")?.textContent?.trim() ?? "",
      sections,
      images: imgs.map((img) => ({
        src: img.currentSrc || img.src,
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        alt: img.alt,
      })),
      hopCtas: document.querySelectorAll('[data-v4-cta="hero"], [data-v4-cta="offers"], [data-v4-cta="sticky"]').length,
      loadedImages: imgs.filter((img) => img.complete && img.naturalWidth > 0).length,
    };
  });

  await page.screenshot({ path: path.join(SHOTS, "femicore-desktop-1440.jpg"), type: "jpeg", quality: 55, fullPage: true });
  const hero = page.locator("[data-v4-section=hero]").first();
  if (await hero.count()) await hero.screenshot({ path: path.join(SHOTS, "femicore-hero-1440.jpg"), type: "jpeg", quality: 72 });
  for (const section of ["differentiators", "specifications", "offers", "faq"]) {
    const loc = page.locator(`[data-v4-section=${section}]`).first();
    if (await loc.count()) {
      await loc.screenshot({ path: path.join(SHOTS, `femicore-section-${section}-1440.jpg`), type: "jpeg", quality: 70 });
    }
  }

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, "femicore-tablet-768.jpg"), type: "jpeg", quality: 55, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, "femicore-mobile-390.jpg"), type: "jpeg", quality: 55, fullPage: true });

  await browser.close();

  const report = {
    diskFreeGb: free,
    generatorStatus: generator?.status() ?? null,
    detailStatus: detail?.status() ?? null,
    previewStatus: preview?.status() ?? null,
    previewUrl: `${BASE}${latest.previewPath}`,
    generationId: latest.id,
    httpFailures: failures,
    ...metrics,
    imagesLoaded: metrics.images.filter((item) => item.naturalWidth > 0).length,
    screenshots: [
      "screenshots/generator-form-1440.jpg",
      "screenshots/generation-detail-1440.jpg",
      "screenshots/femicore-desktop-1440.jpg",
      "screenshots/femicore-hero-1440.jpg",
      "screenshots/femicore-tablet-768.jpg",
      "screenshots/femicore-mobile-390.jpg",
    ],
  };
  writeFileSync(path.join(OUT, "browser-preview.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if ((report.previewStatus ?? 0) >= 400) throw new Error("Preview did not load.");
  if (report.hopCtas > 0) throw new Error("Preview rendered a purchase CTA without an authorized hop.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
