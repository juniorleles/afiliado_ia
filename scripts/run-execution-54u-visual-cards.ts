// npx tsx scripts/run-execution-54u-visual-cards.ts
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

const ROOT = path.join("data/evidence/execution-54u-review-e2e");
const BASE = "http://127.0.0.1:3000";

type Shot = { id: string; path: string; ok: boolean; note?: string };

async function section(page: Page, headingId: string, file: string): Promise<Shot> {
  const loc = page.locator(`section:has(#${headingId})`).first();
  try {
    await loc.waitFor({ timeout: 20_000 });
    await loc.screenshot({ path: file });
    return { id: path.basename(file), path: file.replace(/\\/g, "/"), ok: existsSync(file) };
  } catch (err) {
    return { id: path.basename(file), path: file.replace(/\\/g, "/"), ok: false, note: err instanceof Error ? err.message : String(err) };
  }
}

async function card(page: Page, title: string, file: string): Promise<Shot> {
  const loc = page.locator("article").filter({ has: page.getByRole("heading", { name: title }) }).first();
  try {
    await loc.waitFor({ timeout: 20_000 });
    await loc.screenshot({ path: file });
    return { id: path.basename(file), path: file.replace(/\\/g, "/"), ok: existsSync(file) };
  } catch (err) {
    return { id: path.basename(file), path: file.replace(/\\/g, "/"), ok: false, note: err instanceof Error ? err.message : String(err) };
  }
}

async function capturePage(page: Page, dir: string, prefix: string, url: string): Promise<Shot[]> {
  mkdirSync(dir, { recursive: true });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.getByText(/Research [Cc]overage/).first().waitFor({ timeout: 25_000 });
  const shots: Shot[] = [];
  shots.push(await section(page, "pesquisa-automatica", path.join(dir, `${prefix}-pesquisa.png`)));
  shots.push(await section(page, "fontes-classificadas", path.join(dir, `${prefix}-fontes.png`)));
  shots.push(await section(page, "regras-afiliado", path.join(dir, `${prefix}-regras.png`)));
  shots.push(await section(page, "assets-descobertos", path.join(dir, `${prefix}-assets.png`)));
  shots.push(await section(page, "cobertura-revisao", path.join(dir, `${prefix}-cobertura.png`)));
  shots.push(await section(page, "completude-produto", path.join(dir, `${prefix}-completude.png`)));
  shots.push(await card(page, "Ingredientes", path.join(dir, `${prefix}-ingredientes.png`)));
  shots.push(await card(page, "Garantia", path.join(dir, `${prefix}-garantia.png`)));
  shots.push(await section(page, "informacoes-encontradas", path.join(dir, `${prefix}-encontradas.png`)));
  shots.push(await section(page, "informacoes-pendentes", path.join(dir, `${prefix}-pendentes.png`)));
  shots.push(await section(page, "fontes-pesquisa-produto", path.join(dir, `${prefix}-fontes-form.png`)));
  return shots;
}

async function main() {
  const shots: Shot[] = [];
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const viewport of [
      { name: "desktop", width: 1440, height: 900 },
      { name: "mobile", width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      const dir = path.join(ROOT, "screenshots", viewport.name);
      shots.push(...(await capturePage(page, dir, "fatos-237", `${BASE}/admin/237/fatos`)));
      shots.push(...(await capturePage(page, dir, "generate-237", `${BASE}/admin/generate?campaignId=237`)));
      const affiliate = page.locator("label:has-text('Affiliate URL')");
      if (await affiliate.count()) {
        const file = path.join(dir, "generate-237-affiliate-url.png");
        await affiliate.screenshot({ path: file });
        shots.push({ id: "generate-237-affiliate-url.png", path: file.replace(/\\/g, "/"), ok: existsSync(file) });
      }
      await context.close();
    }
    const review = path.join(ROOT, "screenshots/review-tests");
    mkdirSync(review, { recursive: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${BASE}/admin/260/fatos`, { waitUntil: "domcontentloaded" });
    await page.getByText(/Research [Cc]overage/).first().waitFor({ timeout: 25_000 });
    shots.push(await section(page, "informacoes-encontradas", path.join(review, "isolated-accept-reject-cards.png")));
    shots.push(await card(page, "Descrição", path.join(review, "isolated-accepted-description.png")));
    shots.push(await card(page, "Ingredientes", path.join(review, "isolated-rejected-ingredients.png")));
    await context.close();
  } finally {
    await browser.close();
  }
  writeFileSync(path.join(ROOT, "reports/screenshots-focused.json"), `${JSON.stringify(shots, null, 2)}\n`);
  const failed = shots.filter((item) => !item.ok);
  console.log(`54U focused shots=${shots.length} failed=${failed.length}`);
  if (failed.length) console.log(failed.map((item) => `${item.id}: ${item.note}`).join("\n"));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
