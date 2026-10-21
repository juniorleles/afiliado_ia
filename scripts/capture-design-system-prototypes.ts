/**
 * Execution 50. Captures isolated design-system prototypes.
 * Does not publish, does not touch campaigns, does not start a second next dev.
 * Uses the system Chrome. Falls back to static markup if the live lab route is unavailable.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Page } from "playwright";
import { COMPOSITION_IDS, pickComposition, themeForComposition, type CompositionId } from "../src/lib/design-system/compose.ts";
import { buildLabContract, labScenarioKeys } from "../src/lib/design-system/scenarios.ts";
import { pageDensity, stickyCtaAllowed } from "../src/lib/design-system/layout.ts";
import { designSystemTokenCss } from "../src/lib/design-system/tokens.ts";
import { PrototypePage } from "../src/components/design-system/prototype-page.tsx";

const OUT = process.env.DS_EVIDENCE_DIR
  ? path.resolve(process.env.DS_EVIDENCE_DIR)
  : path.join(process.cwd(), "data", "evidence", "execution-50b-commercial-design", "screenshots");
const SHOTS = OUT;
const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const WIDTHS = [1440, 768, 390] as const;
const HEIGHT = 1100;

type Shot = { id: string; scenario: string; composition: CompositionId; width: number; file: string };

function pagesToCapture(): Array<{ id: string; scenario: string; composition: CompositionId; route: string }> {
  const keys = labScenarioKeys();
  const out: Array<{ id: string; scenario: string; composition: CompositionId; route: string }> = [];
  for (const scenario of keys) {
    const contract = buildLabContract(scenario)!;
    const recommended = pickComposition(contract);
    out.push({ id: `${scenario}-default`, scenario, composition: recommended, route: `/admin/lab/design-system/${scenario}` });
  }
  for (const composition of COMPOSITION_IDS) {
    out.push({
      id: `s1-${composition}`,
      scenario: "s1",
      composition,
      route: `/admin/lab/design-system/s1/${composition}`,
    });
  }
  return out;
}

function staticHtml(scenario: string, composition: CompositionId): string {
  const contract = buildLabContract(scenario)!;
  const theme = themeForComposition(composition);
  const body = renderToStaticMarkup(createElement(PrototypePage, { contract, composition }));
  const css = readFileSync(path.join("src", "app", "design-system-lab.css"), "utf8");
  const density = pageDensity(contract);
  const sticky = stickyCtaAllowed(contract) ? "on" : "off";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prototype ${scenario}</title><style>${designSystemTokenCss()}${css}</style></head><body><div class="ds-root" data-ds-theme="${theme}" data-ds-composition="${composition}" data-ds-density="${density}" data-ds-sticky="${sticky}" data-lab-scenario="${scenario}">${body}</div></body></html>`;
}

type Probe = {
  h1: number;
  imagesWithoutAlt: number;
  overflow: boolean;
  minTarget: number | null;
  landmarks: string[];
  invented: boolean;
};

async function probe(page: Page): Promise<Probe> {
  return page.evaluate(() => {
    const h1 = document.querySelectorAll("h1").length;
    const imagesWithoutAlt = [...document.querySelectorAll("img")].filter((img) => img.getAttribute("alt") === null).length;
    const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    const targets = [...document.querySelectorAll("a.ds-btn, button, [role=button], .ds-btn")]
      .map((el) => {
        const style = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden" || box.width < 1 || box.height < 1) return null;
        return Math.min(box.width, box.height);
      })
      .filter((n): n is number => n !== null);
    const invented = /clinically proven|best greens|doctors worldwide|immune support complex/i.test(document.body.innerText);
    const landmarks = [...document.querySelectorAll("main, footer, nav, [role=main]")].map((el) => el.tagName.toLowerCase());
    return {
      h1,
      imagesWithoutAlt,
      overflow,
      minTarget: targets.length ? Math.min(...targets) : null,
      landmarks,
      invented,
    };
  });
}

async function liveAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/admin/lab/design-system`, { signal: AbortSignal.timeout(4000) });
    const text = await res.text();
    return res.ok && text.includes("data-lab=\"design-system\"");
  } catch {
    return false;
  }
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const useLive = await liveAvailable();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const shots: Shot[] = [];
  const probes: Array<Shot & Probe> = [];
  const pages = pagesToCapture();

  for (const item of pages) {
    for (const width of WIDTHS) {
      const context = await browser.newContext({ viewport: { width, height: HEIGHT }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      if (useLive) {
        await page.goto(`${BASE}${item.route}`, { waitUntil: "networkidle", timeout: 60_000 });
      } else {
        const fixture = pathToFileURL(path.join(process.cwd(), "public", "lab-fixtures")).href + "/";
        const html = staticHtml(item.scenario, item.composition).replaceAll("/lab-fixtures/", fixture);
        await page.setContent(html, { waitUntil: "load" });
      }
      await page.waitForSelector(".ds-root", { timeout: 20_000 });
      await page.addStyleTag({ content: ".ds-labbar,nextjs-portal,[data-next-badge-root]{display:none!important}" });
      const file = `${item.id}-${width}.jpg`;
      await page.screenshot({ path: path.join(SHOTS, file), fullPage: true, type: "jpeg", quality: 62 });
      const measured = await probe(page);
      const shot = { id: item.id, scenario: item.scenario, composition: item.composition, width, file };
      shots.push(shot);
      probes.push({ ...shot, ...measured });
      await context.close();
    }
  }

  await browser.close();

  const report = {
    capturedAt: new Date().toISOString(),
    source: useLive ? "live-lab-route" : "static-markup",
    base: BASE,
    viewports: WIDTHS,
    count: shots.length,
    shots,
    probes,
    a11y: {
      allSingleH1: probes.every((p) => p.h1 === 1),
      allImagesHaveAlt: probes.every((p) => p.imagesWithoutAlt === 0),
      noHorizontalOverflow: probes.every((p) => !p.overflow),
      minTargetAtLeast44: probes.every((p) => p.minTarget === null || p.minTarget >= 44),
      noInventedClaims: probes.every((p) => !p.invented),
    },
  };
  writeFileSync(path.join(path.dirname(OUT), "screenshots.json"), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(path.join(path.dirname(OUT), "responsive-probes.json"), JSON.stringify(probes, null, 2) + "\n");
  console.log(JSON.stringify({ source: report.source, count: report.count, a11y: report.a11y }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
