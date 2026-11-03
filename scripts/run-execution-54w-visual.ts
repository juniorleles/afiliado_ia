// npx tsx scripts/run-execution-54w-visual.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { loadApprovedReviewGeneration } from "../src/lib/lp-generator/from-approved-review.ts";

const ROOT = path.join("data/evidence/execution-54w-real-presell-generation");
const DESKTOP = path.join(ROOT, "screenshots/desktop");
const MOBILE = path.join(ROOT, "screenshots/mobile");
const ADMIN = path.join(ROOT, "screenshots/admin");
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

async function openPreviewTab(page: Page) {
  await page.goto(`${BASE}/admin/237/fatos`, { waitUntil: "domcontentloaded" });
  await page.getByText(/Pesquisa/).first().waitFor({ timeout: 25_000 });
  await page.getByRole("tab", { name: "Prévia" }).click();
  await page.waitForTimeout(500);
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
  const legal = page.locator("[data-v4-section='legal']").first();
  if (await legal.count()) shots.push(await shot(legal, path.join(dir, `${prefix}-legal.png`), false));
  return shots;
}

async function main() {
  mkdirSync(DESKTOP, { recursive: true });
  mkdirSync(MOBILE, { recursive: true });
  mkdirSync(ADMIN, { recursive: true });
  const generation = loadApprovedReviewGeneration(237);
  const isolatedPath = path.join("data/evidence/execution-54w-real-presell-generation/reports/isolated-review.json");
  const isolated = existsSync(isolatedPath)
    ? (JSON.parse(readFileSync(isolatedPath, "utf8")) as { insufficientId?: number; noPackId?: number })
    : {};
  const all: Shot[] = [];
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const dPage = await desktop.newPage();
    await openPreviewTab(dPage);
    all.push(await shot(dPage, path.join(ADMIN, "previa-237-before-or-result.png")));
    const generate = dPage.getByRole("button", { name: /Gerar Pre-sell SANDBOX/ });
    if (await generate.count()) {
      await generate.click();
      await dPage.waitForTimeout(400);
      all.push(await shot(dPage, path.join(ADMIN, "previa-237-generating.png"), false));
      await dPage.getByText(/Gerado|Dados insuficientes|Falha|Bloqueado/).first().waitFor({ timeout: 60_000 }).catch(() => undefined);
      all.push(await shot(dPage, path.join(ADMIN, "previa-237-result.png")));
    }
    const latest = loadApprovedReviewGeneration(237) ?? generation;
    if (latest?.previewPath) {
      all.push(...(await captureRenderer(dPage, DESKTOP, "renderer-v4-237", latest.previewPath)));
    }
    if (isolated.insufficientId) {
      await dPage.goto(`${BASE}/admin/${isolated.insufficientId}/fatos`, { waitUntil: "domcontentloaded" });
      await dPage.getByRole("tab", { name: "Prévia" }).click();
      await dPage.waitForTimeout(400);
      all.push(await shot(dPage, path.join(ADMIN, "previa-insufficient.png")));
    }
    if (isolated.noPackId) {
      await dPage.goto(`${BASE}/admin/${isolated.noPackId}/fatos`, { waitUntil: "domcontentloaded" });
      await dPage.getByRole("tab", { name: "Prévia" }).click();
      await dPage.waitForTimeout(400);
      all.push(await shot(dPage, path.join(ADMIN, "previa-no-packshot.png")));
    }
    await desktop.close();
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mPage = await mobile.newPage();
    await openPreviewTab(mPage);
    all.push(await shot(mPage, path.join(ADMIN, "previa-237-mobile.png")));
    const latestMobile = loadApprovedReviewGeneration(237) ?? generation;
    if (latestMobile?.previewPath) {
      all.push(...(await captureRenderer(mPage, MOBILE, "renderer-v4-237", latestMobile.previewPath)));
    }
    await mobile.close();
  } finally {
    await browser.close();
  }
  writeFileSync(path.join(ROOT, "reports/screenshots.json"), `${JSON.stringify({ shots: all }, null, 2)}\n`);
  const ok = all.filter((item) => item.ok).length;
  console.log(`54W visual ${ok}/${all.length} shots`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
