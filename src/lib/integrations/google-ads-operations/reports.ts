/**
 * Operations dashboard and exports.
 *
 * Figures come from stored snapshots. A missing figure stays blank.
 */
import { getDb } from "@/lib/db";
import { readGoogleAdsAccounts } from "@/lib/integrations/google-ads-oauth/store";
import { costPerConversion, returnOnAdSpend } from "@/lib/performance-analysis/performance-metrics";
import { countExecutedToday, listOperationActions, listOperationEvents, type OperationAction, type OperationEvent } from "./store";

type MetricBody = { campaign?: { impressions?: number | null; clicks?: number | null; costMicros?: number | null; conversions?: number | null; conversionValue?: number | null; status?: string }; window?: string };
type SyncBody = { campaignSnapshot?: { campaigns?: { status?: string; name?: string; resourceName?: string; budgetAmountMicros?: string | null }[] } };
type RecommendationBody = { statistics?: { triggeredRuleCount?: number; ruleCount?: number } };

function parsed<T>(kind: string): T | null {
  const row = getDb().prepare("SELECT body_json FROM google_ads_operation_snapshots WHERE kind = ? ORDER BY created_at DESC LIMIT 1").get(kind) as { body_json: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.body_json) as T;
  } catch {
    return null;
  }
}

function show(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : String(value);
}

export type OperationsDashboard = {
  accountName: string;
  customerId: string;
  campaigns: number;
  active: number;
  paused: number;
  conversions: string;
  cpa: string;
  roas: string;
  spend: string;
  revenue: string;
  optimizationScore: string;
  pending: number;
  executedToday: number;
  lastSynchronization: string;
  window: string;
  events: OperationEvent[];
  actions: OperationAction[];
};

export function readOperationsDashboard(): OperationsDashboard {
  const account = readGoogleAdsAccounts().find((item) => item.selected) ?? null;
  const publications = getDb().prepare("SELECT status FROM google_ads_publications").all() as { status: string }[];
  const sync = parsed<SyncBody>("sync");
  const campaigns = sync?.campaignSnapshot?.campaigns ?? [];
  const metrics = parsed<MetricBody>("metrics");
  const recommendation = parsed<RecommendationBody>("recommendations");
  const campaign = metrics?.campaign;
  const cpa = costPerConversion(campaign?.costMicros ?? null, campaign?.conversions ?? null);
  const roas = returnOnAdSpend(campaign?.conversionValue ?? null, campaign?.costMicros ?? null);
  const triggered = recommendation?.statistics?.triggeredRuleCount;
  const rules = recommendation?.statistics?.ruleCount;
  const last = listOperationEvents(1).find((item) => item.kind === "synchronization");
  const statuses = campaigns.length > 0 ? campaigns.map((item) => item.status) : publications.map((item) => item.status);
  return {
    accountName: account?.accountName || "Nenhuma conta ativa",
    customerId: account?.customerId || "—",
    campaigns: Math.max(campaigns.length, publications.length),
    active: statuses.filter((status) => status === "ENABLED").length,
    paused: statuses.filter((status) => status === "PAUSED").length,
    conversions: show(campaign?.conversions),
    cpa: cpa.state === "ready" && cpa.value !== null ? (cpa.value / 1_000_000).toFixed(2) : "—",
    roas: roas.state === "ready" && roas.value !== null ? roas.value.toFixed(2) : "—",
    spend: campaign?.costMicros === null || campaign?.costMicros === undefined ? "—" : (campaign.costMicros / 1_000_000).toFixed(2),
    revenue: show(campaign?.conversionValue),
    optimizationScore: triggered === undefined || rules === undefined ? "—" : `${triggered} / ${rules}`,
    pending: listOperationActions("pending").length,
    executedToday: countExecutedToday(),
    lastSynchronization: last?.createdAt ?? "Não sincronizado",
    window: metrics?.window ?? "LAST_30_DAYS",
    events: listOperationEvents(),
    actions: listOperationActions(),
  };
}

function csv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
}

export function campaignPerformanceCsv(): string {
  const metrics = parsed<MetricBody>("metrics");
  const campaign = metrics?.campaign;
  return csv([
    ["janela", "impressões", "cliques", "conversões", "custo", "valor"],
    [metrics?.window ?? "", show(campaign?.impressions), show(campaign?.clicks), show(campaign?.conversions), show(campaign?.costMicros), show(campaign?.conversionValue)],
  ]);
}

export function optimizationCsv(): string {
  const actions = listOperationActions();
  return csv([
    ["rótulo", "motivo", "confiança", "impacto", "status"],
    ...actions.map((item) => [item.label, item.reason, item.confidence, item.expectedImpact, item.status]),
  ]);
}

export function budgetCsv(): string {
  const sync = parsed<SyncBody>("sync");
  const rows = sync?.campaignSnapshot?.campaigns ?? [];
  return csv([
    ["campanha", "orçamento", "status"],
    ...rows.map((item) => [item.name ?? "", item.budgetAmountMicros ?? "", item.status ?? ""]),
  ]);
}

export function keywordCsv(): string {
  const resources = parsed<{ keywords?: Record<string, unknown>[] }>("resources");
  const rows = resources?.keywords ?? [];
  return csv([
    ["recurso"],
    ...rows.map((item) => [JSON.stringify(item.adGroupCriterion ?? item)]),
  ]);
}

export function rsaCsv(): string {
  const metrics = parsed<{ ads?: { resourceName?: string; status?: string }[] }>("metrics");
  return csv([["anúncio", "status"], ...(metrics?.ads ?? []).map((item) => [item.resourceName ?? "", item.status ?? ""])]);
}

export function executiveCsv(): string {
  const view = readOperationsDashboard();
  return csv([
    ["conta", "campanhas", "ativas", "pausadas", "conversões", "cpa", "roas", "gasto", "receita", "recomendações", "pendentes", "executadas hoje"],
    [view.accountName, String(view.campaigns), String(view.active), String(view.paused), view.conversions, view.cpa, view.roas, view.spend, view.revenue, view.optimizationScore, String(view.pending), String(view.executedToday)],
  ]);
}

export const REPORT_FILES = {
  campanha: campaignPerformanceCsv,
  otimizacao: optimizationCsv,
  orcamento: budgetCsv,
  palavras: keywordCsv,
  anuncios: rsaCsv,
  executivo: executiveCsv,
} as const;
