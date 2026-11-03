// npx tsx scripts/run-execution-54x-visual.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { loadApprovedReviewGeneration } from "../src/lib/lp-generator/from-approved-review.ts";

const ROOT = path.join("data/evidence/execution-54x-deep-product-research");
const DESKTOP = path.join(ROOT, "screenshots/desktop");
const MOBILE = path.join(ROOT, "screenshots/mobile");
const ADMIN = path.join(ROOT, "screenshots/admin");
const BASE = "http://127.0.0.1:3000";
const OLD = "/admin/lab/lp-generator/lp-mvpna0tv-badd6f51/preview";

type Shot = { id: string; path: string; ok: boolean; note?: string };

async function shot(page: Page, file: string, fullPage = true): Promise<Shot> {
  try {
    await page.screenshot({ path: file, fullPage });
    return { id: path.basename(file), path: file.replace(/\\/g, "/"), ok: existsSync(file) };
  } catch (err) {
    return { id: path.basename(file), path: file.replace(/\\/g, "/"), ok: false, note: err instanceof Error ? err.message : String(err) };
  }
}

async function captureRenderer(page: Page, dir: string, prefix: string, url: string): Promise<Shot[]> {
  mkdirSync(dir, { recursive: true });
  const shots: Shot[] = [];
  await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-v4='page']").waitFor({ timeout: 25_000 });
  shots.push(await shot(page, path.join(dir, `${prefix}-full.png`)));
  const hero = page.locator("#hero, [data-v4-section='hero']").first();
  if (await hero.count()) shots.push(await shot(hero, path.join(dir, `${prefix}-hero.png`), false));
  const gallery = page.locator("[data-v4-section='gallery']").first();
  if (await gallery.count()) shots.push(await shot(gallery, path.join(dir, `${prefix}-gallery.png`), false));
  const ingredients = page.locator("text=Ingredients").first();
  if (await ingredients.count()) shots.push(await shot(page.locator("section:has-text('Ingredients'), [data-v4-section='specifications']").first(), path.join(dir, `${prefix}-ingredients.png`), false).catch(async () => shot(page, path.join(dir, `${prefix}-ingredients.png`), false)));
  const guarantee = page.locator("[data-v4-section='guarantee'], .ds-guarantee").first();
  if (await guarantee.count()) shots.push(await shot(guarantee, path.join(dir, `${prefix}-guarantee.png`), false));
  const legal = page.locator("[data-v4-section='legal']").first();
  if (await legal.count()) shots.push(await shot(legal, path.join(dir, `${prefix}-legal.png`), false));
  return shots;
}

async function main() {
  mkdirSync(DESKTOP, { recursive: true });
  mkdirSync(MOBILE, { recursive: true });
  mkdirSync(ADMIN, { recursive: true });
  const latest = loadApprovedReviewGeneration(237);
  const all: Shot[] = [];
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const dPage = await desktop.newPage();
    if (existsSync(path.join("data/lp-generations/lp-mvpna0tv-badd6f51/model.json"))) {
      all.push(...(await captureRenderer(dPage, DESKTOP, "old-237", OLD)));
    }
    if (latest?.previewPath) {
      all.push(...(await captureRenderer(dPage, DESKTOP, "new-237", latest.previewPath)));
    }
    await dPage.goto(`${BASE}/admin/237/fatos`, { waitUntil: "domcontentloaded" });
    await dPage.getByText(/Pesquisa/).first().waitFor({ timeout: 25_000 });
    all.push(await shot(dPage, path.join(ADMIN, "fatos-237-overview.png")));
    await dPage.getByRole("tab", { name: "Informações do produto" }).click();
    await dPage.waitForTimeout(400);
    all.push(await shot(dPage, path.join(ADMIN, "fatos-237-informacoes.png")));
    await dPage.getByRole("tab", { name: "Prévia" }).click();
    await dPage.waitForTimeout(400);
    all.push(await shot(dPage, path.join(ADMIN, "fatos-237-previa.png")));
    await desktop.close();
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mPage = await mobile.newPage();
    if (latest?.previewPath) {
      all.push(...(await captureRenderer(mPage, MOBILE, "new-237", latest.previewPath)));
    }
    await mobile.close();
  } finally {
    await browser.close();
  }
  writeFileSync(path.join(ROOT, "reports/screenshots.json"), `${JSON.stringify({ shots: all }, null, 2)}\n`);
  console.log(`54X visual ${all.filter((item) => item.ok).length}/${all.length} shots`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
