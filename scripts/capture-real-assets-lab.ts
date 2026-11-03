import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const OUT = path.join(process.cwd(), "data", "evidence", "execution-52-real-product-assets", "screenshots");
const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: "chrome" }).catch(() => chromium.launch({ headless: true }));
  const shots: string[] = [];
  for (const [id, url] of [
    ["discover", `${BASE}/admin/lab/real-assets`],
    ["approve", `${BASE}/admin/lab/real-assets/femicore`],
    ["v4-preview", `${BASE}/admin/lab/renderer-v4/real/femicore`],
  ] as const) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
    const dest = path.join(OUT, `${id}-1440.jpg`);
    await page.screenshot({ path: dest, type: "jpeg", quality: 55, fullPage: true });
    shots.push(`${id} status=${res?.status()} ${dest}`);
    await page.close();
  }
  await browser.close();
  writeFileSync(path.join(OUT, "..", "screenshots.json"), JSON.stringify({ source: "live-lab-route", shots }, null, 2));
  console.log(`CAPTURE_52 shots=${shots.length}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
