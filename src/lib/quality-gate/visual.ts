import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { contrastRatio } from "@/lib/design-system/tokens";
import { toPosixRelative } from "@/lib/quality-gate/scope";
import type { Defect } from "@/lib/quality-gate/types";

export const VIEWPORTS = [1440, 768, 390] as const;

export type HtmlProbe = {
  overflow: boolean;
  scrollWidth: number;
  clientWidth: number;
  viewport: number;
  hiddenEssential: string[];
  ctaContrast: Array<{ text: string; ratio: number; fg: string; bg: string }>;
  unauthorizedCtas: string[];
  consoleErrors: string[];
  loadFailed: boolean;
  screenshot?: string;
};

export type MultimodalVisualResult = {
  state: "NOT_EVALUATED";
  reason: string;
  observations: [];
};

/**
 * Optional multimodal review. Paid vision is never called from this path.
 * Absence is recorded as NOT_EVALUATED and is not visual approval.
 */
export function reviewVisualOptional(): MultimodalVisualResult {
  return {
    state: "NOT_EVALUATED",
    reason: "paid multimodal review is not configured for this execution",
    observations: [],
  };
}

const HEX = /#([0-9a-f]{3}|[0-9a-f]{6})\b/i;

function expandHex(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length === 3) return `#${h.split("").map((c) => c + c).join("")}`;
  return `#${h}`;
}

export function extractRule(css: string, selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, "i"));
  if (!block) return {};
  const out: Record<string, string> = {};
  for (const part of block[1].split(";")) {
    const [key, ...rest] = part.split(":");
    if (!key || rest.length === 0) continue;
    out[key.trim().toLowerCase()] = rest.join(":").trim();
  }
  return out;
}

export function staticHtmlDefects(html: string, file: string): Defect[] {
  const defects: Defect[] = [];
  const styleBlocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const css = styleBlocks.join("\n");
  const widths = [...css.matchAll(/width:\s*(\d+)px/gi)].map((m) => Number(m[1]));
  if (widths.some((n) => n > 1440)) {
    defects.push({
      id: "overflow-static",
      kind: "OVERFLOW",
      severity: "BLOCKING",
      gate: "VISUAL_REVIEW_GATE",
      message: `horizontal overflow: CSS width ${Math.max(...widths)}px exceeds 1440`,
      evidence: [`${file} width ${Math.max(...widths)}px`],
      files: [file],
      fixable: true,
      acceptance: "content must not force horizontal scroll at 1440/768/390",
    });
  }

  const ctaInline = html.match(/data-cta=["']purchase["'][^>]*style=["']([^"']+)["']/i) || html.match(/style=["']([^"']+)["'][^>]*data-cta=["']purchase["']/i);
  const ctaClass = html.match(/class=["'][^"']*cta[^"']*["']/i);
  const rule = ctaClass ? extractRule(css, ".cta") : {};
  const styleText = ctaInline?.[1] ?? "";
  const fgMatch = styleText.match(/color:\s*(#[0-9a-f]{3,6})/i) || (rule.color && HEX.test(rule.color) ? [rule.color, rule.color] : null);
  const bgMatch = styleText.match(/background(?:-color)?:\s*(#[0-9a-f]{3,6})/i) || (rule.background && HEX.test(rule.background) ? [rule.background, rule.background] : null);
  if (fgMatch && bgMatch) {
    const fg = expandHex(fgMatch[1] || fgMatch[0]);
    const bg = expandHex(bgMatch[1] || bgMatch[0]);
    const ratio = contrastRatio(fg, bg);
    if (ratio < 4.5) {
      defects.push({
        id: "cta-contrast",
        kind: "LOW_CONTRAST",
        severity: "BLOCKING",
        gate: "VISUAL_REVIEW_GATE",
        message: `purchase CTA contrast ${ratio.toFixed(2)}:1 is below 4.5:1`,
        evidence: [`${file} ${fg} on ${bg}`],
        files: [file],
        fixable: true,
        acceptance: "purchase CTA text must meet 4.5:1 against its background",
      });
    }
  }

  if (/data-essential=["']true["'][^>]*(hidden|display:\s*none|visibility:\s*hidden)/i.test(html) || /<(h1)[^>]*hidden/i.test(html)) {
    defects.push({
      id: "hidden-essential",
      kind: "INVISIBLE_ELEMENT",
      severity: "BLOCKING",
      gate: "VISUAL_REVIEW_GATE",
      message: "an essential element is hidden",
      evidence: [file],
      files: [file],
      fixable: true,
      acceptance: "essential elements must remain visible",
    });
  }

  const unauthorized = [...html.matchAll(/<a\b([^>]*)>/gi)].filter((m) => {
    const attrs = m[1];
    return /data-cta=["']purchase["']/i.test(attrs) && /data-authorized=["']false["']/i.test(attrs);
  });
  if (unauthorized.length) {
    defects.push({
      id: "unauthorized-cta",
      kind: "INVALID_CTA",
      severity: "BLOCKING",
      gate: "COMMERCIAL_AUTHORIZATION_GATE",
      message: "purchase CTA is present without authorization",
      evidence: unauthorized.map((m) => m[0]),
      files: [file],
      fixable: false,
      acceptance: "a commercial hop is allowed only when the contract authorizes it",
    });
  }

  return defects;
}

export async function probeHtmlFile(input: {
  file: string;
  evidenceDir: string;
  capture: boolean;
  workspaceRoot?: string;
}): Promise<{ probes: HtmlProbe[]; playwright: "OK" | "UNAVAILABLE"; defects: Defect[] }> {
  const rel = input.workspaceRoot ? toPosixRelative(input.file, input.workspaceRoot) : input.file;
  const defects = staticHtmlDefects(await import("node:fs").then((fs) => fs.readFileSync(input.file, "utf8")), rel);
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true, channel: "chrome" }).catch(() => chromium.launch({ headless: true }));
    const probes: HtmlProbe[] = [];
    const shotDir = path.join(input.evidenceDir, "screenshots");
    if (input.capture) mkdirSync(shotDir, { recursive: true });
    const consoleErrors: string[] = [];
    for (const width of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.on("pageerror", (err) => consoleErrors.push(err.message));
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      let loadFailed = false;
      try {
        await page.goto(pathToFileURL(input.file).href, { waitUntil: "domcontentloaded", timeout: 8000 });
      } catch (err) {
        loadFailed = true;
        defects.push({
          id: `load-${width}`,
          kind: "LOAD_FAILURE",
          severity: "BLOCKING",
          gate: "TECHNICAL_GATE",
          message: `page failed to load at ${width}px: ${err instanceof Error ? err.message : String(err)}`,
          evidence: [input.file],
          files: [rel],
          fixable: false,
          acceptance: "the isolated fixture must load",
        });
      }
      const measured = await page.evaluate(() => {
        const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
        const hiddenEssential = [...document.querySelectorAll("[data-essential='true'], h1")].filter((el) => {
          const style = getComputedStyle(el);
          const box = el.getBoundingClientRect();
          return style.display === "none" || style.visibility === "hidden" || box.width < 1 || box.height < 1;
        }).map((el) => el.tagName.toLowerCase());
        const ctas = [...document.querySelectorAll("[data-cta='purchase']")].map((el) => {
          const style = getComputedStyle(el);
          return {
            text: (el.textContent || "").trim(),
            fg: style.color,
            bg: style.backgroundColor,
            authorized: el.getAttribute("data-authorized") !== "false",
          };
        });
        return {
          overflow,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          hiddenEssential,
          ctas,
        };
      });
      let screenshot: string | undefined;
      if (input.capture && !loadFailed) {
        const name = `${path.basename(input.file, path.extname(input.file))}-${width}.jpg`;
        const dest = path.join(shotDir, name);
        await page.screenshot({ path: dest, type: "jpeg", quality: 55, fullPage: true });
        screenshot = dest;
      }
      await page.close();
      if (measured.overflow && !defects.some((item) => item.kind === "OVERFLOW")) {
        defects.push({
          id: `overflow-${width}`,
          kind: "OVERFLOW",
          severity: "BLOCKING",
          gate: "VISUAL_REVIEW_GATE",
          message: `horizontal overflow at ${width}px (${measured.scrollWidth} > ${measured.clientWidth})`,
          evidence: [`viewport ${width}`, input.file],
          files: [rel],
          fixable: true,
          acceptance: "content must not force horizontal scroll at 1440/768/390",
        });
      }
      if (measured.hiddenEssential.includes("h1") && !defects.some((item) => item.kind === "INVISIBLE_ELEMENT")) {
        defects.push({
          id: `hidden-${width}`,
          kind: "INVISIBLE_ELEMENT",
          severity: "BLOCKING",
          gate: "VISUAL_REVIEW_GATE",
          message: `essential heading is not visible at ${width}px`,
          evidence: [input.file],
          files: [rel],
          fixable: true,
          acceptance: "essential elements must remain visible",
        });
      }
      probes.push({
        overflow: measured.overflow,
        scrollWidth: measured.scrollWidth,
        clientWidth: measured.clientWidth,
        viewport: width,
        hiddenEssential: measured.hiddenEssential,
        ctaContrast: [],
        unauthorizedCtas: measured.ctas.filter((c) => !c.authorized).map((c) => c.text),
        consoleErrors: [...consoleErrors],
        loadFailed,
        screenshot,
      });
    }
    await browser.close();
    if (consoleErrors.length) {
      defects.push({
        id: "console-errors",
        kind: "CONSOLE_ERROR",
        severity: "MAJOR",
        gate: "TECHNICAL_GATE",
        message: `console errors: ${consoleErrors.slice(0, 3).join("; ")}`,
        evidence: consoleErrors,
        files: [rel],
        fixable: false,
        acceptance: "the isolated page must not throw",
      });
    }
    return { probes, playwright: "OK", defects };
  } catch (err) {
    writeFileSync(
      path.join(input.evidenceDir, "playwright-unavailable.json"),
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }, null, 2),
    );
    return { probes: [], playwright: "UNAVAILABLE", defects };
  }
}
