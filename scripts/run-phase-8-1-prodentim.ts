// npx tsx scripts/run-phase-8-1-prodentim.ts
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
import { evaluateProductAsset, inspectStoredProductFile } from "../src/lib/assets/status.ts";
import { rediscoverCampaignProductAsset } from "../src/lib/assets/attach.ts";
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

function findingsBy(report: { deterministicFindings?: Array<{ category: string; description: string; actionCode: string; severity: string }>; visualFindings?: Array<{ category: string; description: string; actionCode: string; severity: string }>; highPriority?: Array<{ actionCode: string }> } | null, category: string) {
  const all = [...(report?.deterministicFindings ?? []), ...(report?.visualFindings ?? [])];
  return all.filter((item) => item.category === category || item.actionCode.includes(category));
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
  const qaBeforeStored = getLatestVisualQaReport(campaign.id);
  const pub = await fetchPage(`/p/${SLUG}`);
  const page = parsePresellPage(campaign.pageComposition);
  const storedEval = evaluateProductAsset({ page, campaign });
  const storedDims = inspectStoredProductFile(campaign.productImageSrc || page?.hero.image.src || null);
  const productAssetStatusBefore = storedEval.status;
  const existingPlan = parseDesignPlan(campaign.designPlanJson);

  const artifactDir = path.join(process.cwd(), "data", "visual-qa-tmp", "phase8-1-prodentim");
  const phase8Dir = path.join(process.cwd(), "data", "visual-qa-tmp", "phase8-prodentim");
  fs.mkdirSync(artifactDir, { recursive: true });

  const rediscovered = await rediscoverCampaignProductAsset(campaign);
  const acquisition = rediscovered.acquisition;
  const selected = acquisition.selected;

  await applyDesignToCampaign(SLUG, { theme: "PREMIUM" });
  const result = await runVisualOptimization(SLUG, { theme: "PREMIUM", maxIterations: 2 });
  const after = getCampaignBySlug(SLUG);
  const afterPage = parsePresellPage(after?.pageComposition);
  const afterEval = evaluateProductAsset({ page: afterPage, campaign: after });
  const afterPlan = parseDesignPlan(after?.designPlanJson);

  const afterCapture = await inspectRenderedPresell({ slug: SLUG, baseUrl: visualQaBaseUrl() });
  const desktopAfter = afterCapture.captures.find((c) => c.viewport.width === 1440);
  const mobileAfter = afterCapture.captures.find((c) => c.viewport.width === 390);
  const packshotDesktop = copyShot(desktopAfter?.screenshotFiles || [], path.join(artifactDir, "PACKSHOT_DESKTOP.jpg"));
  const packshotMobile = copyShot(mobileAfter?.screenshotFiles || [], path.join(artifactDir, "PACKSHOT_MOBILE.jpg"));
  const compareDesktop = await compareImages(
    path.join(artifactDir, "AFTER_DESKTOP.jpg"),
    packshotDesktop || "",
    path.join(artifactDir, "COMPARE_PACKSHOT_DESKTOP.jpg"),
    ["EMPTY ASSET (Phase 8.1)", "PACKSHOT (acquisition patch)"],
  );
  const compareMobile = await compareImages(
    path.join(artifactDir, "AFTER_MOBILE.jpg"),
    packshotMobile || "",
    path.join(artifactDir, "COMPARE_PACKSHOT_MOBILE.jpg"),
    ["EMPTY ASSET (Phase 8.1)", "PACKSHOT (acquisition patch)"],
  );

  const visitsAfter = count("SELECT COUNT(*) AS n FROM presell_visits WHERE campaignId = ?", campaign.id);
  const clicksAfter = count("SELECT COUNT(*) AS n FROM cta_clicks WHERE campaignId = ?", campaign.id);
  const gateAfter = snapshotContentGate(after!);
  if (after?.publicationStatus !== "draft") throw new Error("published during design");
  if (gateAfter !== gateBefore) throw new Error(`content gate changed ${gateBefore} -> ${gateAfter}`);
  if (visitsAfter !== visitsBefore || clicksAfter !== clicksBefore) throw new Error("analytics contamination");
  if (pub.status !== 404) throw new Error(`public URL ${pub.status}`);
  if (!fs.existsSync(path.join(phase8Dir, "AFTER_DESKTOP.jpg"))) throw new Error("Phase 8 baseline missing");
  if (!fs.existsSync(path.join(artifactDir, "AFTER_DESKTOP.jpg"))) throw new Error("Phase 8.1 empty-asset render missing");

  const report = {
    slug: SLUG,
    candidatesDiscovered: acquisition.discovered.length,
    candidatesDownloaded: acquisition.downloaded,
    candidatesWithRealDimensions: acquisition.withRealDimensions,
    packshotCandidates: acquisition.packshotCandidates.map((item) => ({
      url: item.url,
      width: item.decodedWidth,
      height: item.decodedHeight,
      score: item.probedScore,
      role: item.role,
    })),
    lifestyleCandidates: acquisition.lifestyleCandidates.map((item) => ({
      url: item.url,
      width: item.decodedWidth,
      height: item.decodedHeight,
      score: item.probedScore,
      role: item.role,
    })),
    rejectedCandidates: acquisition.rejected.length,
    selected: selected
      ? {
          url: selected.url,
          filename: selected.filename,
          dimensions: `${selected.width}x${selected.height}`,
          role: selected.role,
          provenance: selected.provenance,
          classificationMethod: selected.classificationMethod,
          localPath: selected.localPath,
        }
      : null,
    storedBefore: storedEval,
    storedDims,
    afterEval,
    productAssetStatusBefore,
    productAssetStatusAfter: afterEval.status,
    designPlanRebuilt: Boolean(afterPlan),
    heroVariantBefore: existingPlan?.heroVariant ?? null,
    heroVariantAfter: afterPlan?.heroVariant ?? result.plan.heroVariant,
    contentGateBefore: gateBefore,
    contentGateAfter: gateAfter,
    visualBefore: qaBeforeStored?.status ?? null,
    visualAfter: result.after?.status ?? null,
    highBefore: qaBeforeStored?.highPriority.length ?? result.before?.highPriority.length ?? null,
    highAfter: result.after?.highPriority.length ?? null,
    warningsBefore: (qaBeforeStored?.deterministicFindings ?? []).filter((f) => f.severity === "WARNING").length,
    warningsAfter: (result.after?.deterministicFindings ?? []).filter((f) => f.severity === "WARNING").length,
    actionsBefore: [...new Set((qaBeforeStored?.highPriority ?? []).map((f) => f.actionCode))],
    actionsAfter: [...new Set((result.after?.highPriority ?? []).map((f) => f.actionCode))],
    heroBefore: findingsBy(qaBeforeStored, "hero").map((f) => f.actionCode),
    heroAfter: findingsBy(result.after, "hero").map((f) => f.actionCode),
    productBefore: findingsBy(qaBeforeStored, "ACQUIRE_PRODUCT_IMAGE").concat(findingsBy(qaBeforeStored, "PROMOTE_PRODUCT_VISUAL")).map((f) => f.actionCode),
    productAfter: findingsBy(result.after, "ACQUIRE_PRODUCT_IMAGE").concat(findingsBy(result.after, "PROMOTE_PRODUCT_VISUAL")).map((f) => f.actionCode),
    packshotDesktop,
    packshotMobile,
    compareDesktop,
    compareMobile,
    plan: result.plan,
    earlyStop: result.earlyStop,
    publicationStatus: after?.publicationStatus,
    publicStatus: pub.status,
    analyticsDelta: { visits: visitsAfter - visitsBefore, clicks: clicksAfter - clicksBefore },
  };
  fs.writeFileSync(path.join(artifactDir, "PACKSHOT_REPORT.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
