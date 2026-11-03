import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const ID = "lp-mvjy5hgq-be23fe5a";
const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const OUT = path.join(process.cwd(), "data", "evidence", "execution-54a-presell-strategy", "screenshots", "before");

async function main() {
  mkdirSync(OUT, { recursive: true });
  const url = `${BASE}/admin/lab/lp-generator/${ID}/preview`;
  const browser = await chromium.launch({ headless: true, channel: "chrome" }).catch(() => chromium.launch({ headless: true }));
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector('[data-v4="page"]', { timeout: 60000 });
  await page.waitForFunction(
    () => {
      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>("[data-v4-image=commercial]"));
      return imgs.length === 0 || imgs.every((img) => img.complete && img.naturalWidth > 0);
    },
    { timeout: 60000 },
  );
  await page.waitForTimeout(600);
  const desktop = await page.evaluate(() => ({
    statusHint: document.querySelector("h1")?.textContent?.trim() ?? "",
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    images: Array.from(document.querySelectorAll<HTMLImageElement>("[data-v4-image=commercial]")).filter((img) => img.complete && img.naturalWidth > 0).length,
    sections: Array.from(document.querySelectorAll("[data-v4-section]")).map((el) => el.getAttribute("data-v4-section")),
  }));
  await page.screenshot({ path: path.join(OUT, "femicore-desktop-1440.jpg"), type: "jpeg", quality: 55, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const mobile = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  }));
  await page.screenshot({ path: path.join(OUT, "femicore-mobile-390.jpg"), type: "jpeg", quality: 55, fullPage: true });
  await browser.close();
  console.log(JSON.stringify({ url, http: response?.status() ?? null, desktop, mobile, out: OUT }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
