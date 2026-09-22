import fs from "node:fs";
import path from "node:path";
import { ANALYTICS_SKIP_HEADER, ANALYTICS_SKIP_VALUE } from "@/lib/analytics";
import { INTERNAL_FRAME_HEADER, internalFrameSecret } from "@/lib/admin-session";
import { collectLayoutSnapshot } from "@/lib/visual-qa/collect-layout";
import type { LayoutSnapshot } from "@/lib/visual-qa/types";
import type { ScreenshotPayload } from "@/lib/visual-qa/multimodal";
import {
  inspectionViewports,
  SCREENSHOT_SEGMENTS,
  shouldSegmentScreenshot,
  type NamedViewport,
} from "@/lib/visual-qa/viewports";

export type ViewportCapture = {
  viewport: NamedViewport;
  snapshot: LayoutSnapshot;
  screenshotFiles: string[];
  payloads: ScreenshotPayload[];
};

export type ResourceTimingEntry = {
  name: string;
  encodedBodySize: number;
  transferSize: number;
  initiatorType: string;
};

export type BrowserInspection = {
  captures: ViewportCapture[];
  engine: "playwright";
  resources: ResourceTimingEntry[];
};

function tmpDir(slug: string, stamp: string): string {
  const dir = path.join(process.cwd(), "data", "visual-qa-tmp", `${slug}-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function visualFrameUrl(baseUrl: string, slug: string): string {
  return `${baseUrl.replace(/\/$/, "")}/visual-frame/${encodeURIComponent(slug)}`;
}

async function waitForArticleImages(page: import("playwright").Page) {
  await page
    .waitForFunction(
      `() => {
        const imgs = [...document.querySelectorAll("article img")];
        if (imgs.length === 0) return true;
        const loaded = imgs.every((img) => img.complete && img.naturalWidth > 0);
        const stages = [...document.querySelectorAll("[data-product-stage] img")];
        const staged = stages.every((img) => {
          const box = img.getBoundingClientRect();
          return img.complete && img.naturalWidth > 0 && box.height > 24 && box.width > 24;
        });
        const lcp = document.querySelector("[data-product-lcp]");
        const lcpOk = !lcp || (lcp.complete && lcp.naturalWidth > 0 && lcp.getBoundingClientRect().height > 80);
        return loaded && staged && lcpOk;
      }`,
      { timeout: 12_000 },
    )
    .catch(() => undefined);
}

async function captureViewport(
  page: import("playwright").Page,
  viewport: NamedViewport,
  dir: string,
): Promise<ViewportCapture> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.evaluate(`window.scrollTo(0, 0)`);
  await waitForArticleImages(page);
  await page.waitForTimeout(250);
  const faq = page.locator("[data-trust-disclosure] details summary").first();
  if ((await faq.count()) > 0) {
    await faq.click({ timeout: 2000 }).catch(() => undefined);
  }
  const snapshot = (await page.evaluate(`(${collectLayoutSnapshot.toString()})()`)) as LayoutSnapshot;
  snapshot.viewport = {
    width: viewport.width,
    height: viewport.height,
    label: viewport.label,
  };

  const screenshotFiles: string[] = [];
  const payloads: ScreenshotPayload[] = [];
  if (!viewport.captureScreenshots) {
    return { viewport, snapshot, screenshotFiles, payloads };
  }

  const fullName = `${viewport.label}-${viewport.width}x${viewport.height}-full.jpg`;
  const fullPath = path.join(dir, fullName);
  const fullBuf = await page.screenshot({
    fullPage: true,
    type: "jpeg",
    quality: 52,
    path: fullPath,
    animations: "disabled",
  });
  screenshotFiles.push(fullPath);

  if (!shouldSegmentScreenshot({ pageHeight: snapshot.pageHeight, jpegBytes: fullBuf.length })) {
    payloads.push({
      mediaType: "image/jpeg",
      base64: fullBuf.toString("base64"),
      label: `${viewport.label} full page ${viewport.width}x${viewport.height}`,
    });
    return { viewport, snapshot, screenshotFiles, payloads };
  }

  const pageHeight = snapshot.pageHeight;
  const sliceHeight = Math.max(viewport.height, Math.ceil(pageHeight / SCREENSHOT_SEGMENTS.length));
  for (let i = 0; i < SCREENSHOT_SEGMENTS.length; i += 1) {
    const y = Math.min(i * sliceHeight, Math.max(pageHeight - viewport.height, 0));
    await page.evaluate(`window.scrollTo(0, ${y})`);
    await page.waitForTimeout(200);
    const name = `${viewport.label}-${SCREENSHOT_SEGMENTS[i]}.jpg`;
    const file = path.join(dir, name);
    const buf = await page.screenshot({ type: "jpeg", quality: 55, path: file, animations: "disabled" });
    screenshotFiles.push(file);
    payloads.push({
      mediaType: "image/jpeg",
      base64: buf.toString("base64"),
      label: `${viewport.label} ${SCREENSHOT_SEGMENTS[i]} y=${y}`,
    });
  }
  await page.evaluate(`window.scrollTo(0, 0)`);
  return { viewport, snapshot, screenshotFiles, payloads };
}

export async function inspectRenderedPresell(input: {
  slug: string;
  baseUrl: string;
  url?: string;
  artifactKey?: string;
}): Promise<BrowserInspection> {
  const { chromium } = await import("playwright");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = tmpDir(input.artifactKey || input.slug, stamp);
  const url = input.url || visualFrameUrl(input.baseUrl, input.slug);

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage"],
  });
  try {
    const context = await browser.newContext({
      extraHTTPHeaders: {
        [ANALYTICS_SKIP_HEADER]: ANALYTICS_SKIP_VALUE,
        ...(internalFrameSecret() ? { [INTERNAL_FRAME_HEADER]: internalFrameSecret() as string } : {}),
      },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(45_000);
    const first = inspectionViewports()[0];
    if (first) {
      await page.setViewportSize({ width: first.width, height: first.height });
    }
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    if (!response || response.status() >= 400) {
      throw new Error(`Visual frame returned HTTP ${response?.status() ?? "none"} for ${url}`);
    }
    await page.waitForSelector("article", { timeout: 30_000 });
    await page.addStyleTag({
      content: "nextjs-portal,[data-next-badge-root]{display:none!important;visibility:hidden!important;}",
    });
    await waitForArticleImages(page);
    await page.waitForTimeout(300);

    const captures: ViewportCapture[] = [];
    for (const viewport of inspectionViewports()) {
      captures.push(await captureViewport(page, viewport, dir));
    }
    const resources = (await page
      .evaluate(
        `performance.getEntriesByType("resource").map((e) => ({
          name: e.name,
          encodedBodySize: e.encodedBodySize || 0,
          transferSize: e.transferSize || 0,
          initiatorType: e.initiatorType || "",
        }))`,
      )
      .catch(() => [])) as ResourceTimingEntry[];
    await context.close();
    return { captures, engine: "playwright", resources };
  } finally {
    await browser.close();
  }
}
