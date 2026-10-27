// npx tsx scripts/run-execution-54z-visual.ts
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { loadApprovedReviewGeneration } from "../src/lib/lp-generator/from-approved-review.ts";

const ROOT = path.join("data/evidence/execution-54z-quality-baseline");
const DESKTOP = path.join(ROOT, "screenshots/desktop");
const MOBILE = path.join(ROOT, "screenshots/mobile");
const BASE = "http://127.0.0.1:3000";

type Shot = { id: string; path: string; ok: boolean; note?: string };

async function shot(page: Page, file: string, fullPage = true): Promise<Shot> {
  try {
    await page.screenshot({ path: file, fullPage });
    return { id: path.basename(file), path: file.replace(/\\/g, "/"), ok: existsSync(file) };
  } catch (err) {
    return { id: path.basename(file), path: file.replace(/\\/g, "/"), ok: false, note: err instanceof Error ? err.message : String(err) };
  }
}

async function capture(page: Page, dir: string, prefix: string, url: string): Promise<Shot[]> {
  mkdirSync(dir, { recursive: true });
  const shots: Shot[] = [];
  await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-v4='page']").waitFor({ timeout: 25_000 });
  shots.push(await shot(page, path.join(dir, `${prefix}-viewport.png`), false));
  shots.push(await shot(page, path.join(dir, `${prefix}-full.png`)));
  const hero = page.locator("#hero, [data-v4-section='hero']").first();
  if (await hero.count()) shots.push(await shot(hero, path.join(dir, `${prefix}-hero.png`), false));
  const gallery = page.locator("[data-v4-section='gallery']").first();
  if (await gallery.count()) shots.push(await shot(gallery, path.join(dir, `${prefix}-gallery.png`), false));
  const legal = page.locator("[data-v4-section='legal']").first();
  if (await legal.count()) shots.push(await shot(legal, path.join(dir, `${prefix}-legal.png`), false));
  return shots;
}

async function main() {
  const latest = loadApprovedReviewGeneration(237);
  if (!latest?.previewPath) throw new Error("No SANDBOX preview for campaign 237.");
  const all: Shot[] = [];
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const dPage = await desktop.newPage();
    all.push(...(await capture(dPage, DESKTOP, "237", latest.previewPath)));
    await desktop.close();
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mPage = await mobile.newPage();
    all.push(...(await capture(mPage, MOBILE, "237", latest.previewPath)));
    await mobile.close();
  } finally {
    await browser.close();
  }
  mkdirSync(path.join(ROOT, "reports"), { recursive: true });
  writeFileSync(path.join(ROOT, "reports/screenshots.json"), `${JSON.stringify({ shots: all, previewPath: latest.previewPath }, null, 2)}\n`);
  console.log(`54Z visual ${all.filter((item) => item.ok).length}/${all.length} preview=${latest.previewPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
