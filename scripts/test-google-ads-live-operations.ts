/**
 * Live operations center.
 * Uses a temporary database and a fake Google transport. Does not call Google.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { GoogleAuthHttpRequest, GoogleAuthHttpResponse } from "../src/lib/google-ads-live/google-auth-client";

const root = mkdtempSync(path.join(tmpdir(), "gads-ops-"));
process.env.PRESELL_OS_DB = path.join(root, "ops.db");
process.env.ADMIN_SESSION_SECRET = "test-session-secret-value";
process.env.GOOGLE_ADS_CLIENT_ID = "client-ops-example";
process.env.GOOGLE_ADS_CLIENT_SECRET = "secret-ops-example";
delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
process.env.GOOGLE_ADS_REDIRECT_URI = "http://127.0.0.1:3000/configuracoes/integracoes/google-ads/retorno";
process.env.AIA_ENV = "test";

const CUSTOMER = "3333333333";
const CAMPAIGN = `customers/${CUSTOMER}/campaigns/22`;
let mutateCount = 0;
let sawWeek = false;

function assert(condition: unknown, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`OK: ${message}`);
}

function json(body: unknown): GoogleAuthHttpResponse {
  return { httpStatus: 200, bodyText: JSON.stringify(body) };
}

function transport(request: GoogleAuthHttpRequest): Promise<GoogleAuthHttpResponse> {
  if (request.url.startsWith("https://oauth2.googleapis.com/token")) {
    return Promise.resolve(json({ access_token: "access-ops-example", expires_in: 3600, token_type: "Bearer" }));
  }
  if (request.url.endsWith(":mutate")) {
    mutateCount += 1;
    const body = request.body ?? "";
    assert(body.includes('"status":"PAUSED"'), "approved pause stays paused");
    assert(!body.includes('"status":"ENABLED"'), "approved pause does not enable the campaign");
    assert(!body.includes("PERFORMANCE_MAX") && !body.includes("SHOPPING"), "execution stays off performance max and shopping");
    return Promise.resolve(json({ mutateOperationResponses: [{ campaignResult: { resourceName: CAMPAIGN } }] }));
  }
  const query = request.body ?? "";
  if (query.includes("LAST_7_DAYS")) sawWeek = true;
  if (query.includes("metrics.impressions") && query.includes("FROM campaign")) {
    return Promise.resolve(json({
      results: [{
        campaign: { resourceName: CAMPAIGN, id: "22", status: "PAUSED" },
        metrics: { impressions: 0, clicks: 0, ctr: 0, averageCpc: 0, costMicros: 5_000_000, conversions: 0, conversionsValue: 0, averageCpm: 0, searchImpressionShare: 0, searchTopImpressionShare: 0, searchAbsoluteTopImpressionShare: 0 },
      }],
    }));
  }
  if (query.includes("metrics.")) return Promise.resolve(json({ results: [] }));
  if (query.includes("campaign.id")) {
    return Promise.resolve(json({
      results: [{
        campaign: { id: "22", name: "Northwind Notebook", status: "PAUSED", servingStatus: "SERVING", resourceName: CAMPAIGN },
        campaignBudget: { resourceName: `customers/${CUSTOMER}/campaignBudgets/11`, name: "orcamento", amountMicros: "10000000", status: "ENABLED" },
      }],
    }));
  }
  if (query.includes("ad_group_criterion")) {
    return Promise.resolve(json({
      results: [{ adGroupCriterion: { resourceName: `customers/${CUSTOMER}/adGroupCriteria/33~55`, status: "PAUSED", negative: false, keyword: { text: "paper notebook", matchType: "BROAD" } } }],
    }));
  }
  if (query.includes("campaign_asset")) {
    return Promise.resolve(json({ results: [{ campaignAsset: { resourceName: `customers/${CUSTOMER}/campaignAssets/22~66~SITELINK`, status: "PAUSED", fieldType: "SITELINK" }, asset: { resourceName: `customers/${CUSTOMER}/assets/66` } }] }));
  }
  if (query.includes("campaign.status")) return Promise.resolve(json({ results: [{ campaign: { status: "PAUSED" } }] }));
  return Promise.resolve(json({ results: [] }));
}

async function main(): Promise<void> {
  const oauth = await import("../src/lib/integrations/google-ads-oauth/store.ts");
  const pipeline = await import("../src/lib/integrations/google-ads-operations/pipeline.ts");
  const store = await import("../src/lib/integrations/google-ads-operations/store.ts");
  const executor = await import("../src/lib/integrations/google-ads-operations/execute.ts");
  const reports = await import("../src/lib/integrations/google-ads-operations/reports.ts");
  const db = await import("../src/lib/db.ts");
  const before = db.getDb().prepare("SELECT COUNT(*) AS n FROM campaigns").get() as { n: number };
  assert(oauth.saveGoogleAdsClientCredentials("client-ops-example", "secret-ops-example", "test"), "client credentials are stored");
  assert(oauth.saveGoogleAdsRefreshToken("refresh-ops-example"), "refresh token is stored");
  const ran = await pipeline.runLiveOperations({ customerId: CUSTOMER, campaignResourceName: CAMPAIGN, window: "LAST_7_DAYS", transport });
  if (!ran.ok) console.error(ran.issues.join(" "));
  assert(ran.ok, "synchronization, metrics, and recommendations are stored");
  assert(mutateCount === 0, "the pipeline does not execute a change");
  assert(sawWeek, "the metrics collector accepts the seven day window");
  const actions = store.listOperationActions("pending");
  assert(actions.some((item) => item.kind === "PAUSE_CAMPAIGN"), "pause stays pending for approval");
  assert(actions.some((item) => item.reason.length > 0 && item.confidence.length > 0 && item.expectedImpact.length > 0), "each recommendation keeps reason, confidence, and impact");
  const pause = actions.find((item) => item.kind === "PAUSE_CAMPAIGN");
  assert(pause, "a pause action exists");
  if (!pause) return;
  const snapshotBefore = pause.snapshotId ? store.readOperationSnapshotBody(pause.snapshotId) : null;
  const blocked = await executor.executeApprovedAction(pause.id, "operador", transport);
  assert(!blocked.ok && mutateCount === 0, "a pending action is not executed");
  assert(store.decideOperationAction(pause.id, "approved", "operador", null), "the operator approves the pause");
  const executed = await executor.executeApprovedAction(pause.id, "operador", transport);
  if (!executed.ok) console.error(executed.issues.join(" "));
  assert(executed.ok && mutateCount === 1, "the approved pause is executed once");
  const snapshotAfter = pause.snapshotId ? store.readOperationSnapshotBody(pause.snapshotId) : null;
  assert(snapshotBefore !== null && snapshotBefore === snapshotAfter, "the stored snapshot stays immutable");
  assert(store.readOperationAudit(pause.id)?.operator === "operador", "the audit keeps the operator and the resource");
  const again = await executor.executeApprovedAction(pause.id, "operador", transport);
  assert(!again.ok && mutateCount === 1, "an executed action does not run again");
  const view = reports.readOperationsDashboard();
  assert(view.paused >= 1 && view.pending >= 1 && view.executedToday === 1, "the dashboard reads the stored operation");
  assert(reports.executiveCsv().includes("pausadas"), "the executive export is available");
  const after = db.getDb().prepare("SELECT COUNT(*) AS n FROM campaigns").get() as { n: number };
  assert(before.n === after.n, "local campaign rows are unchanged");
  const source = await import("node:fs");
  const pipelineSource = source.readFileSync(path.join(process.cwd(), "src/lib/integrations/google-ads-operations/pipeline.ts"), "utf8");
  assert(pipelineSource.includes("createOptimizationRecommendationEngine") && pipelineSource.includes("createPauseResumeRulesEngine") && pipelineSource.includes("createMetricsCollector") && pipelineSource.includes("createPerformanceAnalyzer") && pipelineSource.includes("createCampaignSynchronizer"), "operations reuse the existing hosts");
  assert(!pipelineSource.includes("OPTIMIZATION_RULES"), "operations do not declare another recommendation table");
  console.log("GOOGLE_ADS_LIVE_OPERATIONS_TEST=PASS");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "live operations test failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    const db = await import("../src/lib/db.ts");
    db.resetDbForTests();
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Windows can keep the temporary database locked after close.
    }
  });
