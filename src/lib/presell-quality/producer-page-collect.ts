import { mkdirSync } from "node:fs";
import path from "node:path";
import { inspectPublicHttpsUrl } from "@/lib/real-product-assets/ssrf";
import { sha256File } from "@/lib/presell-quality/fingerprint";

export const PRODUCER_COLLECT_VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

export type ProducerPageCollectResult = {
  ok: boolean;
  requestedUrl: string;
  initialUrl: string;
  finalUrl: string | null;
  title: string | null;
  capturedAt: string;
  visibleText: string;
  htmlBytes: number;
  imageUrls: string[];
  linkedOfficialUrls: string[];
  namesMayBeChanged: boolean;
  desktopScreenshot: string | null;
  mobileScreenshot: string | null;
  desktopHash: string | null;
  mobileHash: string | null;
  notes: string[];
};

function absoluteUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

export async function collectProducerCommercialPage(input: {
  url: string;
  outDir: string;
}): Promise<ProducerPageCollectResult> {
  const capturedAt = new Date().toISOString();
  const notes: string[] = [];
  const safe = inspectPublicHttpsUrl(input.url);
  if (!safe.ok) {
    return {
      ok: false,
      requestedUrl: input.url,
      initialUrl: input.url,
      finalUrl: null,
      title: null,
      capturedAt,
      visibleText: "",
      htmlBytes: 0,
      imageUrls: [],
      linkedOfficialUrls: [],
      namesMayBeChanged: false,
      desktopScreenshot: null,
      mobileScreenshot: null,
      desktopHash: null,
      mobileHash: null,
      notes: [safe.reason],
    };
  }
  mkdirSync(input.outDir, { recursive: true });
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ channel: "chrome", headless: true }).catch(() => chromium.launch({ headless: true }));
  let finalUrl: string | null = null;
  let title: string | null = null;
  let visibleText = "";
  let htmlBytes = 0;
  let imageUrls: string[] = [];
  let linkedOfficialUrls: string[] = [];
  let namesMayBeChanged = false;
  let desktopScreenshot: string | null = null;
  let mobileScreenshot: string | null = null;
  try {
    const context = await browser.newContext({ viewport: PRODUCER_COLLECT_VIEWPORTS.desktop, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const response = await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(2500);
    finalUrl = page.url();
    title = await page.title();
    if (!response || !response.ok()) notes.push(`HTTP status ${response?.status() ?? "none"}.`);
    visibleText = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    htmlBytes = (await page.content()).length;
    namesMayBeChanged = /names and personal identifying information on this site have been changed/i.test(visibleText);
    const rawLinks = await page.$$eval("a[href]", (nodes) => nodes.map((node) => (node as HTMLAnchorElement).getAttribute("href") || ""));
    const rawImages = await page.$$eval("img[src]", (nodes) => nodes.map((node) => (node as HTMLImageElement).getAttribute("src") || ""));
    linkedOfficialUrls = [...new Set(rawLinks.map((href) => absoluteUrl(href, finalUrl || input.url)).filter((item): item is string => Boolean(item)))];
    imageUrls = [
      ...new Set(
        rawImages
          .filter((src) => src && !src.startsWith("data:"))
          .map((src) => absoluteUrl(src, finalUrl || input.url))
          .filter((item): item is string => Boolean(item)),
      ),
    ];
    desktopScreenshot = path.join(input.outDir, "producer-desktop.png");
    await page.screenshot({ path: desktopScreenshot, fullPage: true });
    await context.close();

    const mobileContext = await browser.newContext({ viewport: PRODUCER_COLLECT_VIEWPORTS.mobile, deviceScaleFactor: 1 });
    const mobile = await mobileContext.newPage();
    await mobile.goto(input.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await mobile.waitForTimeout(2000);
    mobileScreenshot = path.join(input.outDir, "producer-mobile.png");
    await mobile.screenshot({ path: mobileScreenshot, fullPage: true });
    await mobileContext.close();
  } catch (err) {
    notes.push(err instanceof Error ? err.message : String(err));
  } finally {
    await browser.close();
  }
  return {
    ok: Boolean(finalUrl && visibleText),
    requestedUrl: input.url,
    initialUrl: input.url,
    finalUrl,
    title,
    capturedAt,
    visibleText,
    htmlBytes,
    imageUrls,
    linkedOfficialUrls,
    namesMayBeChanged,
    desktopScreenshot,
    mobileScreenshot,
    desktopHash: desktopScreenshot ? sha256File(desktopScreenshot) : null,
    mobileHash: mobileScreenshot ? sha256File(mobileScreenshot) : null,
    notes,
  };
}
