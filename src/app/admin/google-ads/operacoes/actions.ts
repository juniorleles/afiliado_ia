"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { operatorMayManageGoogleAds } from "@/lib/integrations/google-ads-oauth/access";
import { activateGoogleAdsAccount } from "@/lib/integrations/google-ads-oauth/flow";
import { decideOperationAction, insertOperationAction, insertOperationEvent } from "@/lib/integrations/google-ads-operations/store";
import { executeApprovedAction } from "@/lib/integrations/google-ads-operations/execute";
import { runLiveOperations, type OperationWindow } from "@/lib/integrations/google-ads-operations/pipeline";

const PAGE = "/admin/google-ads/operacoes";

function knownResource(resourceName: string): boolean {
  if (!/^customers\/\d+\/[A-Za-z]+\/\d+(~\d+)?$/.test(resourceName)) return false;
  const rows = getDb().prepare("SELECT body_json FROM google_ads_operation_snapshots").all() as { body_json: string }[];
  if (rows.some((row) => row.body_json.includes(resourceName))) return true;
  const publications = getDb().prepare("SELECT campaign_resource_name, ad_group_resource_name, keyword_resource_names_json, asset_resource_names_json FROM google_ads_publications").all() as {
    campaign_resource_name: string | null;
    ad_group_resource_name: string | null;
    keyword_resource_names_json: string;
    asset_resource_names_json: string;
  }[];
  return publications.some((row) => JSON.stringify(row).includes(resourceName));
}

function windowOf(value: string): OperationWindow {
  if (value === "TODAY" || value === "YESTERDAY" || value === "LAST_7_DAYS" || value === "LAST_30_DAYS" || value === "CUSTOM") return value;
  return "LAST_30_DAYS";
}

export async function selectOperationsAccount(formData: FormData): Promise<void> {
  if (!(await operatorMayManageGoogleAds())) redirect(`/admin/login?next=${encodeURIComponent(PAGE)}`);
  const selected = activateGoogleAdsAccount(String(formData.get("customerId") ?? ""));
  redirect(`${PAGE}?aviso=${selected ? "selecionada" : "conta"}`);
}

export async function syncOperationsAction(formData: FormData): Promise<void> {
  if (!(await operatorMayManageGoogleAds())) redirect(`/admin/login?next=${encodeURIComponent(PAGE)}`);
  const customerId = String(formData.get("customerId") ?? "");
  const resourceName = String(formData.get("resourceName") ?? "");
  const result = await runLiveOperations({
    customerId,
    campaignResourceName: resourceName,
    window: windowOf(String(formData.get("window") ?? "")),
    metricStart: String(formData.get("metricStart") ?? "") || null,
    metricEnd: String(formData.get("metricEnd") ?? "") || null,
  });
  redirect(`${PAGE}?aviso=${result.ok ? "sincronizada" : "recusada"}`);
}

export async function decideAction(formData: FormData): Promise<void> {
  if (!(await operatorMayManageGoogleAds())) redirect(`/admin/login?next=${encodeURIComponent(PAGE)}`);
  const id = String(formData.get("id") ?? "");
  const decision = formData.get("decision") === "approved" ? "approved" : "rejected";
  const amount = Number(String(formData.get("amount") ?? ""));
  const payload = Number.isInteger(amount) && amount > 0 ? JSON.stringify({ amountMicros: amount }) : null;
  const saved = decideOperationAction(id, decision, "operador", payload);
  if (saved) insertOperationEvent({ kind: decision === "approved" ? "approval" : "rejection", operator: "operador", detail: decision === "approved" ? "Ação aprovada." : "Ação rejeitada." });
  redirect(`${PAGE}?aviso=${saved ? decision : "recusada"}`);
}

export async function executeAction(formData: FormData): Promise<void> {
  if (!(await operatorMayManageGoogleAds())) redirect(`/admin/login?next=${encodeURIComponent(PAGE)}`);
  const result = await executeApprovedAction(String(formData.get("id") ?? ""));
  redirect(`${PAGE}?aviso=${result.ok ? "executada" : "recusada"}`);
}

export async function proposeAction(formData: FormData): Promise<void> {
  if (!(await operatorMayManageGoogleAds())) redirect(`/admin/login?next=${encodeURIComponent(PAGE)}`);
  const kind = String(formData.get("kind") ?? "");
  const resourceName = String(formData.get("resourceName") ?? "");
  const allowed = new Set(["PAUSE_CAMPAIGN", "RESUME_CAMPAIGN", "PAUSE_AD_GROUP", "RESUME_AD_GROUP", "PAUSE_KEYWORD", "ENABLE_KEYWORD", "BUDGET_UPDATE", "RSA_UPDATE", "NEGATIVE_KEYWORD"]);
  if (!allowed.has(kind) || !knownResource(resourceName)) redirect(`${PAGE}?aviso=recusada`);
  insertOperationAction({
    snapshotId: null,
    kind,
    label: kind,
    resourceName,
    reason: "Proposta do operador. Nada é executado nesta etapa.",
    evidenceJson: "{}",
    confidence: "PARTIAL",
    expectedImpact: "Aguardando aprovação e execução separadas.",
  });
  insertOperationEvent({ kind: "proposal", operator: "operador", detail: "Ação proposta. Continua pendente.", resourceName });
  redirect(`${PAGE}?aviso=proposta`);
}
