// npx tsx scripts/run-execution-54y-visual.ts
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { loadApprovedReviewGeneration } from "../src/lib/lp-generator/from-approved-review.ts";

const ROOT = path.join("data/evidence/execution-54y-structured-content-recovery");
const DESKTOP = path.join(ROOT, "screenshots/desktop");
const MOBILE = path.join(ROOT, "screenshots/mobile");
const ADMIN = path.join(ROOT, "screenshots/admin");
const BASE = "http://127.0.0.1:3000";
const OLD = "/admin/lab/lp-generator/lp-mvpo64ra-fbdcbcbc/preview";

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
  for (const [key, sel] of [
    ["hero", "#hero, [data-v4-section='hero']"],
    ["gallery", "[data-v4-section='gallery']"],
    ["ingredients", "section:has-text('Ingredients'), [data-v4-section='specifications']"],
    ["guarantee", "[data-v4-section='guarantee'], section:has-text('Guarantee')"],
    ["legal", "[data-v4-section='legal']"],
  ] as const) {
    const loc = page.locator(sel).first();
    if (await loc.count()) shots.push(await shot(loc, path.join(dir, `${prefix}-${key}.png`), false));
  }
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
    if (existsSync(path.join("data/lp-generations/lp-mvpo64ra-fbdcbcbc/model.json"))) {
      all.push(...(await captureRenderer(dPage, DESKTOP, "old-54x", OLD)));
    }
    if (latest?.previewPath) {
      all.push(...(await captureRenderer(dPage, DESKTOP, "new-54y", latest.previewPath)));
    }
    await dPage.goto(`${BASE}/admin/237/fatos`, { waitUntil: "domcontentloaded" });
    await dPage.getByText(/Pesquisa|Informações|Fontes/).first().waitFor({ timeout: 25_000 });
    all.push(await shot(dPage, path.join(ADMIN, "fatos-overview.png")));
    await dPage.getByRole("tab", { name: "Informações do produto" }).click();
    await dPage.waitForTimeout(500);
    all.push(await shot(dPage, path.join(ADMIN, "informacoes.png")));
    const usage = dPage.locator("[data-field='howItWorks']");
    if (await usage.count()) {
      all.push(await shot(usage, path.join(ADMIN, "proposta-modo-de-uso.png"), false));
      const details = usage.getByText("Detalhes da evidência");
      if (await details.count()) {
        await details.click();
        await dPage.waitForTimeout(300);
        all.push(await shot(usage, path.join(ADMIN, "evidencia-modo-de-uso.png"), false));
      }
    }
    const description = dPage.locator("[data-field='description']");
    if (await description.count()) all.push(await shot(description, path.join(ADMIN, "proposta-descricao.png"), false));
    const faq = dPage.locator("[data-field='faq']");
    if (await faq.count()) all.push(await shot(faq, path.join(ADMIN, "faq.png"), false));
    await dPage.getByRole("tab", { name: "Imagens" }).click();
    await dPage.waitForTimeout(500);
    all.push(await shot(dPage, path.join(ADMIN, "galeria.png")));
    const pack = dPage.locator("[data-kind-proposal='PRODUCT_PACKSHOT']").first();
    if (await pack.count()) all.push(await shot(pack, path.join(ADMIN, "proposta-packshot.png"), false));
    await dPage.getByRole("tab", { name: "Prévia" }).click();
    await dPage.waitForTimeout(400);
    all.push(await shot(dPage, path.join(ADMIN, "previa.png")));
    await desktop.close();
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mPage = await mobile.newPage();
    if (latest?.previewPath) all.push(...(await captureRenderer(mPage, MOBILE, "new-54y", latest.previewPath)));
    await mobile.close();
  } finally {
    await browser.close();
  }
  writeFileSync(path.join(ROOT, "reports/screenshots.json"), `${JSON.stringify({ shots: all, previewPath: latest?.previewPath ?? null }, null, 2)}\n`);
  console.log(`54Y visual ${all.filter((item) => item.ok).length}/${all.length} shots preview=${latest?.previewPath ?? "none"}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
