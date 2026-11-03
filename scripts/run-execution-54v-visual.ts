// npx tsx scripts/run-execution-54v-visual.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

const ROOT = path.join("data/evidence/execution-54v-product-review-ux");
const DESKTOP = path.join(ROOT, "screenshots/desktop");
const MOBILE = path.join(ROOT, "screenshots/mobile");
const REVIEW = path.join(ROOT, "screenshots/review-tests");
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

async function clickTab(page: Page, name: string) {
  await page.getByRole("tab", { name }).click();
  await page.waitForTimeout(400);
}

async function capture(page: Page, dir: string, prefix: string, url: string): Promise<Shot[]> {
  mkdirSync(dir, { recursive: true });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.getByText(/Pesquisa/).first().waitFor({ timeout: 25_000 });
  const shots: Shot[] = [];
  shots.push(await shot(page, path.join(dir, `${prefix}-overview.png`)));
  shots.push(await shot(page, path.join(dir, `${prefix}-fontes.png`)));
  await clickTab(page, "Informações do produto");
  shots.push(await shot(page, path.join(dir, `${prefix}-informacoes.png`)));
  const details = page.getByRole("button", { name: "Detalhes da evidência" }).first();
  if (await details.count()) {
    await details.click();
    shots.push(await shot(page, path.join(dir, `${prefix}-evidencia.png`)));
  }
  await clickTab(page, "Imagens");
  shots.push(await shot(page, path.join(dir, `${prefix}-imagens.png`)));
  const previewBtn = page.getByRole("button", { name: "Visualizar" }).first();
  if (await previewBtn.count()) {
    await previewBtn.click();
    await page.waitForTimeout(300);
    shots.push(await shot(page, path.join(dir, `${prefix}-imagem-ampliada.png`), false));
    await page.getByRole("button", { name: "Fechar" }).click().catch(() => undefined);
  }
  await clickTab(page, "Prévia");
  shots.push(await shot(page, path.join(dir, `${prefix}-previa.png`)));
  return shots;
}

async function main() {
  mkdirSync(DESKTOP, { recursive: true });
  mkdirSync(MOBILE, { recursive: true });
  mkdirSync(REVIEW, { recursive: true });
  const isolatedPath = path.join("data/evidence/execution-54u-review-e2e/reports/isolated-review.json");
  const isolatedId = existsSync(isolatedPath)
    ? (JSON.parse(readFileSync(isolatedPath, "utf8")) as { isolatedCampaignId?: number }).isolatedCampaignId
    : undefined;
  const all: Shot[] = [];
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const dPage = await desktop.newPage();
    all.push(...(await capture(dPage, DESKTOP, "fatos-237", `${BASE}/admin/237/fatos`)));
    all.push(...(await capture(dPage, DESKTOP, "generate-237", `${BASE}/admin/generate?campaignId=237`)));
    if (isolatedId) {
      await dPage.goto(`${BASE}/admin/${isolatedId}/fatos`, { waitUntil: "domcontentloaded" });
      await dPage.getByText(/Pesquisa/).first().waitFor({ timeout: 25_000 });
      all.push(await shot(dPage, path.join(REVIEW, "isolated-overview.png")));
      await clickTab(dPage, "Informações do produto");
      all.push(await shot(dPage, path.join(REVIEW, "isolated-informacoes.png")));
    }
    await desktop.close();
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mPage = await mobile.newPage();
    all.push(...(await capture(mPage, MOBILE, "fatos-237", `${BASE}/admin/237/fatos`)));
    await mobile.close();
  } finally {
    await browser.close();
  }
  writeFileSync(path.join(ROOT, "reports/screenshots.json"), `${JSON.stringify(all, null, 2)}\n`);
  const failed = all.filter((item) => !item.ok);
  console.log(`54V visual shots=${all.length} failed=${failed.length}`);
  if (failed.length) console.log(failed.map((item) => `${item.id}: ${item.note}`).join("\n"));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
