import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { captureVisitorVisuals } from "../src/lib/presell-quality/visitor-capture.ts";

const OUT = path.join(process.cwd(), "data", "evidence", "execution-54bx-visual-refine-after");
const URL =
  "http://127.0.0.1:3000/admin/lab/lp-generator/lp-mvs7mja3-0d690e7c/preview?visualCapture=visitor&candidate=54BX";

async function main() {
  mkdirSync(OUT, { recursive: true });
  const manifest = await captureVisitorVisuals({
    campaignId: 237,
    generationId: "lp-mvs7mja3-0d690e7c",
    outDir: OUT,
    candidate: "54BX",
    naming: "visitor",
    manifestName: "visitor-capture-after.json",
  });

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ channel: "chrome", headless: true }).catch(() => chromium.launch({ headless: true }));
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();
  const failed: Array<{ status: number; url: string }> = [];
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push({ status: r.status(), url: r.url() });
  });
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.locator("[data-v4='page']").waitFor({ timeout: 90_000 });
  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll("[data-seller-package] img")] as HTMLImageElement[];
    return imgs.length === 3 && imgs.every((img) => img.complete && img.naturalWidth > 0);
  }, { timeout: 20_000 }).catch(() => undefined);

  const cards = await page.evaluate(() =>
    [...document.querySelectorAll("[data-seller-package]")].map((el) => {
      const img = el.querySelector("img") as HTMLImageElement | null;
      return {
        bottles: el.getAttribute("data-bottle-count"),
        assetId: img?.getAttribute("data-packshot-asset") ?? null,
        role: img?.getAttribute("data-image-role") ?? null,
        represents: img?.getAttribute("data-image-represents-quantity") ?? null,
        src: img?.getAttribute("src") ?? null,
        naturalWidth: img?.naturalWidth ?? 0,
        naturalHeight: img?.naturalHeight ?? 0,
      };
    }),
  );
  await page.locator("#seller-stated-packages").screenshot({ path: path.join(OUT, "desktop-packages-after.png") });
  await page.locator(".ds-footer").screenshot({ path: path.join(OUT, "desktop-footer-after.png") });

  for (const viewport of [
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const p = await ctx.newPage();
    await p.goto(URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await p.locator("[data-v4='page']").waitFor({ timeout: 90_000 });
    await p.locator("#seller-stated-packages").scrollIntoViewIfNeeded();
    await p.waitForTimeout(300);
    await p.locator("#seller-stated-packages").screenshot({ path: path.join(OUT, `${viewport.name}-packages-after.png`) });
    await ctx.close();
  }

  const report = {
    cards,
    failedResponses: failed,
    overflowX: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1),
    visitorInspect: manifest.inspect,
    mappingOk:
      cards.find((c) => c.bottles === "2")?.assetId === "asset-1301445c" &&
      cards.find((c) => c.bottles === "3")?.assetId === "asset-1d63be79" &&
      cards.find((c) => c.bottles === "6")?.assetId === "asset-ad4ed3f0" &&
      cards.every((c) => c.role === "package_quantity" && c.represents === "1" && c.naturalWidth > 0),
  };
  writeFileSync(path.join(OUT, "validation-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  if (!report.mappingOk) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
