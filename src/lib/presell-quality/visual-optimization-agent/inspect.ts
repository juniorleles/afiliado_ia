import type { VisualInspectResult } from "./types.ts";

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
} as const;

function ratio(visible: number, total: number): number {
  return total <= 0 ? 0 : visible / total;
}

export async function inspectRenderedViewport(input: {
  url: string;
  viewport: keyof typeof VIEWPORTS;
}): Promise<VisualInspectResult> {
  const size = VIEWPORTS[input.viewport];
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ channel: "chrome", headless: true }).catch(() => chromium.launch({ headless: true }));
  try {
    const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.locator("[data-v4='page']").waitFor({ timeout: 90_000 });
    await page.waitForFunction(() => {
      const img = document.querySelector("[data-v4-image='commercial']") as HTMLImageElement | null;
      return !img || (img.complete && img.naturalWidth > 0);
    }, { timeout: 15_000 }).catch(() => undefined);
    const report = await page.evaluate((viewportName) => {
      const foldW = window.innerWidth;
      const foldH = window.innerHeight;
      const img = document.querySelector("[data-v4-image='commercial']") as HTMLImageElement | null;
      const headline = document.querySelector("#hero h1, .premium-structural-hero .ds-display") as HTMLElement | null;
      const hero = document.querySelector("#hero, .premium-structural-hero") as HTMLElement | null;
      const imgBox = img?.getBoundingClientRect();
      const visibleImgW = imgBox ? Math.max(0, Math.min(imgBox.right, foldW) - Math.max(imgBox.left, 0)) : 0;
      const visibleImgH = imgBox ? Math.max(0, Math.min(imgBox.bottom, foldH) - Math.max(imgBox.top, 0)) : 0;
      const packshotVisible = Boolean(
        img &&
          img.complete &&
          img.naturalWidth > 0 &&
          imgBox &&
          visibleImgW > 80 &&
          visibleImgH > 80 &&
          getComputedStyle(img).visibility !== "hidden" &&
          getComputedStyle(img).display !== "none",
      );
      const minWidth = viewportName === "mobile" ? 140 : viewportName === "tablet" ? 180 : 220;
      const packshotInFold = Boolean(imgBox && imgBox.top >= -4 && imgBox.bottom <= foldH + 4 && imgBox.left >= -4);
      const headlineBox = headline?.getBoundingClientRect();
      const headlineReadable = Boolean(
        headline &&
          headlineBox &&
          headlineBox.width > 80 &&
          Number.parseFloat(getComputedStyle(headline).fontSize) >= 22 &&
          headlineBox.top < foldH - 24,
      );
      const heroBox = hero?.getBoundingClientRect();
      const lastHeroChild = hero?.querySelector(".premium-structural-hero__actions, .premium-structural-hero__facts, .premium-structural-hero__copy");
      const lastBox = lastHeroChild?.getBoundingClientRect();
      const emptyHeroSpace = Boolean(heroBox && lastBox && lastBox.bottom < foldH * 0.58 && heroBox.height >= foldH * 0.9);
      const packages = [...document.querySelectorAll("[data-seller-package]")];
      const straddling = packages.filter((el) => {
        const box = el.getBoundingClientRect();
        return box.height > 0 && box.top < foldH - 8 && box.bottom > foldH + 8;
      }).length;
      const buttons = [...document.querySelectorAll(".ds-btn, [data-v4-cta]")];
      const buttonsInsideWidth = buttons.every((el) => {
        const box = el.getBoundingClientRect();
        return box.right <= foldW + 2 && box.left >= -2;
      });
      const overlap = packages.some((el, index) => {
        const a = el.getBoundingClientRect();
        return packages.some((other, otherIndex) => {
          if (otherIndex <= index) return false;
          const b = other.getBoundingClientRect();
          return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top && a.width > 8 && a.height > 8;
        });
      });
      return {
        packshotVisible: packshotVisible && Boolean(imgBox && imgBox.width >= minWidth),
        packshotWidth: Math.round(imgBox?.width ?? 0),
        packshotHeight: Math.round(imgBox?.height ?? 0),
        packshotInFold: packshotVisible && (packshotInFold || visibleImgH / Math.max(imgBox?.height ?? 1, 1) >= 0.85),
        headlineReadable,
        emptyHeroSpace,
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        packageCards: packages.length,
        packageCardsStraddlingFold: straddling,
        packageCardsComplete: packages.length === 0 || straddling === 0,
        overlap,
        buttonsInsideWidth,
      };
    }, input.viewport);
    const criticalDefects: string[] = [];
    if (!report.packshotVisible) criticalDefects.push("Packshot is not visibly rendered.");
    if (!report.headlineReadable) criticalDefects.push("Headline is not readable in the first fold.");
    if (report.emptyHeroSpace) criticalDefects.push("Hero leaves a large unjustified empty area.");
    if (report.overflowX) criticalDefects.push("Horizontal overflow.");
    if (!report.packageCardsComplete) criticalDefects.push("Package cards are clipped by the fold.");
    if (report.overlap) criticalDefects.push("Elements overlap.");
    if (!report.buttonsInsideWidth) criticalDefects.push("Buttons overflow the viewport width.");
    await context.close();
    return { viewport: input.viewport, ...report, criticalDefects };
  } finally {
    await browser.close();
  }
}

export async function inspectRenderedPage(url: string): Promise<VisualInspectResult[]> {
  const viewports = ["desktop", "tablet", "mobile"] as const;
  const results: VisualInspectResult[] = [];
  for (const viewport of viewports) {
    results.push(await inspectRenderedViewport({ url, viewport }));
  }
  return results;
}

export function inspectPass(results: VisualInspectResult[]): boolean {
  const desktop = results.find((item) => item.viewport === "desktop");
  const mobile = results.find((item) => item.viewport === "mobile");
  const tablet = results.find((item) => item.viewport === "tablet");
  return Boolean(
    desktop &&
      mobile &&
      tablet &&
      desktop.packshotVisible &&
      desktop.packshotInFold &&
      !desktop.emptyHeroSpace &&
      !desktop.overflowX &&
      desktop.packageCardsComplete &&
      mobile.packshotVisible &&
      !mobile.overflowX &&
      mobile.packageCardsComplete &&
      mobile.buttonsInsideWidth &&
      tablet.packshotVisible &&
      !tablet.overflowX,
  );
}

export { ratio };
