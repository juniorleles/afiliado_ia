import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const OUT = path.join(process.cwd(), "data", "evidence", "execution-52a-image-gallery-fix");
const SHOTS = path.join(OUT, "screenshots");
const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const PAGE = `${BASE}/admin/lab/real-assets/femicore`;

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: "chrome" }).catch(() => chromium.launch({ headless: true }));
  const failures: string[] = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.on("response", (response) => {
    if (response.url().includes("/admin/lab/real-assets/thumb/") && !response.ok()) {
      failures.push(`${response.status()} ${response.url()}`);
    }
  });
  const res = await page.goto(PAGE, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("[data-kind=packshot] img", { timeout: 60000 });
  await page.waitForFunction(
    () => {
      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>("[data-kind=packshot] img"));
      return imgs.length > 0 && imgs.every((img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0);
    },
    { timeout: 90000 },
  );
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(2000);

  const metrics = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>("[data-gallery='real-assets'] img[data-thumb]"));
      const packshots = Array.from(document.querySelectorAll<HTMLImageElement>("[data-kind=packshot] img[data-thumb]"));
    return {
      discoveredCards: document.querySelectorAll("[data-image-id]").length,
      loaded: imgs.filter((img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0).length,
      failed: document.querySelectorAll("[data-thumb-error]").length,
      packshots: packshots.map((img) => ({
        id: img.getAttribute("data-thumb"),
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        complete: img.complete,
        src: img.currentSrc,
      })),
      toolbar: Boolean(document.querySelector("[data-approve-selected]")),
      approvePresent: Boolean(document.querySelector("[data-approve-selected]")),
    };
  });

  const firstPack = page.locator("[data-kind=packshot] [data-select-image]").first();
  const secondPack = page.locator("[data-kind=packshot] [data-select-image]").nth(1);
  await firstPack.check();
  await secondPack.check();
  const selectedState = await page.evaluate(() => ({
    checked: document.querySelectorAll<HTMLInputElement>("[data-select-image]:checked").length,
    approvePresent: Boolean(document.querySelector("[data-approve-selected]")),
  }));
  const previewButton = page.locator("[data-kind=packshot] [data-preview-open]").first();
  await previewButton.scrollIntoViewIfNeeded();
  await previewButton.click();
  await page.waitForSelector("details[open] [data-lightbox-open] img", { timeout: 20000 });
  const lightboxOk = await page.evaluate(() => {
    const img = document.querySelector<HTMLImageElement>("details[open] [data-lightbox-open] img");
    return Boolean(img && img.complete && img.naturalWidth > 0);
  });
  await page.evaluate(() => {
    document.querySelectorAll("details[open]").forEach((node) => node.removeAttribute("open"));
  });

  const packshotsShot = path.join(SHOTS, "packshots-desktop-1440.jpg");
  await page.locator("[data-gallery-section=packshot]").first().screenshot({ path: packshotsShot, type: "jpeg", quality: 72 });
  const desktop = path.join(SHOTS, "gallery-desktop-1440.jpg");
  await page.screenshot({ path: desktop, type: "jpeg", quality: 55, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const mobile = path.join(SHOTS, "gallery-mobile-390.jpg");
  await page.screenshot({ path: mobile, type: "jpeg", quality: 55, fullPage: true });

  const approvedDuringTest = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-status=USER_APPROVED]")).map((node) => node.getAttribute("data-image-id")),
  );

  await browser.close();

  const report = {
    pageStatus: res?.status() ?? null,
    mocks: false,
    approvedDuringTest,
    thumbFailures: failures,
    ...metrics,
    selectedState,
    lightboxOk,
    screenshots: [packshotsShot, desktop, mobile],
    packshotsLoaded: metrics.packshots.filter((item) => item.naturalWidth > 0 && item.naturalHeight > 0).length,
    galleryFunctional:
      metrics.packshots.length > 0 &&
      metrics.packshots.every((item) => item.naturalWidth > 0 && item.naturalHeight > 0) &&
      selectedState.checked === 2 &&
      selectedState.approvePresent &&
      approvedDuringTest.length === 0 &&
      lightboxOk,
  };
  writeFileSync(path.join(OUT, "browser-gallery.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.galleryFunctional) {
    throw new Error("Gallery browser test did not meet the packshot load/selection criteria.");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
