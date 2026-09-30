import { chromium, type Page } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const URL = process.env.GEOMETRY_URL ?? "http://localhost:3000/admin/preview/joint-genesis-controlled-ready-13";
const OUT = path.join(process.cwd(), "data", "production-readiness", "premium-final-candidate-v2");

const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1440", width: 1440, height: 900 },
] as const;

type Measure = {
  name: string;
  width: number;
  height: number;
  mode: string;
  horizontalOverflow: boolean;
  documentScrollWidth: number;
  nestedScroll: string[];
  collapsed: string[];
  pathological: string[];
  clipped: string[];
  offscreen: string[];
  featureWidths: number[];
  heroTitleWidth: number;
};

async function measure(page: Page, name: string, width: number, height: number, mode: string): Promise<Measure> {
  return page.evaluate(
    ({ name, width, height, mode }) => {
      const root = document.querySelector("[data-presell-presentation]") as HTMLElement | null;
      const scope = root ?? document.body;
      const doc = document.documentElement;
      const nestedScroll: string[] = [];
      const collapsed: string[] = [];
      const pathological: string[] = [];
      const clipped: string[] = [];
      const offscreen: string[] = [];
      const selectors = [
        "h1",
        ".ps-hero-summary",
        ".ps-feature-copy",
        ".ps-guarantee-copy",
        ".ps-usage-card .ps-body-lg",
        "summary",
        ".ps-faq-band details p",
        "a[data-cta-position]",
        "footer",
      ];
      for (const el of scope.querySelectorAll<HTMLElement>("*")) {
        const style = getComputedStyle(el);
        const oy = style.overflowY;
        const ox = style.overflowX;
        const scrolls =
          (oy === "auto" || oy === "scroll" || ox === "auto" || ox === "scroll") &&
          (el.scrollHeight > el.clientHeight + 24 || el.scrollWidth > el.clientWidth + 8);
        if (scrolls && el !== doc && el !== document.body) {
          const id = el.className?.toString?.().slice(0, 80) || el.tagName;
          if (!id.includes("ps-sticky")) nestedScroll.push(id);
        }
      }
      for (const sel of selectors) {
        scope.querySelectorAll<HTMLElement>(sel).forEach((el, index) => {
          const rect = el.getBoundingClientRect();
          const text = (el.innerText || "").replace(/\s+/g, " ").trim();
          const label = `${sel}#${index}`;
          if (rect.width > 0 && rect.width < 180 && text.length > 48) collapsed.push(`${label}:${Math.round(rect.width)}px`);
          if (text.length > 80 && rect.width > 0 && rect.width < 320) {
            const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 24;
            const lines = Math.max(1, rect.height / lineHeight);
            const charsPerLine = text.length / lines;
            if (charsPerLine < 26) pathological.push(`${label}:${Math.round(charsPerLine)}cpl/${Math.round(rect.width)}px`);
          }
          const style = getComputedStyle(el);
          if ((style.overflowX === "hidden" || style.overflowY === "hidden") && (el.scrollWidth > el.clientWidth + 4 || el.scrollHeight > el.clientHeight + 4)) {
            clipped.push(label);
          }
          if (rect.width > 8 && (rect.right < -1 || rect.left > width + 1)) offscreen.push(label);
        });
      }
      const features = [...scope.querySelectorAll<HTMLElement>(".ps-feature-module")].map((el) => Math.round(el.getBoundingClientRect().width));
      const title = scope.querySelector("h1");
      return {
        name,
        width,
        height,
        mode,
        horizontalOverflow: doc.scrollWidth > width + 1,
        documentScrollWidth: doc.scrollWidth,
        nestedScroll: nestedScroll.slice(0, 12),
        collapsed: collapsed.slice(0, 12),
        pathological: pathological.slice(0, 12),
        clipped: clipped.slice(0, 12),
        offscreen: offscreen.slice(0, 12),
        featureWidths: features,
        heroTitleWidth: title ? Math.round(title.getBoundingClientRect().width) : 0,
      };
    },
    { name, width, height, mode },
  );
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const shots = process.argv.includes("--shots");
  const results: Measure[] = [];
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(URL, { waitUntil: "networkidle", timeout: 90000 });
    await page.locator("h1", { hasText: "Joint Genesis" }).first().waitFor({ timeout: 30000 });
    results.push(await measure(page, viewport.name, viewport.width, viewport.height, "viewport"));
    if (shots) {
      const root = page.locator("[data-presell-presentation]");
      await root.evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.screenshot({ path: path.join(OUT, `viewport-${viewport.name}.png`) });
      if (viewport.name === "390" || viewport.name === "1440") {
        await root.screenshot({ path: path.join(OUT, `fullpage-${viewport.name}.png`) });
      }
    }
  }
  const mobileButton = page.locator("button", { hasText: "Mobile 390px" });
  if (await mobileButton.count()) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(URL, { waitUntil: "networkidle", timeout: 90000 });
    await mobileButton.click();
    await page.waitForTimeout(300);
    results.push(await measure(page, "390-frame", 1440, 900, "fake-mobile-frame"));
  }
  await browser.close();
  const file = path.join(OUT, shots ? "v2-geometry.json" : "v1-geometry.json");
  writeFileSync(file, JSON.stringify(results, null, 2));
  for (const row of results) {
    const fail =
      row.horizontalOverflow ||
      row.nestedScroll.length ||
      row.collapsed.length ||
      row.pathological.length ||
      row.clipped.length ||
      row.offscreen.length;
    console.log(
      `${row.mode}:${row.name} overflow=${row.horizontalOverflow} nested=${row.nestedScroll.length} collapsed=${row.collapsed.length} wrap=${row.pathological.length} clipped=${row.clipped.length} off=${row.offscreen.length} features=${row.featureWidths.join(",")} title=${row.heroTitleWidth} ${fail ? "FAIL" : "PASS"}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
