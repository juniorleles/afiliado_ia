// npx tsx scripts/run-phase-8-2-acceptance-prodentim.ts
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getCampaignBySlug } from "../src/lib/campaigns.ts";
import { getDb } from "../src/lib/db.ts";
import { analyticsSkipHeaders, ANALYTICS_SKIP_HEADER, ANALYTICS_SKIP_VALUE } from "../src/lib/analytics.ts";
import { snapshotContentGate, visualQaBaseUrl, runVisualQaForSlug } from "../src/lib/visual-qa/run.ts";
import { inspectRenderedPresell } from "../src/lib/visual-qa/browser.ts";
import { parseCreativeCompositionPlan } from "../src/lib/creative/plan.ts";
import { chromium } from "playwright";

const SLUG = "prodentim-page-builder-v2";

function count(sql: string, id: number): number {
  const row = getDb().prepare(sql).get(id) as { n: number };
  return row.n;
}

function copyShot(files: string[], dest: string) {
  const jpg = files.find((file) => file.endsWith(".jpg") || file.endsWith(".png"));
  if (!jpg || !fs.existsSync(jpg)) return null;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(jpg, dest);
  return dest;
}

async function compareImages(beforePath: string, afterPath: string, dest: string, labels: [string, string]) {
  if (!fs.existsSync(beforePath) || !fs.existsSync(afterPath)) return null;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const a = fs.readFileSync(beforePath).toString("base64");
  const b = fs.readFileSync(afterPath).toString("base64");
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#111;display:flex;gap:8px;padding:8px">
    <div><p style="color:#fff;font:12px sans-serif">${labels[0]}</p><img src="data:image/jpeg;base64,${a}" style="max-height:820px;width:auto"></div>
    <div><p style="color:#fff;font:12px sans-serif">${labels[1]}</p><img src="data:image/jpeg;base64,${b}" style="max-height:820px;width:auto"></div>
  </body></html>`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await page.screenshot({ path: dest, type: "jpeg", quality: 72 });
  await browser.close();
  return dest;
}

function lighthouseReport(jsonPath: string) {
  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as {
    categories?: Record<string, { score?: number | null }>;
    audits?: Record<string, { numericValue?: number; details?: { items?: Array<Record<string, unknown>> } }>;
  };
  const cat = (id: string) => Math.round((raw.categories?.[id]?.score || 0) * 100);
  const num = (id: string) => raw.audits?.[id]?.numericValue ?? null;
  const lcpList = raw.audits?.["largest-contentful-paint-element"]?.details?.items as
    | Array<{ items?: Array<Record<string, unknown>>; node?: { nodeLabel?: string; snippet?: string } }>
    | undefined;
  const lcpNode = (lcpList?.[0]?.items?.[0] as { node?: { nodeLabel?: string; snippet?: string } } | undefined)?.node;
  const phases = (lcpList?.[1]?.items || []) as Array<{ phase?: string; timing?: number }>;
  const phaseMs = (name: string) => phases.find((item) => item.phase === name)?.timing ?? null;
  const resources = (raw.audits?.["resource-summary"]?.details?.items || []) as Array<{
    resourceType?: string;
    transferSize?: number;
  }>;
  const byType = (type: string) => resources.find((item) => item.resourceType === type)?.transferSize ?? 0;
  return {
    performance: cat("performance"),
    accessibility: cat("accessibility"),
    bestPractices: cat("best-practices"),
    seo: cat("seo"),
    lcp: num("largest-contentful-paint"),
    cls: num("cumulative-layout-shift"),
    fcp: num("first-contentful-paint"),
    tbt: num("total-blocking-time"),
    totalByteWeight: num("total-byte-weight"),
    lcpElement: lcpNode?.nodeLabel || lcpNode?.snippet || null,
    lcpTtfb: phaseMs("TTFB"),
    lcpLoadDelay: phaseMs("Load Delay"),
    lcpLoadTime: phaseMs("Load Time"),
    lcpRenderDelay: phaseMs("Render Delay"),
    transfer: {
      total: byType("total"),
      script: byType("script"),
      image: byType("image"),
      stylesheet: byType("stylesheet"),
      font: byType("font"),
      thirdParty: byType("third-party"),
    },
  };
}

function runLighthouse(url: string, formFactor: "mobile" | "desktop", outPath: string) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const chromePath = chromium.executablePath();
  const headersPath = path.join(path.dirname(outPath), "lh-headers.json");
  fs.writeFileSync(headersPath, JSON.stringify({ [ANALYTICS_SKIP_HEADER]: ANALYTICS_SKIP_VALUE }));
  const args = [
    "--yes",
    "lighthouse",
    url,
    "--quiet",
    "--only-categories=performance,accessibility,best-practices,seo",
    "--output=json",
    `--output-path=${outPath}`,
    `--chrome-path=${chromePath}`,
    `--extra-headers=${headersPath}`,
    formFactor === "desktop" ? "--preset=desktop" : "--form-factor=mobile",
    "--chrome-flags=--headless --no-sandbox --disable-gpu --ignore-certificate-errors",
  ];
  const result = spawnSync("npx", args, { encoding: "utf8", windowsHide: true, shell: true });
  if (result.status !== 0 || !fs.existsSync(outPath)) {
    return { ok: false as const, error: `${result.stderr || ""}\n${result.stdout || ""}`.trim().slice(0, 1500) };
  }
  return { ok: true as const, scores: lighthouseReport(outPath) };
}

async function main() {
  const campaign = getCampaignBySlug(SLUG);
  if (!campaign) throw new Error(`Missing ${SLUG}`);
  const visitsBefore = count("SELECT COUNT(*) AS n FROM presell_visits WHERE campaignId = ?", campaign.id);
  const clicksBefore = count("SELECT COUNT(*) AS n FROM cta_clicks WHERE campaignId = ?", campaign.id);
  const gateBefore = snapshotContentGate(campaign);
  const artifactDir = path.join(process.cwd(), "data", "visual-qa-tmp", "phase8-2-acceptance-prodentim");
  const baselineDir = path.join(process.cwd(), "data", "visual-qa-tmp", "phase8-2-final-prodentim");
  fs.mkdirSync(artifactDir, { recursive: true });
  if (!fs.existsSync(path.join(baselineDir, "AFTER_DESKTOP.jpg"))) throw new Error("Phase 8.2 final baseline missing");

  const afterCapture = await inspectRenderedPresell({ slug: SLUG, baseUrl: visualQaBaseUrl() });
  const desktopAfter = afterCapture.captures.find((c) => c.viewport.width === 1440);
  const mobileAfter = afterCapture.captures.find((c) => c.viewport.width === 390);
  const afterDesktop = copyShot(desktopAfter?.screenshotFiles || [], path.join(artifactDir, "AFTER_DESKTOP.jpg"));
  const afterMobile = copyShot(mobileAfter?.screenshotFiles || [], path.join(artifactDir, "AFTER_MOBILE.jpg"));
  const compareDesktop = await compareImages(
    path.join(baselineDir, "AFTER_DESKTOP.jpg"),
    afterDesktop || "",
    path.join(artifactDir, "COMPARE_DESKTOP.jpg"),
    ["PHASE 8.2 FINAL", "ACCEPTANCE"],
  );
  const compareMobile = await compareImages(
    path.join(baselineDir, "AFTER_MOBILE.jpg"),
    afterMobile || "",
    path.join(artifactDir, "COMPARE_MOBILE.jpg"),
    ["PHASE 8.2 FINAL", "ACCEPTANCE"],
  );

  const qa = await runVisualQaForSlug(SLUG, true);
  const frameUrl = `${visualQaBaseUrl()}/visual-frame/${SLUG}`;
  const lighthouseDesktop = runLighthouse(frameUrl, "desktop", path.join(artifactDir, "lighthouse-desktop.json"));
  const lighthouseMobile = runLighthouse(frameUrl, "mobile", path.join(artifactDir, "lighthouse-mobile.json"));

  const visitsAfter = count("SELECT COUNT(*) AS n FROM presell_visits WHERE campaignId = ?", campaign.id);
  const clicksAfter = count("SELECT COUNT(*) AS n FROM cta_clicks WHERE campaignId = ?", campaign.id);
  const after = getCampaignBySlug(SLUG)!;
  const creative = parseCreativeCompositionPlan(after.creativeCompositionJson);
  const pub = await fetch(`${visualQaBaseUrl()}/p/${SLUG}`, { redirect: "manual", headers: analyticsSkipHeaders() });
  const admin = await fetch(`${visualQaBaseUrl()}/admin/preview/${SLUG}`, { headers: analyticsSkipHeaders() });
  if (after.publicationStatus !== "draft") throw new Error("published");
  if (snapshotContentGate(after) !== gateBefore) throw new Error("content gate changed");
  if (visitsAfter !== visitsBefore || clicksAfter !== clicksBefore) throw new Error("analytics contamination");
  if (pub.status !== 404) throw new Error(`public ${pub.status}`);

  const report = {
    slug: SLUG,
    contentGateBefore: gateBefore,
    contentGateAfter: snapshotContentGate(after),
    visualAfter: qa.status,
    highAfter: qa.highPriority.length,
    actionsAfter: [...new Set(qa.highPriority.map((f) => f.actionCode))],
    highDetail: qa.highPriority.map((f) => ({
      code: f.actionCode,
      source: f.source,
      description: f.description,
      viewport: f.viewport,
    })),
    heightDesktopAfter: desktopAfter?.snapshot.pageHeight ?? null,
    heightMobileAfter: mobileAfter?.snapshot.pageHeight ?? null,
    imageCountDesktop: desktopAfter?.snapshot.images.filter((img) => !img.placeholder && img.naturalWidth > 0).length ?? null,
    imageCountMobile: mobileAfter?.snapshot.images.filter((img) => !img.placeholder && img.naturalWidth > 0).length ?? null,
    afterDesktop,
    afterMobile,
    compareDesktop,
    compareMobile,
    publicationStatus: after.publicationStatus,
    publicStatus: pub.status,
    adminStatus: admin.status,
    analyticsDelta: { visits: visitsAfter - visitsBefore, clicks: clicksAfter - clicksBefore },
    sticky: creative?.stickyCta ?? null,
    lighthouseDesktop: lighthouseDesktop.ok ? lighthouseDesktop.scores : { error: lighthouseDesktop.error },
    lighthouseMobile: lighthouseMobile.ok ? lighthouseMobile.scores : { error: lighthouseMobile.error },
  };
  fs.writeFileSync(path.join(artifactDir, "REPORT.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
