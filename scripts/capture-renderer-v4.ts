/**
 * Execution 51A. Captures isolated Renderer V4 lab pages.
 * Does not publish, does not touch campaigns, does not start a second next dev.
 * Does not hide functional sticky CTAs.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

const OUT = path.join(process.cwd(), "data", "evidence", "execution-51a-premium-conversion-design", "screenshots");
const WIDTHS = [1440, 768, 390] as const;
const HEIGHT = 1100;
const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const KEYS = ["s1", "s3", "s5", "s6"] as const;

async function liveAvailable(): Promise<boolean> {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 12000);
    const res = await fetch(`${BASE}/admin/lab/renderer-v4/s1`, { signal: ac.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

async function probe(page: Page): Promise<{
  overflow: boolean;
  hops: Array<{ text: string; color: string; background: string; visible: boolean }>;
  images: number;
}> {
  return page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    const hops = [...document.querySelectorAll<HTMLElement>("[data-v4-cta='hero'], [data-v4-cta='offers']")].map((el) => {
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return {
        text: (el.textContent || "").trim(),
        color: style.color,
        background: style.backgroundColor,
        visible: style.display !== "none" && box.width > 1 && box.height > 1 && style.visibility !== "hidden",
      };
    });
    return { overflow, hops, images: document.querySelectorAll("img").length };
  });
}

async function stickyShot(page: Page, dest: string): Promise<{ coversOffer: boolean; text: string }> {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const measured = await page.evaluate(() => {
    const sticky = document.querySelector<HTMLElement>(".ds-sticky-cta");
    if (!sticky) return { present: false, coversOffer: false, text: "" };
    const style = getComputedStyle(sticky);
    const box = sticky.getBoundingClientRect();
    const offer = document.querySelector<HTMLElement>("[data-v4-cta='offers']");
    const offerBox = offer?.getBoundingClientRect();
    const coversOffer = Boolean(
      offerBox &&
        box.top < offerBox.bottom &&
        box.bottom > offerBox.top &&
        style.display !== "none",
    );
    return {
      present: style.display !== "none" && box.height > 1,
      coversOffer,
      text: (sticky.textContent || "").trim(),
    };
  });
  await page.screenshot({ path: dest, type: "jpeg", quality: 60, fullPage: false });
  return { coversOffer: measured.coversOffer, text: measured.text };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const live = await liveAvailable();
  if (!live) throw new Error("live lab route is not available; refusing static mocks for 51A");
  const browser = await chromium.launch({ headless: true, channel: "chrome" }).catch(() => chromium.launch({ headless: true }));
  const shots: Array<{ id: string; width: number; file: string; overflow: boolean; hops: unknown }> = [];
  const sticky: Array<{ id: string; file: string; coversOffer: boolean; text: string }> = [];
  for (const key of KEYS) {
    for (const width of WIDTHS) {
      const page = await browser.newPage({ viewport: { width, height: HEIGHT } });
      await page.goto(`${BASE}/admin/lab/renderer-v4/${key}`, { waitUntil: "domcontentloaded", timeout: 20000 });
      const measured = await probe(page);
      const dest = path.join(OUT, `${key}-${width}.jpg`);
      await page.screenshot({ path: dest, type: "jpeg", quality: 55, fullPage: true });
      shots.push({ id: `${key}-${width}`, width, file: dest, overflow: measured.overflow, hops: measured.hops });
      await page.close();
    }
  }
  for (const key of ["s1", "s3"] as const) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${BASE}/admin/lab/renderer-v4/${key}`, { waitUntil: "domcontentloaded", timeout: 20000 });
    const dest = path.join(OUT, `${key}-390-sticky.jpg`);
    sticky.push({ id: `${key}-390-sticky`, file: dest, ...(await stickyShot(page, dest)) });
    await page.close();
  }
  await browser.close();
  writeFileSync(path.join(OUT, "..", "screenshots.json"), JSON.stringify({ source: "live-lab-route", shots, sticky }, null, 2));
  writeFileSync(path.join(OUT, "..", "responsive-probes.json"), JSON.stringify({
    source: "live-lab-route",
    widths: WIDTHS,
    overflows: shots.filter((shot) => shot.overflow).map((shot) => shot.id),
    probes: shots,
    sticky,
  }, null, 2));
  const index = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>V4 51A comparison</title><style>body{font-family:sans-serif;margin:24px}img{max-width:100%;border:1px solid #ddd}section{margin-bottom:48px}</style></head><body><h1>Renderer V4 — Execution 51A</h1><p>Source: live lab. Visual approval is human. Sticky screenshots keep the mobile CTA visible.</p>${KEYS.map((key) => `<section><h2>${key}</h2>${WIDTHS.map((w) => `<p>${w}px</p><img src="screenshots/${key}-${w}.jpg" alt="${key} ${w}">`).join("")}${key === "s1" || key === "s3" ? `<p>390 sticky viewport</p><img src="screenshots/${key}-390-sticky.jpg" alt="${key} sticky">` : ""}</section>`).join("")}</body></html>`;
  writeFileSync(path.join(OUT, "..", "visual-index.html"), index);
  const overflowIds = shots.filter((shot) => shot.overflow).map((shot) => shot.id);
  if (overflowIds.length) throw new Error("horizontal overflow: " + overflowIds.join(", "));
  const blankHops = shots.flatMap((shot) => (shot.hops as Array<{ text: string; visible: boolean }>).filter((hop) => hop.visible && !hop.text));
  if (blankHops.length) throw new Error("visible hop without text");
  const covering = sticky.filter((item) => item.coversOffer);
  if (covering.length) throw new Error("sticky CTA covers the offer control at the top of the page");
  console.log(`CAPTURE_V4_51A source=live-lab-route shots=${shots.length} sticky=${sticky.length}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
