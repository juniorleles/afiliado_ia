import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "data", "evidence", "execution-54bx-conversion-opt-after");
const URL =
  "http://127.0.0.1:3000/admin/lab/lp-generator/lp-mvs7mja3-0d690e7c/preview?visualCapture=visitor&candidate=54BX";

async function main() {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ channel: "chrome", headless: true }).catch(() => chromium.launch({ headless: true }));
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedResponses: Array<{ status: number; url: string }> = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("response", (r) => {
    if (r.status() >= 400) failedResponses.push({ status: r.status(), url: r.url() });
  });

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.locator("[data-v4='page']").waitFor({ timeout: 90_000 });
  await page.evaluate(() => (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready ?? Promise.resolve());

  const report = await page.evaluate(() => {
    const root = document.querySelector("[data-v4='page']");
    const imgs = [...document.querySelectorAll("img")] as HTMLImageElement[];
    const ctas = [...document.querySelectorAll("a.ds-btn, button.ds-btn")] as HTMLElement[];
    const featured = document.querySelector('[data-featured-reason="LOWEST_UNIT_PRICE"]');
    const prices = [...document.querySelectorAll(".ds-display--package")].map((el) => el.textContent?.trim() ?? "");
    const totals = [...document.querySelectorAll(".premium-offer-card__total")].map((el) => el.textContent?.trim() ?? "");
    const links = [...document.querySelectorAll("a[href]")].map((a) => (a as HTMLAnchorElement).getAttribute("href") || "");
    return {
      rendered: Boolean(root),
      execution: root?.getAttribute("data-presell-execution"),
      composition: root?.getAttribute("data-presell-composition"),
      h1: document.querySelector("h1")?.textContent?.trim() ?? null,
      packageCards: document.querySelectorAll("[data-seller-package]").length,
      featuredReason: featured?.getAttribute("data-featured-reason") ?? null,
      featuredKicker: featured?.querySelector(".premium-offer-card__kicker")?.textContent?.trim() ?? null,
      unitPrices: prices,
      totals,
      brokenImages: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
      imagesWithAlt: imgs.filter((i) => (i.getAttribute("alt") || "").trim().length > 0).length,
      imgCount: imgs.length,
      blockedBuys: document.querySelectorAll('[data-offer-cta="blocked"]').length,
      liveHops: document.querySelectorAll('[data-v4-track="official_offer_click"]').length,
      localPreviewOnlySrc: [...document.querySelectorAll("img")]
        .map((img) => img.getAttribute("src") || "")
        .filter((src) => /offer-images\/file\//.test(src)).length,
      disclosure: /commission|Affiliate Disclosure/i.test(document.body.innerText),
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      ctaMinHeights: ctas.slice(0, 8).map((el) => ({
        tag: el.tagName,
        h: Math.round(el.getBoundingClientRect().height),
        disabled: el.getAttribute("aria-disabled"),
      })),
      legalLinks: links.filter((href) => /privacy|terms|affiliate|about|contact/i.test(href)).slice(0, 8),
    };
  });

  await page.locator("#seller-stated-packages").scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const packagesPath = path.join(OUT, "desktop-packages-after.png");
  await page.locator("#seller-stated-packages").screenshot({ path: packagesPath });

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await mobilePage.locator("[data-v4='page']").waitFor({ timeout: 90_000 });
  await mobilePage.locator("#seller-stated-packages").scrollIntoViewIfNeeded();
  await mobilePage.waitForTimeout(250);
  const mobilePackagesPath = path.join(OUT, "mobile-packages-after.png");
  await mobilePage.locator("#seller-stated-packages").screenshot({ path: mobilePackagesPath });

  mkdirSync(OUT, { recursive: true });
  const benign404 = failedResponses.every((item) => /\/favicon\.ico($|\?)/i.test(item.url) || /sourcemap|\.map($|\?)/i.test(item.url));
  const materialConsoleErrors = consoleErrors.filter((msg) => !/favicon\.ico/i.test(msg));
  const payload = {
    consoleErrors,
    materialConsoleErrors,
    pageErrors,
    failedResponses,
    report,
    packagesPath,
    mobilePackagesPath,
    status:
      report.rendered &&
      report.execution === "54BX" &&
      report.brokenImages === 0 &&
      report.liveHops === 0 &&
      report.blockedBuys === 3 &&
      report.unitPrices.includes("$49") &&
      report.featuredReason === "LOWEST_UNIT_PRICE" &&
      !report.overflowX &&
      materialConsoleErrors.length === 0 &&
      pageErrors.length === 0 &&
      (failedResponses.length === 0 || benign404)
        ? "PASS"
        : "FAIL",
  };
  writeFileSync(path.join(OUT, "validation-report.json"), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify(payload, null, 2));
  await browser.close();
  if (payload.status !== "PASS") process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
