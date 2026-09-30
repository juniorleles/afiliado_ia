import { chromium, type Page } from "playwright";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  VIEWPORTS,
  KNOWN_BROKEN_V1,
  geometryFailures,
  geometryPasses,
  type GeometryRow,
} from "../../tests/visual-qa/geometry-gate.ts";

const base = (process.env.VISUAL_QA_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const URL = base.includes("/admin/preview/")
  ? base
  : `${base}/admin/preview/joint-genesis-controlled-ready-13`;
const OUT = path.join(process.cwd(), "data", "production-readiness", "visual-qa-tooling-v2", "geometry");

async function measure(page: Page, name: string, width: number, height: number): Promise<GeometryRow> {
  return page.evaluate(
    ({ name, width, height }) => {
      const root = document.querySelector("[data-presell-presentation]") as HTMLElement | null;
      const scope = root ?? document.body;
      const doc = document.documentElement;
      const body = document.body;
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
        if (scrolls && el !== doc && el !== body) {
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
          if (
            (style.overflowX === "hidden" || style.overflowY === "hidden") &&
            (el.scrollWidth > el.clientWidth + 4 || el.scrollHeight > el.clientHeight + 4)
          ) {
            clipped.push(label);
          }
          if (rect.width > 8 && (rect.right < -1 || rect.left > width + 1)) offscreen.push(label);
        });
      }
      const images = [...scope.querySelectorAll("img")].slice(0, 8).map((img) => {
        const rect = img.getBoundingClientRect();
        return {
          src: img.currentSrc || img.src,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        };
      });
      const ctas = [...scope.querySelectorAll<HTMLElement>("a[data-cta-position]")].map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          position: el.getAttribute("data-cta-position") || "",
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      });
      return {
        name,
        width,
        height,
        mode: "viewport",
        horizontalOverflow: doc.scrollWidth > width + 1 || body.scrollWidth > width + 1,
        documentScrollWidth: doc.scrollWidth,
        bodyScrollWidth: body.scrollWidth,
        nestedScroll: nestedScroll.slice(0, 12),
        collapsed: collapsed.slice(0, 12),
        pathological: pathological.slice(0, 12),
        clipped: clipped.slice(0, 12),
        offscreen: offscreen.slice(0, 12),
        featureWidths: [...scope.querySelectorAll<HTMLElement>(".ps-feature-module")].map((el) =>
          Math.round(el.getBoundingClientRect().width),
        ),
        heroTitleWidth: Math.round(scope.querySelector("h1")?.getBoundingClientRect().width ?? 0),
        images,
        ctas,
      };
    },
    { name, width, height },
  );
}

async function main() {
  const rejected = KNOWN_BROKEN_V1.filter((row) => geometryPasses(row));
  if (rejected.length) {
    console.error("KNOWN_BROKEN_V1_REJECTED=NO");
    process.exit(1);
  }
  console.log("KNOWN_BROKEN_V1_REJECTED=YES");
  const v1Path = path.join(process.cwd(), "data", "production-readiness", "premium-final-candidate-v2", "v1-geometry.json");
  if (existsSync(v1Path)) {
    const saved = JSON.parse(readFileSync(v1Path, "utf8")) as GeometryRow[];
    const accepted = saved.filter((row) => geometryPasses(row));
    if (accepted.length) {
      console.error("SAVED_V1_GEOMETRY_ACCEPTED=" + accepted.map((row) => row.name).join(","));
      process.exit(1);
    }
    console.log("SAVED_V1_GEOMETRY_REJECTED=YES");
  }

  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const rows: GeometryRow[] = [];
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(URL, { waitUntil: "load", timeout: 90000 });
    await page.getByRole("heading", { name: "Joint Genesis", level: 1 }).waitFor({ timeout: 30000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const row = await measure(page, viewport.name, viewport.width, viewport.height);
    rows.push(row);
    const failures = geometryFailures(row);
    console.log(`${viewport.name}=${failures.length ? "FAIL:" + failures.join(",") : "PASS"}`);
  }
  await browser.close();
  writeFileSync(path.join(OUT, "v2.json"), JSON.stringify(rows, null, 2));
  if (rows.some((row) => !geometryPasses(row))) process.exit(1);
  console.log("GEOMETRY_QA=PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
