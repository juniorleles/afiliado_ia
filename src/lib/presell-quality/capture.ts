import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sha256File } from "@/lib/presell-quality/fingerprint";
import type { PresellScreenshotRef } from "@/lib/presell-quality/input";
import { qualityAssessmentRoot } from "@/lib/presell-quality/persist";

export const QUALITY_VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

export type CaptureManifest = {
  campaignId: number;
  generationId: string;
  previewPath: string;
  capturedAt: string;
  desktop: PresellScreenshotRef | null;
  mobile: PresellScreenshotRef | null;
  extras: PresellScreenshotRef[];
  ok: boolean;
  notes: string[];
};

function shotRoot(campaignId: number, generationId: string, iteration?: number): string {
  const base = path.join(qualityAssessmentRoot(), String(campaignId), "shots", generationId);
  return typeof iteration === "number" ? path.join(base, `i${iteration}`) : base;
}

function toRef(input: {
  role: PresellScreenshotRef["role"];
  file: string;
  generationId: string;
  width: number;
  height: number;
}): PresellScreenshotRef | null {
  const hash = sha256File(input.file);
  if (!hash) return null;
  return {
    role: input.role,
    path: input.file.replace(/\\/g, "/"),
    generationId: input.generationId,
    sha256: hash,
    width: input.width,
    height: input.height,
  };
}

export async function captureEvaluationScreenshots(input: {
  campaignId: number;
  generationId: string;
  previewPath: string;
  baseUrl?: string;
  iteration?: number;
  readySelector?: string;
}): Promise<CaptureManifest> {
  const notes: string[] = [];
  const extras: PresellScreenshotRef[] = [];
  const dir = shotRoot(input.campaignId, input.generationId, input.iteration);
  mkdirSync(path.join(dir, "desktop"), { recursive: true });
  mkdirSync(path.join(dir, "mobile"), { recursive: true });
  const base = (input.baseUrl ?? "http://127.0.0.1:3000").replace(/\/$/, "");
  const url = `${base}${input.previewPath}`;
  let desktop: PresellScreenshotRef | null = null;
  let mobile: PresellScreenshotRef | null = null;

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ channel: "chrome", headless: true }).catch(() => chromium.launch({ headless: true }));
  try {
    for (const [name, viewport] of [
      ["desktop", QUALITY_VIEWPORTS.desktop],
      ["mobile", QUALITY_VIEWPORTS.mobile],
    ] as const) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
      await page.locator(input.readySelector ?? "[data-v4='page']").waitFor({ timeout: 25_000 });
      const heroCount = await page.locator("[data-v4-image='commercial']").count();
      if (heroCount > 0) {
        const loaded = await page
          .waitForFunction(
            () => {
              const img = document.querySelector("[data-v4-image='commercial']") as HTMLImageElement | null;
              return Boolean(img && img.complete && img.naturalWidth > 0);
            },
            { timeout: 15_000 },
          )
          .then(() => true)
          .catch(() => false);
        if (!loaded) notes.push(`${name}: hero image did not finish loading before capture.`);
      }
      await page.waitForTimeout(300);
      const folder = path.join(dir, name);
      const viewportFile = path.join(folder, `${name}-viewport.png`);
      const fullFile = path.join(folder, `${name}-full.png`);
      await page.screenshot({ path: viewportFile, fullPage: false });
      await page.screenshot({ path: fullFile, fullPage: true });
      const full = toRef({ role: name, file: fullFile, generationId: input.generationId, width: viewport.width, height: viewport.height });
      const view = toRef({
        role: name === "desktop" ? "desktop-viewport" : "mobile-viewport",
        file: viewportFile,
        generationId: input.generationId,
        width: viewport.width,
        height: viewport.height,
      });
      if (name === "desktop") desktop = full;
      else mobile = full;
      if (view) extras.push(view);
      for (const section of ["hero", "gallery", "legal"] as const) {
        const loc = page.locator(`[data-v4-section='${section}'], #${section}`).first();
        if (await loc.count()) {
          const file = path.join(folder, `${name}-${section}.png`);
          await loc.screenshot({ path: file }).catch(() => undefined);
          const ref = toRef({ role: "section", file, generationId: input.generationId, width: viewport.width, height: viewport.height });
          if (ref) extras.push(ref);
        }
      }
      if (errors.length) notes.push(`${name} console: ${errors.slice(0, 2).join("; ")}`);
      await context.close();
    }
  } catch (err) {
    notes.push(err instanceof Error ? err.message : String(err));
  } finally {
    await browser.close();
  }

  const manifest: CaptureManifest = {
    campaignId: input.campaignId,
    generationId: input.generationId,
    previewPath: input.previewPath,
    capturedAt: new Date().toISOString(),
    desktop,
    mobile,
    extras,
    ok: Boolean(desktop && mobile && existsSync(desktop.path) && existsSync(mobile.path)),
    notes,
  };
  writeFileSync(path.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
