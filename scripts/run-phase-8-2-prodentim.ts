// npx tsx scripts/run-phase-8-2-prodentim.ts
import fs from "node:fs";
import path from "node:path";
import { getCampaignBySlug } from "../src/lib/campaigns.ts";
import { getDb } from "../src/lib/db.ts";
import { analyticsSkipHeaders } from "../src/lib/analytics.ts";
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

async function main() {
  const campaign = getCampaignBySlug(SLUG);
  if (!campaign) throw new Error(`Missing ${SLUG}`);
  const gateBefore = snapshotContentGate(campaign);
  const visitsBefore = count("SELECT COUNT(*) AS n FROM presell_visits WHERE campaignId = ?", campaign.id);
  const clicksBefore = count("SELECT COUNT(*) AS n FROM cta_clicks WHERE campaignId = ?", campaign.id);
  const qaBefore = getLatestVisualQaReport(campaign.id);
  const pub = await fetchPage(`/p/${SLUG}`);
  const admin = await fetchPage(`/admin/preview/${SLUG}`);

  const baselineDir = path.join(process.cwd(), "data", "visual-qa-tmp", "phase8-1-prodentim");
  const artifactDir = path.join(process.cwd(), "data", "visual-qa-tmp", "phase8-2-prodentim");
  fs.mkdirSync(artifactDir, { recursive: true });
  if (!fs.existsSync(path.join(baselineDir, "PACKSHOT_DESKTOP.jpg"))) throw new Error("Phase 8.1 packshot baseline missing");

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
    path.join(baselineDir, "PACKSHOT_DESKTOP.jpg"),
    afterDesktop || "",
    path.join(artifactDir, "COMPARE_DESKTOP.jpg"),
    ["PHASE 8.1 PACKSHOT", "PHASE 8.2 AFTER"],
  );
  const compareMobile = await compareImages(
    path.join(baselineDir, "PACKSHOT_MOBILE.jpg"),
    afterMobile || "",
    path.join(artifactDir, "COMPARE_MOBILE.jpg"),
    ["PHASE 8.1 PACKSHOT", "PHASE 8.2 AFTER"],
  );

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
    highBefore: qaBefore?.highPriority.length ?? result.before?.highPriority.length ?? 3,
    highAfter: result.after?.highPriority.length ?? null,
    actionsBefore: [...new Set((qaBefore?.highPriority ?? []).map((f) => f.actionCode))],
    actionsAfter: [...new Set((result.after?.highPriority ?? []).map((f) => f.actionCode))],
    heroVariant: afterPlan?.heroVariant ?? null,
    creativeVersion: creative?.version ?? null,
    scenes: creative?.scenes.map((s) => ({ id: s.id, kind: s.kind, role: s.narrativeRole, weight: s.weight, asset: s.assetUse, desktop: s.desktopComposition, mobile: s.mobileComposition, sections: s.sectionIds })) ?? [],
    narrative: creative?.narrative ?? [],
    sticky: creative?.stickyCta ?? null,
    heightDesktopBefore: desktopBefore?.snapshot.pageHeight ?? 4827,
    heightDesktopAfter: desktopAfter?.snapshot.pageHeight ?? null,
    heightMobileBefore: mobileBefore?.snapshot.pageHeight ?? 5385,
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
  };
  fs.writeFileSync(path.join(artifactDir, "REPORT.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
