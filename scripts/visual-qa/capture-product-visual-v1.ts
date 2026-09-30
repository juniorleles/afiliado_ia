import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

const base = (process.env.VISUAL_QA_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const url = `${base}/admin/preview/joint-genesis-controlled-ready-13`;
const out = path.join(process.cwd(), "data", "visual-design", "joint-genesis-controlled-ready-13", "visual-master", "implementation-product-visual-v1");
const viewports = [
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1440", width: 1440, height: 900 },
];

const inspectInPage = new Function(`
  const intersects = (a, b) => {
    if (!a || !b) return false;
    const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return width > 1 && height > 1;
  };
  const root = document.querySelector("[data-visual-system='visual-master-v1']");
  const hero = document.querySelector(".vm-hero");
  const product = document.querySelector("[data-product-role='HERO_PRODUCT_PRIMARY']");
  const box = (node) => {
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
  };
  const productBox = box(product);
  const heroBox = box(hero);
  const headlineBox = box(document.querySelector(".vm-hero h1"));
  const ctaBox = box(document.querySelector(".vm-hero .vm-cta"));
  const navBox = box(document.querySelector(".vm-nav"));
  const fit = product ? getComputedStyle(product).objectFit : "";
  const naturalRatio = product && product.naturalWidth ? product.naturalWidth / product.naturalHeight : 0;
  const drawnRatio = productBox && productBox.height ? productBox.width / productBox.height : 0;
  return {
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1 || document.body.scrollWidth > window.innerWidth + 1,
    productMissing: !product,
    clipped: Boolean(productBox && heroBox && (productBox.top < heroBox.top - 1 || productBox.bottom > heroBox.bottom + 1 || productBox.left < heroBox.left - 1 || productBox.right > heroBox.right + 1)),
    overlapsHeadline: intersects(productBox, headlineBox),
    overlapsCta: intersects(productBox, ctaBox),
    overlapsNav: intersects(productBox, navBox),
    aspectDistorted: fit !== "contain" || Math.abs(drawnRatio - naturalRatio) > 0.04,
    productWidth: productBox ? Math.round(productBox.width) : 0,
    productHeight: productBox ? Math.round(productBox.height) : 0,
    roles: [...document.querySelectorAll("[data-product-role]")].map((node) => node.getAttribute("data-product-roles")),
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
    await page.goto(url, { waitUntil: "load", timeout: 90_000 });
    await page.locator("[data-product-role='HERO_PRODUCT_PRIMARY']").waitFor({ timeout: 30_000 });
    await page.locator("[data-product-role='PRODUCT_BUNDLE']").waitFor({ timeout: 30_000 });
    await page.locator("[data-product-role='CLOSING_PRODUCT_CUE']").waitFor({ timeout: 30_000 });
    await page.waitForFunction(() => {
      const image = document.querySelector("[data-product-role='HERO_PRODUCT_PRIMARY']");
      return image instanceof HTMLImageElement && image.naturalWidth > 0;
    });
    const target = page.locator("[data-visual-system='visual-master-v1']");
    await target.screenshot({ path: path.join(out, `${viewport.name}.png`), animations: "disabled", caret: "hide" });
    summary[viewport.name] = await inspect(page);
    console.log(`SAVED=${viewport.name}`);
  }
  writeFileSync(path.join(out, "qa.json"), `${JSON.stringify(summary, null, 2)}\n`);
  await browser.close();
  console.log("PRODUCT_VISUAL_CAPTURE=DONE");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "capture failed");
  process.exit(1);
});
