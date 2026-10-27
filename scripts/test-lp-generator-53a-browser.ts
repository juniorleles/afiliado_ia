// npx tsx scripts/test-lp-generator-53a-browser.ts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { diskFreeGb, DISK_STOP_GB } from "../src/lib/quality-gate/disk.ts";
import { listGenerations } from "../src/lib/lp-generator/store.ts";

const OUT = path.join(process.cwd(), "data", "evidence", "execution-53a-ai-commercial-intelligence");
const SHOTS = path.join(OUT, "screenshots");
const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";

async function main() {
  const free = diskFreeGb();
  if (Number.isFinite(free) && free < DISK_STOP_GB) throw new Error(`C: has ${free} GB free`);
  mkdirSync(SHOTS, { recursive: true });
  const latest = listGenerations().find((item) => item.productKey === "femicore" && item.previewPath);
  if (!latest?.previewPath) throw new Error("No FemiCore preview is available.");

  const browser = await chromium.launch({ headless: true, channel: "chrome" }).catch(() => chromium.launch({ headless: true }));
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const preview = await page.goto(`${BASE}${latest.previewPath}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector('[data-v4="page"]', { timeout: 60000 });
  await page.waitForFunction(
    () => {
      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>("[data-v4-image=commercial]"));
      return imgs.length === 0 || imgs.every((img) => img.complete);
    },
    { timeout: 60000 },
  );
  const metrics = await page.evaluate(() => ({
    title: document.querySelector("h1")?.textContent?.trim() ?? "",
    identity: document.querySelector(".v4-identity")?.textContent?.trim() ?? "",
    sections: Array.from(document.querySelectorAll("[data-v4-section]")).map((node) => node.getAttribute("data-v4-section")),
    imagesLoaded: Array.from(document.querySelectorAll<HTMLImageElement>("[data-v4-image=commercial]")).filter((img) => img.naturalWidth > 0).length,
    hopCtas: document.querySelectorAll('[data-v4-cta="hero"], [data-v4-cta="offers"], [data-v4-cta="sticky"]').length,
  }));
  await page.screenshot({ path: path.join(SHOTS, "femicore-desktop-1440.jpg"), type: "jpeg", quality: 55, fullPage: true });
  const hero = page.locator("[data-v4-section=hero]").first();
  if (await hero.count()) await hero.screenshot({ path: path.join(SHOTS, "femicore-hero-1440.jpg"), type: "jpeg", quality: 72 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, "femicore-mobile-390.jpg"), type: "jpeg", quality: 55, fullPage: true });
  await browser.close();

  const report = {
    previewStatus: preview?.status() ?? null,
    previewUrl: `${BASE}${latest.previewPath}`,
    generationId: latest.id,
    ...metrics,
  };
  writeFileSync(path.join(OUT, "browser-preview.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if ((report.previewStatus ?? 0) >= 400) throw new Error("Preview did not load.");
  if (!/femicore/i.test(report.title) && !/femicore/i.test(report.identity)) {
    throw new Error("Preview does not present FemiCore as the commercial identity.");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
