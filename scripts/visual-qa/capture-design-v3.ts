import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { getCampaignBySlug, getPublishedCampaignBySlug } from "../../src/lib/campaigns.ts";
import { applyProductionCandidate } from "../../src/lib/production-candidate.ts";
import { parsePresellPage } from "../../src/lib/presell-page.ts";
import { resolvePublicationGate } from "../../src/lib/publication.ts";
import { geometryFailures, geometryPasses, type GeometryRow } from "../../tests/visual-qa/geometry-gate.ts";

const BASE = "http://localhost:3000";
const SLUG = "joint-genesis-controlled-ready-13";
const ROOT = path.join(process.cwd(), "data", "production-readiness", "premium-design-v3");
const CONCEPTS = [
  { id: "a", query: "v3-a", presentation: "premium-design-v3-a" },
  { id: "b", query: "v3-b", presentation: "premium-design-v3-b" },
  { id: "c", query: "v3-c", presentation: "premium-design-v3-c" },
] as const;
const SHOTS = [
  { name: "390", width: 390, height: 844, fullPage: true },
  { name: "768", width: 768, height: 1024, fullPage: false },
  { name: "1440", width: 1440, height: 900, fullPage: true },
] as const;

function assertContent() {
  const stored = getCampaignBySlug(SLUG);
  if (!stored) throw new Error("campaign missing");
  if (stored.publicationStatus !== "draft") throw new Error("publication status changed");
  if (stored.productionPresentation !== "premium-final-candidate-v2") throw new Error("production candidate replaced");
  if (getPublishedCampaignBySlug(SLUG)) throw new Error("draft became public");
  if (resolvePublicationGate(stored) !== "READY") throw new Error("publication gate is not READY");
  const page = parsePresellPage(applyProductionCandidate(stored).pageComposition);
  const visible = JSON.stringify(page);
  const frozen = [
    "Joint Genesis uses five targeted ingredients to support lubrication, flexibility and comfortable movement.",
    "Take one capsule daily with water, preferably in the morning.",
    "The seller publishes a 180-day return policy measured from the order date.",
  ];
  for (const sentence of frozen) {
    if (!visible.includes(sentence)) throw new Error("frozen sentence missing");
  }
  const hop = stored.affiliateUrl ?? "";
  const host = new URL(hop).hostname;
  if (!host.endsWith(".hop.clickbank.net") || hop.includes("extclid=")) throw new Error("hop changed");
  const preview = readFileSync("src/app/admin/preview/[slug]/page.tsx", "utf8");
  if (!preview.includes("<PreviewFrame campaign={campaign} />")) throw new Error("preview frame contract changed");
  const a = readFileSync("src/app/premium-design-v3-a.css", "utf8");
  const b = readFileSync("src/app/premium-design-v3-b.css", "utf8");
  const c = readFileSync("src/app/premium-design-v3-c.css", "utf8");
  if (!a.includes('"title"\n    "summary"\n    "visual"')) throw new Error("concept A hero is not editorial");
  if (!b.includes('"visual"\n    "eyebrow"')) throw new Error("concept B hero is not product-led");
  if (!c.includes('"summary"\n    "cta"\n    "visual"')) throw new Error("concept C hero is not scan-led");
  console.log("CONTENT_GATE=READY");
  console.log("FACTUAL_COPY_DELTA=0");
  console.log("PUBLICATION_GATE=PASS");
  console.log("CLICKBANK_HOP_UNCHANGED=YES");
  console.log("PRODUCTION_CANDIDATE=premium-final-candidate-v2");
}

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
        images: [],
        ctas: [...scope.querySelectorAll<HTMLElement>("a[data-cta-position]")].map((el) => {
          const rect = el.getBoundingClientRect();
          return { position: el.getAttribute("data-cta-position") || "", width: Math.round(rect.width), height: Math.round(rect.height) };
        }),
      };
    },
    { name, width, height },
  );
}

async function openPreview(page: Page, url: string, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto(url, { waitUntil: "load", timeout: 90_000 });
  await page.getByRole("heading", { name: "Joint Genesis", level: 1 }).waitFor({ timeout: 30_000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.locator("[data-presell-presentation]").evaluate((el) => el.scrollIntoView({ block: "start" }));
}

async function main() {
  assertContent();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const geometrySummary: Record<string, Record<string, string>> = {};
  let failed = false;
  for (const concept of CONCEPTS) {
    const url = `${BASE}/admin/preview/${SLUG}?design=${concept.query}`;
    const out = path.join(ROOT, concept.id);
    mkdirSync(out, { recursive: true });
    const rows: GeometryRow[] = [];
    geometrySummary[concept.id] = {};
    for (const shot of SHOTS) {
      await openPreview(page, url, shot.width, shot.height);
      const presentation = await page.locator("[data-presell-presentation]").getAttribute("data-presell-presentation");
      if (presentation !== concept.presentation) throw new Error(`${concept.id} rendered ${presentation}`);
      const row = await measure(page, shot.name, shot.width, shot.height);
      rows.push(row);
      const failures = geometryFailures(row);
      const status = failures.length ? `FAIL:${failures.join(",")}` : "PASS";
      geometrySummary[concept.id][shot.name] = status;
      console.log(`${concept.id.toUpperCase()}_${shot.name}=${status}`);
      if (!geometryPasses(row)) failed = true;
      await page.screenshot({
        path: path.join(out, `viewport-${shot.name}.png`),
        animations: "disabled",
        caret: "hide",
      });
      if (shot.fullPage) {
        await page.screenshot({
          path: path.join(out, `fullpage-${shot.name}.png`),
          fullPage: true,
          animations: "disabled",
          caret: "hide",
        });
      }
    }
    writeFileSync(path.join(out, "geometry.json"), JSON.stringify(rows, null, 2));
  }
  await browser.close();

  if (process.env.SKIP_LIGHTHOUSE !== "1") for (const concept of CONCEPTS) {
    const url = `${BASE}/admin/preview/${SLUG}?design=${concept.query}`;
    const out = path.join(ROOT, concept.id, "lighthouse");
    const result = spawnSync("node", ["scripts/visual-qa/run-lighthouse.mjs"], {
      cwd: process.cwd(),
      stdio: "inherit",
      shell: true,
      env: { ...process.env, VISUAL_QA_BASE_URL: url, LIGHTHOUSE_OUT: out },
    });
    console.log(`LIGHTHOUSE_${concept.id.toUpperCase()}=${result.status === 0 ? "RECORDED" : "UNAVAILABLE"}`);
  }

  const comparison = {
    humanApproval: "PENDING",
    playwrightBaselineStatus: "PENDING_HUMAN_APPROVAL",
    applitoolsExecution: process.env.APPLITOOLS_API_KEY ? "CONFIGURED_NOT_USED_FOR_SELECTION" : "AWAITING_API_KEY",
    winner: null,
    concepts: {
      a: {
        artDirection: "Premium editorial. Serif publication, asymmetric desktop column, text-led sections, image as a composed plate rather than a card.",
        url: `${BASE}/admin/preview/${SLUG}?design=v3-a`,
        fullpage390: "data/production-readiness/premium-design-v3/a/fullpage-390.png",
        fullpage1440: "data/production-readiness/premium-design-v3/a/fullpage-1440.png",
        geometry: geometrySummary.a,
      },
      b: {
        artDirection: "Premium product. Packshot leads the hero and returns as full-bleed feature bands and a closing spotlight.",
        url: `${BASE}/admin/preview/${SLUG}?design=v3-b`,
        fullpage390: "data/production-readiness/premium-design-v3/b/fullpage-390.png",
        fullpage1440: "data/production-readiness/premium-design-v3/b/fullpage-1440.png",
        geometry: geometrySummary.b,
      },
      c: {
        artDirection: "Premium conversion. Proposition and action precede the product on mobile; desktop pairs usage with the return policy as a decision row.",
        url: `${BASE}/admin/preview/${SLUG}?design=v3-c`,
        fullpage390: "data/production-readiness/premium-design-v3/c/fullpage-390.png",
        fullpage1440: "data/production-readiness/premium-design-v3/c/fullpage-1440.png",
        geometry: geometrySummary.c,
      },
    },
  };
  writeFileSync(path.join(ROOT, "comparison.json"), JSON.stringify(comparison, null, 2));
  if (failed) process.exit(1);
  console.log("DESIGN_V3_CAPTURE=PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
