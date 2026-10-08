/**
 * Live operations pipeline.
 *
 * Calls the existing synchronizer, metrics collector, performance analyzer,
 * recommendation engine, and pause/resume rules. It stores their snapshots
 * and leaves every action pending. It does not send a mutate.
 */
import { GOOGLE_ADS_API_VERSION, createGoogleAuthHttpClient, googleAdsRequestHeaders, googleAdsRoot, isGoogleAuthRecord, parseGoogleAuthJson, type GoogleAuthTransport } from "@/lib/google-ads-live/google-auth-client";
import { createCampaignSynchronizer } from "@/lib/google-ads-live/campaign-synchronizer";
import type { CampaignState } from "@/lib/google-ads-live/campaign-sync-snapshot";
import { exchangeRefreshToken } from "@/lib/google-ads-live/oauth-manager";
import { createMetricsCollector } from "@/lib/optimization-metrics/metrics-collector";
import type { CampaignMetrics } from "@/lib/optimization-metrics/metrics-snapshot";
import { createPerformanceAnalyzer } from "@/lib/performance-analysis/performance-analyzer";
import { createOptimizationRecommendationEngine } from "@/lib/optimization-recommendation/optimization-recommendation-engine";
import type { OptimizationRecommendation } from "@/lib/optimization-recommendation/optimization-snapshot";
import { createPauseResumeRulesEngine } from "@/lib/pause-resume-rules/pause-resume-rules-engine";
import { OPERATIONAL_RULE_IDS, RULE_KIND_BY_ID, type OperationalRuleId } from "@/lib/pause-resume-rules/rule-types";
import type { PendingAction } from "@/lib/pause-resume-rules/rule-snapshot";
import { readGoogleAdsEnvironment } from "@/lib/integrations/google-ads-oauth/environment";
import { readGoogleAdsOAuthSecrets, readGoogleAdsOAuthView } from "@/lib/integrations/google-ads-oauth/store";
import { insertOperationAction, insertOperationEvent, insertOperationSnapshot, readLatestOperationSnapshot } from "./store";

export type OperationWindow = "TODAY" | "YESTERDAY" | "LAST_7_DAYS" | "LAST_30_DAYS" | "CUSTOM";

const LABELS: Record<string, string> = {
  "Increase Budget": "Aumentar orçamento",
  "Reduce Budget": "Diminuir orçamento",
  "Review RSA Headlines": "Alerta de CTR baixo",
  "Review RSA Descriptions": "Substituir RSA",
  "Review Landing Page": "Tendência da landing page",
  "Review Keywords": "Revisar palavra-chave",
  "Review Search Terms": "Revisar termos de pesquisa",
  "Review Audience": "Revisar público",
  "Review Device Targeting": "Desempenho por dispositivo",
  "Monitor Performance": "Acompanhar desempenho",
  "No Action": "Sem ação",
  "Pause Candidate": "Pausar campanha",
  "Resume Candidate": "Retomar campanha",
  "Manual Review Required": "Revisão manual",
  "Rule Conflict": "Conflito de regras",
};

const ACTION_KIND: Record<string, string> = {
  "Increase Budget": "BUDGET_UPDATE",
  "Reduce Budget": "BUDGET_UPDATE",
  "Review RSA Headlines": "RSA_UPDATE",
  "Review RSA Descriptions": "RSA_UPDATE",
  "Pause Candidate": "PAUSE_CAMPAIGN",
  "Resume Candidate": "RESUME_CAMPAIGN",
};

export function operationLabel(kind: string): string {
  return LABELS[kind] ?? kind;
}

function windowLabels(range: string): { current: string; historical: string } {
  if (range.startsWith("BETWEEN ")) return { current: "CUSTOM_RANGE", historical: "PREVIOUS_CUSTOM_RANGE" };
  return { current: range, historical: `PREVIOUS_${range}` };
}

function nullMeasures(metric: CampaignMetrics): CampaignMetrics {
  return {
    ...metric,
    impressions: null,
    clicks: null,
    ctr: null,
    averageCpc: null,
    costMicros: null,
    conversions: null,
    conversionValue: null,
    averageCpm: null,
    searchImpressionShare: null,
    searchTopImpressionShare: null,
    searchAbsoluteTopImpressionShare: null,
  };
}

function impactOf(recommendation: OptimizationRecommendation): string {
  const row = recommendation.evidence.rows[0];
  if (!row) return recommendation.reason;
  const change = row.change === null ? "sem variação numérica" : `variação ${row.change}`;
  return `${row.direction}. ${change}.`;
}

function operationalRules() {
  const enabled = new Set<OperationalRuleId>(["cost-threshold"]);
  return {
    locked: false,
    excluded: false,
    observedPeriodDays: null,
    policyApprovalStatus: null,
    rules: OPERATIONAL_RULE_IDS.map((id) => {
      const kind = RULE_KIND_BY_ID[id];
      return {
        id,
        kind,
        enabled: enabled.has(id),
        action: "PAUSE" as const,
        threshold: id === "cost-threshold" ? 1 : null,
      };
    }),
  };
}

async function readRows(transport: GoogleAuthTransport | undefined, customerId: string, developerToken: string, accessToken: string, loginCustomerId: string | null, query: string): Promise<Record<string, unknown>[] | null> {
  const client = createGoogleAuthHttpClient(transport);
  const headers = googleAdsRequestHeaders(accessToken, true);
  if (loginCustomerId && /^\d{10}$/.test(loginCustomerId) && loginCustomerId !== customerId) headers["login-customer-id"] = loginCustomerId;
  const response = await client.send({
    url: `${googleAdsRoot(GOOGLE_ADS_API_VERSION)}/customers/${customerId}/googleAds:search`,
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
  });
  const parsed = parseGoogleAuthJson(response.bodyText);
  if (response.httpStatus !== 200 || !isGoogleAuthRecord(parsed) || !Array.isArray(parsed.results)) return null;
  return parsed.results.filter(isGoogleAuthRecord);
}

export async function runLiveOperations(input: {
  customerId: string;
  campaignResourceName: string;
  window: OperationWindow;
  metricStart?: string | null;
  metricEnd?: string | null;
  operator?: string;
  transport?: GoogleAuthTransport;
}): Promise<{ ok: true } | { ok: false; issues: string[] }> {
  if (!/^customers\/\d+\/campaigns\/\d+$/.test(input.campaignResourceName)) {
    return { ok: false, issues: ["A campanha sincronizada não tem um resource name válido."] };
  }
  const operator = input.operator ?? "operador";
  const env = readGoogleAdsEnvironment();
  const secrets = readGoogleAdsOAuthSecrets();
  const clientId = env.clientId || secrets.clientId;
  const clientSecret = env.clientSecret || secrets.clientSecret;
  if (!clientId || !clientSecret || !secrets.refreshToken) {
    return { ok: false, issues: ["A conta do Google Ads ainda não está pronta para sincronizar."] };
  }
  const http = createGoogleAuthHttpClient(input.transport);
  const oauth = await exchangeRefreshToken(http, { clientId, clientSecret, refreshToken: secrets.refreshToken });
  if (!oauth.ok) return { ok: false, issues: ["O Google recusou o refresh token."] };
  const loginCustomerId = readGoogleAdsOAuthView().loginCustomerId;
  const session = {
    sessionId: "ops-session",
    authenticated: true as const,
    tokenType: "Bearer",
    expiresIn: oauth.grant.expiresIn,
    accessToken: oauth.grant.accessToken,
  };
  const metadata = {
    metricWindow: input.window === "CUSTOM" ? "" : input.window,
    metricStart: input.metricStart ?? "",
    metricEnd: input.metricEnd ?? "",
  };
  const synchronizer = createCampaignSynchronizer({ transport: input.transport });
  const synced = await synchronizer.synchronize({
    session,
    customerId: input.customerId,
    developerToken: env.developerToken ?? "",
    campaignResourceNames: [input.campaignResourceName],
    executionMetadata: { source: "operations" },
  });
  if (synced.status !== "OK" || !synced.campaignSnapshot) {
    return { ok: false, issues: ["A sincronização da campanha foi recusada."] };
  }
  const campaign = synced.campaignSnapshot.campaigns[0] as CampaignState | undefined;
  if (!campaign) return { ok: false, issues: ["A sincronização não devolveu a campanha."] };
  const keywordRows = await readRows(
    input.transport,
    input.customerId,
    env.developerToken ?? "",
    oauth.grant.accessToken,
    loginCustomerId,
    `SELECT ad_group_criterion.resource_name, ad_group_criterion.status, ad_group_criterion.negative, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type FROM ad_group_criterion WHERE campaign.resource_name = '${input.campaignResourceName}' AND ad_group_criterion.type = KEYWORD`,
  );
  const assetRows = await readRows(
    input.transport,
    input.customerId,
    env.developerToken ?? "",
    oauth.grant.accessToken,
    loginCustomerId,
    `SELECT campaign_asset.resource_name, campaign_asset.status, campaign_asset.field_type, asset.resource_name FROM campaign_asset WHERE campaign.resource_name = '${input.campaignResourceName}'`,
  );
  if (!keywordRows || !assetRows) return { ok: false, issues: ["A leitura de palavras-chave ou ativos foi recusada."] };
  const prior = readLatestOperationSnapshot("metrics", input.campaignResourceName);
  const collector = createMetricsCollector({ transport: input.transport });
  const collected = await collector.collect({
    session,
    customerId: input.customerId,
    developerToken: env.developerToken ?? "",
    campaignResourceNames: [input.campaignResourceName],
    executionMetadata: metadata,
  });
  if (collected.status !== "OK" || !collected.campaignMetrics?.[0]) {
    return { ok: false, issues: ["A coleta de métricas foi recusada."] };
  }
  const current = collected.campaignMetrics[0];
  const priorCampaign = prior && isGoogleAuthRecord(prior.body) && isGoogleAuthRecord(prior.body.campaign) ? (prior.body.campaign as unknown as CampaignMetrics) : null;
  const range = input.window === "CUSTOM" && input.metricStart && input.metricEnd ? `BETWEEN '${input.metricStart}' AND '${input.metricEnd}'` : input.window === "CUSTOM" ? "LAST_30_DAYS" : input.window;
  const labels = windowLabels(range);
  const analyzer = createPerformanceAnalyzer();
  const analyzed = analyzer.analyze({
    campaignMetrics: current,
    adGroupMetrics: collected.adGroupMetrics ?? [],
    rsaMetrics: collected.rsaMetrics ?? [],
    historicalMetrics: {
      campaignMetrics: priorCampaign ?? nullMeasures(current),
      adGroupMetrics: [],
      rsaMetrics: [],
      budgetAmountMicros: campaign.budgetAmountMicros ? Number(campaign.budgetAmountMicros) : null,
    },
    budgetAmountMicros: campaign.budgetAmountMicros ? Number(campaign.budgetAmountMicros) : null,
    timeWindow: labels,
  });
  if (analyzed.status !== "OK" || !analyzed.report) return { ok: false, issues: ["A análise de desempenho foi recusada."] };
  const recommendations = createOptimizationRecommendationEngine().generate({
    performanceReport: analyzed.report,
    historicalMetrics: {
      campaignMetrics: priorCampaign ?? nullMeasures(current),
      adGroupMetrics: [],
      rsaMetrics: [],
    },
    campaignMetrics: current,
    adGroupMetrics: collected.adGroupMetrics ?? [],
    rsaMetrics: collected.rsaMetrics ?? [],
    budgetAmountMicros: campaign.budgetAmountMicros ? Number(campaign.budgetAmountMicros) : null,
  });
  if (recommendations.status !== "OK" || !recommendations.recommendationSet) {
    return { ok: false, issues: ["O motor de recomendação recusou a leitura."] };
  }
  const rules = createPauseResumeRulesEngine().evaluate({
    recommendationSet: recommendations.recommendationSet,
    performanceReport: analyzed.report,
    campaignMetrics: current,
    operationalRules: operationalRules(),
  });
  if (rules.status !== "OK" || !rules.actionPlan) return { ok: false, issues: ["As regras de pausa e retomada recusaram a leitura."] };
  insertOperationSnapshot({ kind: "sync", customerId: input.customerId, campaignResourceName: input.campaignResourceName, body: synced.snapshot });
  insertOperationSnapshot({
    kind: "resources",
    customerId: input.customerId,
    campaignResourceName: input.campaignResourceName,
    body: { campaign, keywords: keywordRows, assets: assetRows },
  });
  const metricsId = insertOperationSnapshot({
    kind: "metrics",
    customerId: input.customerId,
    campaignResourceName: input.campaignResourceName,
    body: { campaign: current, adGroups: collected.adGroupMetrics ?? [], ads: collected.rsaMetrics ?? [], window: labels.current },
  });
  insertOperationSnapshot({ kind: "performance", customerId: input.customerId, campaignResourceName: input.campaignResourceName, body: analyzed.snapshot });
  const recommendationId = insertOperationSnapshot({
    kind: "recommendations",
    customerId: input.customerId,
    campaignResourceName: input.campaignResourceName,
    body: recommendations.snapshot,
  });
  insertOperationSnapshot({ kind: "rules", customerId: input.customerId, campaignResourceName: input.campaignResourceName, body: rules.snapshot });
  for (const recommendation of recommendations.recommendationSet.recommendations) {
    insertOperationAction({
      snapshotId: recommendationId,
      kind: ACTION_KIND[recommendation.kind] ?? "REVIEW",
      label: operationLabel(recommendation.kind),
      resourceName: input.campaignResourceName,
      reason: recommendation.reason,
      evidenceJson: JSON.stringify(recommendation.evidence),
      confidence: recommendation.confidence,
      expectedImpact: impactOf(recommendation),
    });
  }
  for (const action of rules.pendingActions ?? []) queueRule(action, input.campaignResourceName, metricsId);
  insertOperationEvent({ kind: "synchronization", operator, detail: "Sincronização, métricas e recomendações gravadas.", resourceName: input.campaignResourceName });
  return { ok: true };
}

function queueRule(action: PendingAction, resourceName: string, snapshotId: string): void {
  insertOperationAction({
    snapshotId,
    kind: ACTION_KIND[action.outcome] ?? "REVIEW",
    label: operationLabel(action.outcome),
    resourceName,
    reason: action.reason,
    evidenceJson: JSON.stringify(action.evidence),
    confidence: "FULL",
    expectedImpact: action.outcome,
  });
}
