/**
 * Responsive capture and geometry QA of an assembled draft LP.
 * Reads the admin preview route, which never serves public traffic.
 *
 * npx tsx scripts/visual-qa/capture-replay-lp-v1.ts --dir=<replay dir> --slug=<slug> [--pass=<subdir>]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

const replayDir = process.argv.find((item) => item.startsWith("--dir="))?.slice(6);
const slug = process.argv.find((item) => item.startsWith("--slug="))?.slice(7);
if (!replayDir || !slug) throw new Error("--dir and --slug are required");
const base = (process.env.VISUAL_QA_BASE_URL ?? "http://localhost:3015").replace(/\/$/, "");
const url = `${base}/admin/preview/${slug}`;
const pass = process.argv.find((item) => item.startsWith("--pass="))?.slice(7) ?? "visual-construction-v1";
const out = path.join(replayDir, pass, "responsive");
const viewports = [
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1440", width: 1440, height: 900 },
];

const inspectInPage = new Function(`
  const box = (node) => {
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
  };
  const intersects = (a, b) => {
    if (!a || !b) return false;
    return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
  };
  const root = document.querySelector("[data-visual-system='visual-master-v1']");
  const hero = document.querySelector(".vm-hero");
  const product = document.querySelector("[data-product-role='HERO_PRODUCT_PRIMARY']");
  const closing = document.querySelector("[data-product-role='CLOSING_PRODUCT_CUE']");
  const headline = document.querySelector(".vm-hero h1");
  const heroCta = document.querySelector(".vm-hero .vm-cta");
  const finalCta = document.querySelector(".vm-close .vm-cta");
  const faq = document.querySelector(".vm-faq");
  const footer = document.querySelector(".vm-footer");
  const productBox = box(product);
  const heroBox = box(hero);
  const photos = [...document.querySelectorAll("img.vm-photo-bound")];
  const missing = [...document.querySelectorAll("[data-missing-asset]")].map((node) => node.getAttribute("data-missing-asset"));
  const broken = [...document.querySelectorAll("img")].filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.getAttribute("src"));
  const fit = product ? getComputedStyle(product).objectFit : "";
  const naturalRatio = product && product.naturalWidth ? product.naturalWidth / product.naturalHeight : 0;
  const drawnRatio = productBox && productBox.height ? productBox.width / productBox.height : 0;
  const smallText = [...document.querySelectorAll(".vm-faq p, .vm-faq summary, .vm-footer p")]
    .map((node) => parseFloat(getComputedStyle(node).fontSize))
    .filter((size) => size > 0);
  return {
    systemPresent: Boolean(root),
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    productPresent: Boolean(product),
    closingProductPresent: Boolean(closing),
    productClipped: Boolean(productBox && heroBox && (productBox.top < heroBox.top - 1 || productBox.bottom > heroBox.bottom + 1 || productBox.left < heroBox.left - 1 || productBox.right > heroBox.right + 1)),
    productOverlapsHeadline: intersects(productBox, box(headline)),
    productOverlapsCta: intersects(productBox, box(heroCta)),
    productAspectDistorted: Boolean(product) && (fit !== "contain" || Math.abs(drawnRatio - naturalRatio) > 0.04),
    productWidth: productBox ? Math.round(productBox.width) : 0,
    heroCtaVisible: Boolean(heroCta && box(heroCta).width > 0),
    finalCtaVisible: Boolean(finalCta && box(finalCta).width > 0),
    faqPresent: Boolean(faq),
    faqItems: document.querySelectorAll(".vm-faq details").length,
    footerPresent: Boolean(footer),
    boundPhotos: photos.length,
    missingAssetSlots: missing,
    brokenImages: broken,
    minTypeSize: smallText.length ? Math.min(...smallText) : 0,
    documentHeight: Math.round(document.documentElement.scrollHeight),
  };
`) as () => Record<string, unknown>;

async function inspect(page: Page) {
  return page.evaluate(inspectInPage);
}

async function main() {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const summary: Record<string, unknown> = {};
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(url, { waitUntil: "load", timeout: 120_000 });
    await page.locator("[data-visual-system='visual-master-v1']").waitFor({ timeout: 60_000 });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.screenshot({ path: path.join(out, `${viewport.name}.png`), fullPage: true, animations: "disabled", caret: "hide" });
    const result = await inspect(page);
    summary[viewport.name] = result;
    console.log(`${viewport.name} ${JSON.stringify(result)}`);
  }
  writeFileSync(path.join(out, "qa.json"), `${JSON.stringify({ url, summary }, null, 2)}\n`, "utf8");
  await browser.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "capture failed");
  process.exit(1);
});
