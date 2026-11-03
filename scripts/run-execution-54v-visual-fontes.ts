import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const DIR = path.join("data/evidence/execution-54v-product-review-ux/screenshots/desktop");
mkdirSync(DIR, { recursive: true });

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3000/admin/237/fatos", { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "Fontes" }).waitFor({ timeout: 25_000 });
  await page.screenshot({ path: path.join(DIR, "fatos-237-fontes.png"), fullPage: true });
  await page.screenshot({ path: path.join(DIR, "fatos-237-overview.png"), fullPage: true });
  await browser.close();
  console.log("54V fontes recapture wrote");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
