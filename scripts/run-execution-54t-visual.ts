// npx tsx scripts/run-execution-54t-visual.ts
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const DIR = path.join("data/evidence/execution-54t-research-evidence-ui-sync/screenshots");
const CAMPAIGN_ID = 237;

async function main() {
  mkdirSync(DIR, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const viewport of [
      { name: "desktop-1440", width: 1440, height: 1100 },
      { name: "mobile-390", width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:3000/admin/${CAMPAIGN_ID}/fatos`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#completude-produto, #cobertura-revisao", { timeout: 20_000 });
      await page.screenshot({ path: path.join(DIR, `fatos-${viewport.name}.png`), fullPage: true });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`54T visual screenshots wrote ${DIR}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
