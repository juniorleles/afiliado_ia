import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sha256File } from "@/lib/presell-quality/fingerprint";
import { PREMIUM_ENGINE_VERSION } from "@/lib/presell-quality/premium-design";
import { RENDERER_V4_ID } from "@/lib/presell-quality/types";
import { VISITOR_VISUAL_CAPTURE } from "@/lib/presell-quality/evaluation-comparability";

export const VISITOR_CAPTURE_VIEWPORTS = {
  desktop: { name: "desktop" as const, width: 1440, height: 900 },
  tablet: { name: "tablet" as const, width: 768, height: 1024 },
  mobile: { name: "mobile" as const, width: 390, height: 844 },
} as const;

export const VISITOR_CAPTURE_DEVICE_SCALE_FACTOR = 1;
export const VISITOR_PAGE_SELECTOR = "[data-v4='page']";
export const ADMIN_CHROME_SELECTOR = ".ds-labbar, .ds-topbar, [href*='/admin/lab/lp-generator/']";
export type VisitorCaptureNaming = "visitor" | "official";

export function visitorCaptureFilenames(viewport: string, naming: VisitorCaptureNaming = "visitor"): { fold: string; full: string } {
  if (naming === "official") {
    return { fold: `${viewport}-first-fold.png`, full: `${viewport}-full.png` };
  }
  return { fold: `${viewport}-visitor-fold.png`, full: `${viewport}-visitor.png` };
}

export type VisitorCaptureInspect = {
  width: number;
  height: number;
  deviceScaleFactor: number;
  overflowX: boolean;
  rendered: boolean;
  heroLoaded: boolean;
  brokenImages: number;
  adminChromePresent: boolean;
  liveHop: boolean;
  previewCtaEnabled: boolean;
  checkoutRequest: boolean;
  missingFonts: number;
  clippedEssential: boolean;
};

export type VisitorCaptureShot = {
  role: "full" | "fold";
  viewport: "desktop" | "tablet" | "mobile";
  path: string;
  sha256: string | null;
  width: number;
  height: number;
};

export type VisitorCaptureManifest = {
  mode: typeof VISITOR_VISUAL_CAPTURE;
  campaignId: number;
  generationId: string;
  rendererVersion: string;
  engineVersion: string;
  sourceCommit: string | null;
  previewPath: string;
  capturedAt: string;
  deviceScaleFactor: number;
  shots: VisitorCaptureShot[];
  inspect: Record<string, VisitorCaptureInspect>;
  ok: boolean;
  notes: string[];
};

export function visitorCapturePreviewPath(generationId: string): string {
  return `/admin/lab/lp-generator/${generationId}/preview?visualCapture=visitor`;
}

export function adminChromePresentInHtml(html: string): boolean {
  return /class="[^"]*\bds-labbar\b|class="[^"]*\bds-topbar\b|Detalhes da gera/i.test(html);
}

export function visitorCaptureDefects(inspect: VisitorCaptureInspect): string[] {
  const defects: string[] = [];
  if (!inspect.rendered) defects.push("Page container did not render.");
  if (inspect.overflowX) defects.push("Horizontal overflow.");
  if (inspect.brokenImages > 0) defects.push("Broken images.");
  if (inspect.adminChromePresent) defects.push("Administrative chrome is visible.");
  if (inspect.liveHop || inspect.previewCtaEnabled) defects.push("Commercial CTA is enabled.");
  if (inspect.checkoutRequest) defects.push("Checkout request detected.");
  if (inspect.missingFonts > 0) defects.push("Missing fonts.");
  if (inspect.clippedEssential) defects.push("Essential content is clipped.");
  return defects;
}

export async function captureVisitorVisuals(input: {
  campaignId: number;
  generationId: string;
  outDir: string;
  sourceCommit?: string | null;
  baseUrl?: string;
  naming?: VisitorCaptureNaming;
  manifestName?: string;
}): Promise<VisitorCaptureManifest> {
  const notes: string[] = [];
  const shots: VisitorCaptureShot[] = [];
  const inspect: Record<string, VisitorCaptureInspect> = {};
  mkdirSync(input.outDir, { recursive: true });
  const base = (input.baseUrl ?? "http://127.0.0.1:3000").replace(/\/$/, "");
  const previewPath = visitorCapturePreviewPath(input.generationId);
  const url = `${base}${previewPath}`;
  let checkoutRequest = false;

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ channel: "chrome", headless: true }).catch(() => chromium.launch({ headless: true }));
  try {
    for (const viewport of Object.values(VISITOR_CAPTURE_VIEWPORTS)) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: VISITOR_CAPTURE_DEVICE_SCALE_FACTOR,
      });
      const page = await context.newPage();
      page.on("request", (request) => {
        if (/checkout|order-now|add-to-cart/i.test(request.url())) checkoutRequest = true;
      });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await page.locator(VISITOR_PAGE_SELECTOR).waitFor({ timeout: 90_000 });
      await page.waitForFunction(() => {
        const img = document.querySelector("[data-v4-image='commercial']") as HTMLImageElement | null;
        return !img || (img.complete && img.naturalWidth > 0);
      }, { timeout: 15_000 }).catch(() => undefined);
      await page.evaluate(() => (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready ?? Promise.resolve());
      const report = await page.evaluate((adminSelector) => {
        const root = document.querySelector("[data-v4='page']");
        const heroImg = document.querySelector("[data-v4-image='commercial']") as HTMLImageElement | null;
        const images = [...document.querySelectorAll("img")] as HTMLImageElement[];
        const preview = document.querySelector('[data-v4-cta="preview-disabled"]');
        return {
          rendered: Boolean(root),
          overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          heroLoaded: Boolean(heroImg && heroImg.complete && heroImg.naturalWidth > 0),
          brokenImages: images.filter((img) => img.complete && img.naturalWidth === 0).length,
          adminChromePresent: Boolean(document.querySelector(adminSelector)),
          liveHop: Boolean(document.querySelector('[data-v4-track="official_offer_click"]')),
          previewCtaEnabled: Boolean(preview && preview.tagName === "A" && preview.getAttribute("href")),
          missingFonts: 0,
          clippedEssential: Boolean(root && root.getBoundingClientRect().width <= 0),
        };
      }, ADMIN_CHROME_SELECTOR);
      inspect[viewport.name] = {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: VISITOR_CAPTURE_DEVICE_SCALE_FACTOR,
        checkoutRequest,
        ...report,
      };
      const names = visitorCaptureFilenames(viewport.name, input.naming ?? "visitor");
      const foldPath = path.join(input.outDir, names.fold);
      const fullPath = path.join(input.outDir, names.full);
      await page.screenshot({ path: foldPath, fullPage: false });
      await page.screenshot({ path: fullPath, fullPage: true });
      shots.push({
        role: "fold",
        viewport: viewport.name,
        path: foldPath,
        sha256: sha256File(foldPath),
        width: viewport.width,
        height: viewport.height,
      });
      shots.push({
        role: "full",
        viewport: viewport.name,
        path: fullPath,
        sha256: sha256File(fullPath),
        width: viewport.width,
        height: viewport.height,
      });
      const defects = visitorCaptureDefects(inspect[viewport.name]!);
      if (defects.length) notes.push(`${viewport.name}: ${defects.join("; ")}`);
      await context.close();
    }
  } catch (err) {
    notes.push(err instanceof Error ? err.message : String(err));
  } finally {
    await browser.close();
  }

  const manifest: VisitorCaptureManifest = {
    mode: VISITOR_VISUAL_CAPTURE,
    campaignId: input.campaignId,
    generationId: input.generationId,
    rendererVersion: RENDERER_V4_ID,
    engineVersion: PREMIUM_ENGINE_VERSION,
    sourceCommit: input.sourceCommit ?? null,
    previewPath,
    capturedAt: new Date().toISOString(),
    deviceScaleFactor: VISITOR_CAPTURE_DEVICE_SCALE_FACTOR,
    shots,
    inspect,
    ok: shots.length >= 6 && Object.values(inspect).every((item) => item.rendered && !item.adminChromePresent && !item.overflowX),
    notes,
  };
  const manifestName = input.manifestName ?? (input.naming === "official" ? "capture-manifest.json" : "capture-protocol.json");
  writeFileSync(path.join(input.outDir, manifestName), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function screenshotIdentityHash(shot: VisitorCaptureShot): string {
  return createHash("sha256").update(`${shot.viewport}:${shot.role}:${shot.sha256 ?? shot.path}`).digest("hex");
}
