import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base = (process.env.VISUAL_QA_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const url = `${base}/admin/preview/joint-genesis-controlled-ready-13`;
const out = path.join(
  process.cwd(),
  "data",
  "visual-design",
  "joint-genesis-controlled-ready-13",
  "visual-master",
  "implementation",
);
const viewports = [
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1440", width: 1440, height: 900 },
];

async function main() {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(url, { waitUntil: "load", timeout: 90_000 });
    await page.locator("[data-visual-system='visual-master-v1'] h1").waitFor({ timeout: 30_000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const target = page.locator("[data-visual-system='visual-master-v1']");
    await target.screenshot({
      path: path.join(out, `${viewport.name}.png`),
      animations: "disabled",
      caret: "hide",
    });
    console.log(`SAVED=${viewport.name}`);
  }
  await browser.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "capture failed");
  process.exit(1);
});
