/**
 * Execution 45 — real browser capture and visual probe for the premium showcase.
 *
 * Usage: npx tsx scripts/capture-lp-premium-v2.ts <phase> [label ...]
 *   phase: before | after   (a directory data/evidence/lp-premium-v2/<phase>/ that must not exist yet,
 *                            or be extended with files that do not exist)
 * Needs the dev server on 127.0.0.1:3000. Uses the installed Microsoft Edge (no browser download).
 * Read only for campaign data. Lighthouse is not run.
 */
import { existsSync, mkdirSync, statfsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

const BASE = "http://127.0.0.1:3000";
const ROOT = path.join(process.cwd(), "data", "evidence", process.env.EVIDENCE_DIR ?? "lp-premium-v2");
const MIN_FREE = 5 * 1024 ** 3;

export const TARGETS: Array<{ label: string; route: string; note: string }> = [
  { label: "campaign-190", route: "/visual-frame/neuroprime", note: "Reference campaign. No description, image, manufacturer or authorized CTA." },
  { label: "campaign-188", route: "/admin/lab/product-showcase/cholibrium", note: "Rich facts, seller claims blocked. Showcase preview, persisted template untouched." },
  { label: "campaign-189", route: "/admin/lab/product-showcase/northwind-qa", note: "Small QA product. Showcase preview." },
  { label: "campaign-186", route: "/admin/lab/product-showcase/campanha-testes", note: "Insufficient evidence. Showcase preview." },
  { label: "campaign-183", route: "/admin/lab/product-showcase/builder-cand-43513775d90140b1", note: "Official image and authorized CTA. Read-only showcase preview." },
  { label: "fixture-capsule", route: "/admin/lab/homologation/capsule", note: "Synthetic: packshot, CTA, price, guarantee, format." },
  { label: "fixture-few", route: "/admin/lab/homologation/few", note: "Synthetic: few ingredients." },
  { label: "fixture-thin", route: "/admin/lab/homologation/thin", note: "Synthetic: insufficient commercial information." },
  { label: "fixture-operational", route: "/admin/lab/homologation/operational", note: "Synthetic (added in V2, no V1 baseline): manufacturer, shipping and returns only; no proposition." },
  { label: "fixture-described", route: "/admin/lab/homologation/described", note: "Synthetic (added in V2, no V1 baseline): description plus manufacturer, shipping and returns." },
];

export const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
] as const;

function freeBytes(): number {
  const stats = statfsSync(process.cwd());
  return Number(stats.bavail) * Number(stats.bsize);
}

async function probe(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const visible = (el: Element) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const rgb = (value: string) => {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = match[1].split(",").map((item) => parseFloat(item.trim()));
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    };
    const lum = (c: { r: number; g: number; b: number }) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const backdrop = (el: Element) => {
      let node: Element | null = el;
      while (node) {
        const bg = rgb(getComputedStyle(node).backgroundColor);
        if (bg && bg.a > 0.5) return bg;
        node = node.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    const contrast = (el: Element | null) => {
      if (!el) return null;
      const fg = rgb(getComputedStyle(el).color);
      if (!fg) return null;
      const bg = backdrop(el);
      const a = lum(fg);
      const b = lum(bg);
      return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
    };
    const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : ""}`;

    const root = document.documentElement;
    const h1 = document.querySelector("h1");
    const h1Rect = h1?.getBoundingClientRect();
    // First text element after the h1 inside the hero copy column.
    const copy = h1?.parentElement ?? null;
    const afterH1 = copy ? Array.from(copy.children).filter((el) => el !== h1 && visible(el)) : [];
    const lead = copy?.querySelector("[data-role='lead'], .psp-lead, .psp2-lead") ?? null;
    const cta = document.querySelector("[data-cta-position], [data-cta-placeholder], a.psp-cta, .psp2-cta");
    const ctaRect = cta?.getBoundingClientRect();
    const disclosure = Array.from(document.querySelectorAll("p, div, span")).find((el) => /^Disclosure:/i.test((el.textContent ?? "").trim()) && visible(el));

    const horizontal: string[] = [];
    const clipped: string[] = [];
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      if (!visible(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.right > vw + 1 || rect.left < -1) {
        const scrollParent = el.closest("[data-scroll-x], .psp-nav");
        if (!scrollParent) horizontal.push(describe(el));
      }
      const style = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 1 && style.overflowX !== "visible" && style.overflowX !== "auto" && style.overflowX !== "scroll" && el.clientWidth > 0 && !el.matches("html, body, img, svg")) {
        clipped.push(describe(el));
      }
    }
    const small: string[] = [];
    for (const el of Array.from(document.querySelectorAll("a[href], button"))) {
      if (!visible(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 44 || rect.height < 44) small.push(`${describe(el)} ${Math.round(rect.width)}x${Math.round(rect.height)}`);
    }
    const brokenImages = Array.from(document.images).filter((img) => visible(img) && (!img.complete || img.naturalWidth === 0)).map((img) => img.getAttribute("src") ?? "");

    // Reading order of the top of the page.
    const order = Array.from(document.querySelectorAll("h1, h2, h3, p, li, a.psp-cta, [data-cta-position], [data-cta-placeholder]"))
      .filter(visible)
      .slice(0, 14)
      .map((el) => `${describe(el)} :: ${(el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 70)}`);

    return {
      viewport: { width: vw, height: vh },
      documentWidth: root.scrollWidth,
      horizontalOverflow: root.scrollWidth > vw + 1,
      overflowingElements: [...new Set(horizontal)].slice(0, 12),
      clippedText: [...new Set(clipped)].slice(0, 12),
      pageHeight: root.scrollHeight,
      h1: h1 ? { text: (h1.textContent ?? "").trim(), fontSizePx: parseFloat(getComputedStyle(h1).fontSize), top: Math.round(h1Rect!.top), contrast: contrast(h1) } : null,
      heroAfterH1: afterH1.slice(0, 4).map((el) => ({ el: describe(el), role: el.getAttribute("data-role"), text: (el.textContent ?? "").trim().slice(0, 90) })),
      lead: lead ? { text: (lead.textContent ?? "").trim().slice(0, 120), role: lead.getAttribute("data-role"), contrast: contrast(lead) } : null,
      cta: cta
        ? {
            text: (cta.textContent ?? "").trim(),
            placeholder: cta.hasAttribute("data-cta-placeholder"),
            ariaDisabled: cta.getAttribute("aria-disabled"),
            href: cta.getAttribute("href"),
            width: Math.round(ctaRect!.width),
            height: Math.round(ctaRect!.height),
            top: Math.round(ctaRect!.top),
            insideFirstViewport: ctaRect!.top >= 0 && ctaRect!.bottom <= vh,
            contrast: contrast(cta),
          }
        : null,
      disclosure: disclosure ? { text: (disclosure.textContent ?? "").trim().slice(0, 100), top: Math.round(disclosure.getBoundingClientRect().top), contrast: contrast(disclosure) } : null,
      smallTapTargets: small.slice(0, 12),
      brokenImages,
      images: document.images.length,
      headings: Array.from(document.querySelectorAll("h1, h2")).filter(visible).map((el) => (el.textContent ?? "").trim().slice(0, 60)),
      readingOrder: order,
      dataDesign: document.querySelector("article.psp")?.getAttribute("data-design") ?? null,
    };
  });
}

async function main() {
  const [phase, ...only] = process.argv.slice(2);
  if (!phase || !/^(before|after|wip-\d+)$/.test(phase)) throw new Error("phase must be before, after or wip-N");
  if (freeBytes() < MIN_FREE) throw new Error("DISK_GUARD: free space below 5 GB");
  const dir = path.join(ROOT, phase);
  mkdirSync(dir, { recursive: true });
  const targets = only.length > 0 ? TARGETS.filter((item) => only.includes(item.label)) : TARGETS;
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  const results: Array<Record<string, unknown>> = [];
  try {
    for (const target of targets) {
      for (const viewport of VIEWPORTS) {
        if (freeBytes() < MIN_FREE) throw new Error("DISK_GUARD: free space below 5 GB");
        const file = `${target.label}-${viewport.name}`;
        const png = path.join(dir, `${file}.png`);
        const fold = path.join(dir, `${file}-fold.png`);
        if (existsSync(png) || existsSync(fold)) throw new Error(`REFUSING_TO_OVERWRITE ${file}`);
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
        // tsx injects a __name helper into serialized functions. The page needs a stub for it.
        await context.addInitScript("window.__name = (fn) => fn;");
        const page = await context.newPage();
        const response = await page.goto(`${BASE}${target.route}`, { waitUntil: "networkidle", timeout: 90000 });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(400);
        const status = response?.status() ?? 0;
        // A dev-server error overlay is not evidence. Refuse to record it.
        const broken = await page.evaluate(() => {
          const overlay = document.querySelector("nextjs-portal");
          const text = `${document.body?.innerText ?? ""} ${overlay?.shadowRoot?.textContent ?? ""}`;
          return /Build Error|Module not found|Unhandled Runtime Error/i.test(text);
        });
        if (broken || status !== 200) throw new Error(`INVALID_CAPTURE ${file} status=${status} buildError=${broken}`);
        const measured = status === 200 ? await probe(page) : null;
        await page.screenshot({ path: fold, fullPage: false });
        await page.screenshot({ path: png, fullPage: true });
        results.push({ label: target.label, route: target.route, note: target.note, viewport: viewport.name, status, ...(measured ?? {}) });
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  const out = path.join(dir, `probe${only.length > 0 ? `-${only.join("+")}` : ""}.json`);
  if (existsSync(out)) throw new Error(`REFUSING_TO_OVERWRITE ${out}`);
  writeFileSync(out, JSON.stringify({ phase, capturedAt: new Date().toISOString(), browser: "msedge (installed)", lighthouse: "NOT_RUN", diskFreeBytes: freeBytes(), results }, null, 2), "utf8");
  console.log(`CAPTURE_DONE ${phase} files=${results.length * 2} free=${freeBytes()}`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
