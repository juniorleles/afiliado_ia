// npx tsx scripts/run-execution-54u-visual.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

const ROOT = path.join("data/evidence/execution-54u-review-e2e");
const DESKTOP = path.join(ROOT, "screenshots/desktop");
const MOBILE = path.join(ROOT, "screenshots/mobile");
const REVIEW = path.join(ROOT, "screenshots/review-tests");
const CAMPAIGN_ID = 237;
const BASE = "http://127.0.0.1:3000";

type Shot = { id: string; path: string; ok: boolean; note?: string };

function ensureDirs() {
  for (const dir of [DESKTOP, MOBILE, REVIEW, path.join(ROOT, "reports"), path.join(ROOT, "logs")]) {
    mkdirSync(dir, { recursive: true });
  }
}

async function waitReady(page: Page) {
  await page.getByText(/Research [Cc]overage/).first().waitFor({ timeout: 25_000 });
}

async function shot(page: Page, file: string, fullPage = true): Promise<Shot> {
  try {
    await page.screenshot({ path: file, fullPage });
    return { id: path.basename(file), path: file.replace(/\\/g, "/"), ok: existsSync(file) };
  } catch (err) {
    return { id: path.basename(file), path: file.replace(/\\/g, "/"), ok: false, note: err instanceof Error ? err.message : String(err) };
  }
}

async function sectionShot(page: Page, selector: string, file: string): Promise<Shot> {
  try {
    const loc = page.locator(selector).first();
    if ((await loc.count()) === 0) {
      return { id: path.basename(file), path: file.replace(/\\/g, "/"), ok: false, note: `missing ${selector}` };
    }
    await loc.screenshot({ path: file });
    return { id: path.basename(file), path: file.replace(/\\/g, "/"), ok: existsSync(file) };
  } catch (err) {
    return { id: path.basename(file), path: file.replace(/\\/g, "/"), ok: false, note: err instanceof Error ? err.message : String(err) };
  }
}

async function captureCampaign(page: Page, dir: string, prefix: string, url: string): Promise<Shot[]> {
  const shots: Shot[] = [];
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitReady(page);
  shots.push(await shot(page, path.join(dir, `${prefix}-overview.png`)));
  shots.push(await sectionShot(page, "#pesquisa-automatica, [aria-label='Research indicators']", path.join(dir, `${prefix}-pesquisa.png`)));
  shots.push(await sectionShot(page, "#fontes-classificadas", path.join(dir, `${prefix}-fontes.png`)));
  shots.push(await sectionShot(page, "#regras-afiliado", path.join(dir, `${prefix}-regras.png`)));
  shots.push(await sectionShot(page, "#assets-descobertos", path.join(dir, `${prefix}-assets.png`)));
  shots.push(await sectionShot(page, "#cobertura-revisao, #completude-produto", path.join(dir, `${prefix}-cobertura.png`)));
  const cards = page.locator("#informacoes-encontradas article");
  const count = await cards.count();
  if (count > 0) shots.push({ ...(await cards.nth(0).screenshot({ path: path.join(dir, `${prefix}-ingredientes.png`) }).then(() => ({ id: `${prefix}-ingredientes.png`, path: path.join(dir, `${prefix}-ingredientes.png`).replace(/\\/g, "/"), ok: true })).catch((err) => ({ id: `${prefix}-ingredientes.png`, path: path.join(dir, `${prefix}-ingredientes.png`).replace(/\\/g, "/"), ok: false, note: String(err) }))) });
  if (count > 1) shots.push({ ...(await cards.nth(1).screenshot({ path: path.join(dir, `${prefix}-garantia.png`) }).then(() => ({ id: `${prefix}-garantia.png`, path: path.join(dir, `${prefix}-garantia.png`).replace(/\\/g, "/"), ok: true })).catch((err) => ({ id: `${prefix}-garantia.png`, path: path.join(dir, `${prefix}-garantia.png`).replace(/\\/g, "/"), ok: false, note: String(err) }))) });
  shots.push(await sectionShot(page, "#informacoes-pendentes", path.join(dir, `${prefix}-pendentes.png`)));
  return shots;
}

async function main() {
  ensureDirs();
  const isolatedPath = path.join(ROOT, "reports/isolated-review.json");
  const isolated = existsSync(isolatedPath)
    ? (JSON.parse(readFileSync(isolatedPath, "utf8")) as { isolatedCampaignId?: number })
    : {};
  const isolatedId = isolated.isolatedCampaignId;
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const all: Shot[] = [];
  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const dPage = await desktop.newPage();
    all.push(...(await captureCampaign(dPage, DESKTOP, "generate-237", `${BASE}/admin/generate?campaignId=${CAMPAIGN_ID}`)));
    const affiliateInput = dPage.locator("input[placeholder='https://example.com/your-hop']");
    const affiliateValue = await affiliateInput.inputValue().catch(() => null);
    const affiliatePlaceholder = await affiliateInput.getAttribute("placeholder").catch(() => null);
    writeFileSync(
      path.join(ROOT, "reports/affiliate-url-display.json"),
      `${JSON.stringify({ value: affiliateValue, placeholder: affiliatePlaceholder, page: `/admin/generate?campaignId=${CAMPAIGN_ID}` }, null, 2)}\n`,
    );
    all.push(await sectionShot(dPage, "label:has-text('Affiliate URL')", path.join(DESKTOP, "generate-237-affiliate-url.png")));
    all.push(...(await captureCampaign(dPage, DESKTOP, "fatos-237", `${BASE}/admin/${CAMPAIGN_ID}/fatos`)));
    all.push(await sectionShot(dPage, "#fontes-pesquisa-produto, label[for='trackingHopUrl']", path.join(DESKTOP, "fatos-237-hoplink.png")));
    if (isolatedId) {
      await dPage.goto(`${BASE}/admin/${isolatedId}/fatos`, { waitUntil: "domcontentloaded" });
      await waitReady(dPage);
      all.push(await shot(dPage, path.join(REVIEW, "isolated-after-decisions.png")));
      all.push(await sectionShot(dPage, "#informacoes-encontradas", path.join(REVIEW, "isolated-accept-reject-cards.png")));
      await dPage.reload({ waitUntil: "domcontentloaded" });
      await waitReady(dPage);
      all.push(await shot(dPage, path.join(REVIEW, "isolated-after-refresh.png")));
      all.push(...(await captureCampaign(dPage, REVIEW, "isolated-v2", `${BASE}/admin/generate?campaignId=${isolatedId}`)));
    }
    await desktop.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mPage = await mobile.newPage();
    all.push(...(await captureCampaign(mPage, MOBILE, "generate-237", `${BASE}/admin/generate?campaignId=${CAMPAIGN_ID}`)));
    all.push(...(await captureCampaign(mPage, MOBILE, "fatos-237", `${BASE}/admin/${CAMPAIGN_ID}/fatos`)));
    if (isolatedId) {
      await mPage.goto(`${BASE}/admin/${isolatedId}/fatos`, { waitUntil: "domcontentloaded" });
      await waitReady(mPage);
      all.push(await shot(mPage, path.join(REVIEW, "isolated-mobile.png")));
    }
    await mobile.close();
  } finally {
    await browser.close();
  }
  writeFileSync(path.join(ROOT, "reports/screenshots.json"), `${JSON.stringify(all, null, 2)}\n`);
  const failed = all.filter((item) => !item.ok);
  console.log(`54U visual shots=${all.length} failed=${failed.length} dir=${ROOT}`);
  if (failed.length) {
    console.log(failed.map((item) => `${item.id}: ${item.note}`).join("\n"));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
