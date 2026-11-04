import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  offerImageLocalPreviewEligible,
  readOfferImageInventory,
  selectLocalPreviewOfferImage,
} from "../src/lib/presell-quality/offer-images.ts";

const OUT = path.join(process.cwd(), "data", "evidence", "execution-54bx-visual-refine-baseline");
const URL =
  "http://127.0.0.1:3000/admin/lab/lp-generator/lp-mvs7mja3-0d690e7c/preview?visualCapture=visitor&candidate=54BX";

async function main() {
  mkdirSync(OUT, { recursive: true });
  const inv = readOfferImageInventory(237);
  const inventory = ["asset-1301445c", "asset-1d63be79", "asset-ad4ed3f0"].map((id) => {
    const asset = inv?.assets.find((item) => item.assetId === id);
    return {
      assetId: id,
      bottleCount: asset?.bottleCount ?? null,
      usageAuthorization: asset?.usageAuthorization ?? null,
      reviewStatus: asset?.reviewStatus ?? null,
      operatorAttestation: asset?.operatorAttestation ?? null,
      localPreviewEligible: asset ? offerImageLocalPreviewEligible(asset) : false,
      selectedForCount: asset?.bottleCount != null ? selectLocalPreviewOfferImage({ inventory: inv, bottleCount: asset.bottleCount })?.assetId ?? null : null,
    };
  });

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ channel: "chrome", headless: true }).catch(() => chromium.launch({ headless: true }));
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.locator("[data-v4='page']").waitFor({ timeout: 90_000 });
  const rendered = await page.evaluate(() => ({
    mode: document.querySelector("[data-v4='page']")?.getAttribute("data-offer-image-mode"),
    cards: [...document.querySelectorAll("[data-seller-package]")].map((el) => {
      const img = el.querySelector("img");
      return {
        packageId: el.getAttribute("data-seller-package"),
        bottles: el.getAttribute("data-bottle-count"),
        assetId: img?.getAttribute("data-asset-id") ?? null,
        imageRole: img?.getAttribute("data-image-role") ?? null,
        src: img?.getAttribute("src") ?? null,
        naturalWidth: img?.naturalWidth ?? 0,
      };
    }),
  }));
  await page.locator("#seller-stated-packages").scrollIntoViewIfNeeded();
  await page.locator("#seller-stated-packages").screenshot({ path: path.join(OUT, "desktop-packages-before.png") });
  await page.locator(".ds-footer").screenshot({ path: path.join(OUT, "desktop-footer-before.png") });
  await browser.close();

  const report = { inventory, rendered };
  writeFileSync(path.join(OUT, "package-image-probe-before.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
