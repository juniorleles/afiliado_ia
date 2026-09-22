// npx tsx scripts/run-design-optimize-prodentim.ts
import fs from "node:fs";
import path from "node:path";
import { getCampaignBySlug } from "../src/lib/campaigns.ts";
import { getDb } from "../src/lib/db.ts";
import { analyticsSkipHeaders } from "../src/lib/analytics.ts";
import { snapshotContentGate, visualQaBaseUrl } from "../src/lib/visual-qa/run.ts";
import { inspectRenderedPresell } from "../src/lib/visual-qa/browser.ts";
import { runVisualOptimization } from "../src/lib/design/optimize.ts";
import { getLatestVisualQaReport } from "../src/lib/visual-qa/store.ts";

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

function codes(report: { recommendedFixes?: Array<{ actionCode: string }>; highPriority?: Array<{ actionCode: string }> } | null) {
  return new Set([
    ...(report?.recommendedFixes?.map((f) => f.actionCode) ?? []),
    ...(report?.highPriority?.map((f) => f.actionCode) ?? []),
  ]);
}

async function fetchPage(urlPath: string) {
  const res = await fetch(`${visualQaBaseUrl()}${urlPath}`, {
    redirect: "manual",
    headers: analyticsSkipHeaders(),
  });
  return { status: res.status, body: await res.text() };
}

async function main() {
  const campaign = getCampaignBySlug(SLUG);
  if (!campaign) throw new Error(`Missing ${SLUG}`);
  const gateBefore = snapshotContentGate(campaign);
  const visitsBefore = count("SELECT COUNT(*) AS n FROM presell_visits WHERE campaignId = ?", campaign.id);
  const clicksBefore = count("SELECT COUNT(*) AS n FROM cta_clicks WHERE campaignId = ?", campaign.id);
  const qaBefore = getLatestVisualQaReport(campaign.id);
  const pub = await fetchPage(`/p/${SLUG}`);

  const beforeCapture = await inspectRenderedPresell({ slug: SLUG, baseUrl: visualQaBaseUrl() });
  const desktopBefore = beforeCapture.captures.find((c) => c.viewport.width === 1440);
  const mobileBefore = beforeCapture.captures.find((c) => c.viewport.width === 390);
  const artifactDir = path.join(process.cwd(), "data", "visual-qa-tmp", "phase8-prodentim");
  const beforeDesktop = copyShot(desktopBefore?.screenshotFiles || [], path.join(artifactDir, "BEFORE_DESKTOP.jpg"));
  const beforeMobile = copyShot(mobileBefore?.screenshotFiles || [], path.join(artifactDir, "BEFORE_MOBILE.jpg"));

  const result = await runVisualOptimization(SLUG, { theme: "PREMIUM", maxIterations: 2 });
  const after = getCampaignBySlug(SLUG);
  const afterCapture = await inspectRenderedPresell({ slug: SLUG, baseUrl: visualQaBaseUrl() });
  const desktopAfter = afterCapture.captures.find((c) => c.viewport.width === 1440);
  const mobileAfter = afterCapture.captures.find((c) => c.viewport.width === 390);
  const afterDesktop = copyShot(desktopAfter?.screenshotFiles || [], path.join(artifactDir, "AFTER_DESKTOP.jpg"));
  const afterMobile = copyShot(mobileAfter?.screenshotFiles || [], path.join(artifactDir, "AFTER_MOBILE.jpg"));

  const visitsAfter = count("SELECT COUNT(*) AS n FROM presell_visits WHERE campaignId = ?", campaign.id);
  const clicksAfter = count("SELECT COUNT(*) AS n FROM cta_clicks WHERE campaignId = ?", campaign.id);
  const gateAfter = snapshotContentGate(after!);

  if (after?.publicationStatus !== "draft") throw new Error("published during design");
  if (gateAfter !== gateBefore) throw new Error(`content gate changed ${gateBefore} -> ${gateAfter}`);
  if (visitsAfter !== visitsBefore || clicksAfter !== clicksBefore) throw new Error("analytics contamination");
  if (pub.status !== 404) throw new Error(`public URL ${pub.status}`);

  const beforeHigh = result.before?.highPriority.length ?? qaBefore?.highPriority.length ?? 0;
  const afterHigh = result.after?.highPriority.length ?? 0;
  const beforeWarn = (result.before?.deterministicFindings ?? []).filter((f) => f.severity === "WARNING").length;
  const afterWarn = (result.after?.deterministicFindings ?? []).filter((f) => f.severity === "WARNING").length;

  console.log(
    JSON.stringify(
      {
        slug: SLUG,
        publicationStatus: after?.publicationStatus,
        contentGateBefore: gateBefore,
        contentGateAfter: gateAfter,
        visualGateBefore: result.before?.status ?? qaBefore?.status,
        visualGateAfter: result.after?.status,
        iterations: result.iterations,
        earlyStop: result.earlyStop,
        aiUsedForPlanning: result.aiUsedForPlanning,
        theme: result.plan.visualTheme,
        heroVariant: result.plan.heroVariant,
        productVisualStrategy: result.plan.productVisualStrategy,
        highBefore: beforeHigh,
        highAfter: afterHigh,
        warningsBefore: beforeWarn,
        warningsAfter: afterWarn,
        actionsBefore: [...codes(result.before)],
        actionsAfter: [...codes(result.after)],
        pageHeightDesktopBefore: desktopBefore?.snapshot.pageHeight,
        pageHeightDesktopAfter: desktopAfter?.snapshot.pageHeight,
        pageHeightMobileBefore: mobileBefore?.snapshot.pageHeight,
        pageHeightMobileAfter: mobileAfter?.snapshot.pageHeight,
        cardsDesktopBefore: desktopBefore?.snapshot.cards.count,
        cardsDesktopAfter: desktopAfter?.snapshot.cards.count,
        beforeDesktop,
        afterDesktop,
        beforeMobile,
        afterMobile,
        visitsBefore,
        visitsAfter,
        publicStatus: pub.status,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
