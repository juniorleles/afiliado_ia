// npx tsx scripts/run-phase-8-2-final-prodentim.ts
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getCampaignBySlug } from "../src/lib/campaigns.ts";
import { getDb } from "../src/lib/db.ts";
import { analyticsSkipHeaders, ANALYTICS_SKIP_HEADER, ANALYTICS_SKIP_VALUE } from "../src/lib/analytics.ts";
import { snapshotContentGate, visualQaBaseUrl } from "../src/lib/visual-qa/run.ts";
import { inspectRenderedPresell } from "../src/lib/visual-qa/browser.ts";
import { applyDesignToCampaign, runVisualOptimization } from "../src/lib/design/optimize.ts";
import { getLatestVisualQaReport } from "../src/lib/visual-qa/store.ts";
import { parsePresellPage } from "../src/lib/presell-page.ts";
import { parseCreativeCompositionPlan } from "../src/lib/creative/plan.ts";
import { parseDesignPlan } from "../src/lib/design/plan.ts";
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

async function fetchPage(urlPath: string) {
  const res = await fetch(`${visualQaBaseUrl()}${urlPath}`, {
    redirect: "manual",
    headers: analyticsSkipHeaders(),
  });
  return { status: res.status, body: await res.text() };
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

function lighthouseScores(jsonPath: string) {
  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as {
    categories?: Record<string, { score?: number | null }>;
    audits?: Record<string, { numericValue?: number; displayValue?: string }>;
  };
  const cat = (id: string) => Math.round((raw.categories?.[id]?.score || 0) * 100);
  const num = (id: string) => raw.audits?.[id]?.numericValue ?? null;
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
  };
}

function runLighthouse(url: string, formFactor: "mobile" | "desktop", outPath: string) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const chromePath = chromium.executablePath();
  const headersPath = path.join(path.dirname(outPath), "lh-headers.json");
  fs.writeFileSync(headersPath, JSON.stringify({ [ANALYTICS_SKIP_HEADER]: ANALYTICS_SKIP_VALUE }));
  const args = [
    "--yes",
    "lighthouse@12.8.2",
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
  const result = spawnSync("npx", args, { stdio: "pipe", encoding: "utf8", windowsHide: true });
  if (result.status !== 0 || !fs.existsSync(outPath)) {
    return { ok: false as const, error: `${result.stderr || ""}\n${result.stdout || ""}`.trim().slice(0, 1500) };
  }
  return { ok: true as const, scores: lighthouseScores(outPath) };
}

async function measureTransfer(url: string) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const buckets = { total: 0, image: 0, script: 0, stylesheet: 0, font: 0 };
  page.on("response", async (response) => {
    try {
      const type = response.request().resourceType();
      const headers = response.headers();
      const length = Number(headers["content-length"] || 0);
      const size = length || (await response.body().catch(() => Buffer.alloc(0))).length;
      buckets.total += size;
      if (type === "image") buckets.image += size;
      if (type === "script") buckets.script += size;
      if (type === "stylesheet") buckets.stylesheet += size;
      if (type === "font") buckets.font += size;
    } catch {
      // ignore failed bodies
    }
  });
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  const jsFiles = await page.evaluate(() => [...document.querySelectorAll("script[src]")].map((el) => (el as HTMLScriptElement).src));
  await browser.close();
  return { ...buckets, thirdPartyScripts: jsFiles.filter((src) => /^https?:/.test(src) && !src.includes("localhost")).length };
}

async function main() {
  const campaign = getCampaignBySlug(SLUG);
  if (!campaign) throw new Error(`Missing ${SLUG}`);
  const gateBefore = snapshotContentGate(campaign);
  const visitsBefore = count("SELECT COUNT(*) AS n FROM presell_visits WHERE campaignId = ?", campaign.id);
  const clicksBefore = count("SELECT COUNT(*) AS n FROM cta_clicks WHERE campaignId = ?", campaign.id);
  const qaBefore = getLatestVisualQaReport(campaign.id);
  const pub = await fetchPage(`/p/${SLUG}`);
  const admin = await fetchPage(`/admin/preview/${SLUG}`);

  const baselineDir = path.join(process.cwd(), "data", "visual-qa-tmp", "phase8-2-prodentim");
  const artifactDir = path.join(process.cwd(), "data", "visual-qa-tmp", "phase8-2-final-prodentim");
  fs.mkdirSync(artifactDir, { recursive: true });
  if (!fs.existsSync(path.join(baselineDir, "AFTER_DESKTOP.jpg"))) throw new Error("Phase 8.2 AFTER baseline missing");
  if (!fs.existsSync(path.join(process.cwd(), "data", "visual-qa-tmp", "phase8-1-prodentim", "PACKSHOT_DESKTOP.jpg"))) {
    throw new Error("Phase 8.1 packshot baseline missing");
  }

  const beforeCapture = await inspectRenderedPresell({ slug: SLUG, baseUrl: visualQaBaseUrl() });
  const desktopBefore = beforeCapture.captures.find((c) => c.viewport.width === 1440);
  const mobileBefore = beforeCapture.captures.find((c) => c.viewport.width === 390);

  await applyDesignToCampaign(SLUG, { theme: "PREMIUM" });
  const result = await runVisualOptimization(SLUG, { theme: "PREMIUM", maxIterations: 2 });
  const after = getCampaignBySlug(SLUG);
  const creative = parseCreativeCompositionPlan(after?.creativeCompositionJson);
  const afterPlan = parseDesignPlan(after?.designPlanJson);
  const page = parsePresellPage(after?.pageComposition);

  const afterCapture = await inspectRenderedPresell({ slug: SLUG, baseUrl: visualQaBaseUrl() });
  const desktopAfter = afterCapture.captures.find((c) => c.viewport.width === 1440);
  const mobileAfter = afterCapture.captures.find((c) => c.viewport.width === 390);
  const afterDesktop = copyShot(desktopAfter?.screenshotFiles || [], path.join(artifactDir, "AFTER_DESKTOP.jpg"));
  const afterMobile = copyShot(mobileAfter?.screenshotFiles || [], path.join(artifactDir, "AFTER_MOBILE.jpg"));
  const compareDesktop = await compareImages(
    path.join(baselineDir, "AFTER_DESKTOP.jpg"),
    afterDesktop || "",
    path.join(artifactDir, "COMPARE_DESKTOP.jpg"),
    ["PHASE 8.2", "PHASE 8.2 FINAL"],
  );
  const compareMobile = await compareImages(
    path.join(baselineDir, "AFTER_MOBILE.jpg"),
    afterMobile || "",
    path.join(artifactDir, "COMPARE_MOBILE.jpg"),
    ["PHASE 8.2", "PHASE 8.2 FINAL"],
  );

  const frameUrl = `${visualQaBaseUrl()}/visual-frame/${SLUG}`;
  const transfer = await measureTransfer(frameUrl);
  const lighthouseDesktop = runLighthouse(frameUrl, "desktop", path.join(artifactDir, "lighthouse-desktop.json"));
  const lighthouseMobile = runLighthouse(frameUrl, "mobile", path.join(artifactDir, "lighthouse-mobile.json"));

  const visitsAfter = count("SELECT COUNT(*) AS n FROM presell_visits WHERE campaignId = ?", campaign.id);
  const clicksAfter = count("SELECT COUNT(*) AS n FROM cta_clicks WHERE campaignId = ?", campaign.id);
  const gateAfter = snapshotContentGate(after!);
  if (after?.publicationStatus !== "draft") throw new Error("published during creative composition");
  if (gateAfter !== gateBefore) throw new Error(`content gate changed ${gateBefore} -> ${gateAfter}`);
  if (visitsAfter !== visitsBefore || clicksAfter !== clicksBefore) throw new Error("analytics contamination");
  if (pub.status !== 404) throw new Error(`public URL ${pub.status}`);
  if (page && after) {
    if (after.headline !== campaign.headline || after.body !== campaign.body || after.ctaLabel !== campaign.ctaLabel) {
      throw new Error("factual copy mutated");
    }
  }

  const report = {
    slug: SLUG,
    contentGateBefore: gateBefore,
    contentGateAfter: gateAfter,
    visualBefore: qaBefore?.status ?? result.before?.status ?? null,
    visualAfter: result.after?.status ?? null,
    highBefore: qaBefore?.highPriority.length ?? result.before?.highPriority.length ?? 1,
    highAfter: result.after?.highPriority.length ?? null,
    actionsBefore: [...new Set((qaBefore?.highPriority ?? []).map((f) => f.actionCode))],
    actionsAfter: [...new Set((result.after?.highPriority ?? []).map((f) => f.actionCode))],
    heroVariant: afterPlan?.heroVariant ?? null,
    creativeVersion: creative?.version ?? null,
    scenes: creative?.scenes.map((s) => ({
      id: s.id,
      kind: s.kind,
      role: s.narrativeRole,
      weight: s.weight,
      asset: s.assetUse,
      desktop: s.desktopComposition,
      mobile: s.mobileComposition,
      geometry: s.geometry,
      whitespace: s.whitespace,
      visualMoment: s.visualMoment,
      sections: s.sectionIds,
    })) ?? [],
    narrative: creative?.narrative ?? [],
    sticky: creative?.stickyCta ?? null,
    heightDesktopBefore: desktopBefore?.snapshot.pageHeight ?? null,
    heightDesktopAfter: desktopAfter?.snapshot.pageHeight ?? null,
    heightMobileBefore: mobileBefore?.snapshot.pageHeight ?? null,
    heightMobileAfter: mobileAfter?.snapshot.pageHeight ?? null,
    afterDesktop,
    afterMobile,
    compareDesktop,
    compareMobile,
    earlyStop: result.earlyStop,
    publicationStatus: after?.publicationStatus,
    publicStatus: pub.status,
    adminStatus: admin.status,
    analyticsDelta: { visits: visitsAfter - visitsBefore, clicks: clicksAfter - clicksBefore },
    transfer,
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
