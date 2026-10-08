/**
 * Approved Google Ads changes.
 *
 * A pending or rejected action never reaches the mutate call. Pause stays
 * paused on read-back. Resume and enable run only for an approved action of that kind.
 */
import { GOOGLE_ADS_API_VERSION, createGoogleAuthHttpClient, googleAdsRoot, isGoogleAuthRecord, parseGoogleAuthJson, type GoogleAuthTransport } from "@/lib/google-ads-live/google-auth-client";
import { exchangeRefreshToken } from "@/lib/google-ads-live/oauth-manager";
import { validateDescriptions } from "@/lib/google-ads-live/description-validator";
import { validateHeadlines } from "@/lib/google-ads-live/headline-validator";
import { readGoogleAdsEnvironment } from "@/lib/integrations/google-ads-oauth/environment";
import { readGoogleAdsOAuthSecrets, readGoogleAdsOAuthView } from "@/lib/integrations/google-ads-oauth/store";
import { insertOperationAudit, insertOperationEvent, markOperationActionExecuted, readLatestOperationSnapshot, readOperationAction, readOperationSnapshotBody } from "./store";

const PAUSE_KINDS = new Set(["PAUSE_CAMPAIGN", "PAUSE_AD_GROUP", "PAUSE_KEYWORD"]);
const ENABLE_KINDS = new Set(["RESUME_CAMPAIGN", "RESUME_AD_GROUP", "ENABLE_KEYWORD", "NEGATIVE_KEYWORD"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function payloadOf(text: string | null): Record<string, unknown> {
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function statusUpdate(kind: string, resourceName: string): Record<string, unknown> | null {
  const status = PAUSE_KINDS.has(kind) ? "PAUSED" : ENABLE_KINDS.has(kind) ? "ENABLED" : null;
  if (!status) return null;
  if (kind.endsWith("CAMPAIGN")) return { campaignOperation: { update: { resourceName, status }, updateMask: "status" } };
  if (kind.endsWith("AD_GROUP")) return { adGroupOperation: { update: { resourceName, status }, updateMask: "status" } };
  if (kind === "PAUSE_KEYWORD" || kind === "ENABLE_KEYWORD") return { adGroupCriterionOperation: { update: { resourceName, status }, updateMask: "status" } };
  return null;
}

function budgetUpdate(resourceName: string, payload: Record<string, unknown>, snapshot: unknown): Record<string, unknown> | null {
  const amount = payload.amountMicros;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0 || amount > 1_000_000_000_000) return null;
  const body = isRecord(snapshot) && isRecord(bodyCampaign(snapshot)) ? bodyCampaign(snapshot) : null;
  const budget = body && typeof body.budgetResourceName === "string" ? body.budgetResourceName : null;
  if (!budget || budget !== resourceName) return null;
  return { campaignBudgetOperation: { update: { resourceName: budget, amountMicros: String(amount) }, updateMask: "amount_micros" } };
}

function bodyCampaign(snapshot: unknown): Record<string, unknown> | null {
  if (!isRecord(snapshot)) return null;
  return isRecord(snapshot.campaign) ? snapshot.campaign : null;
}

function rsaUpdate(resourceName: string, payload: Record<string, unknown>): Record<string, unknown> | null {
  const headlines = payload.headlines;
  const descriptions = payload.descriptions;
  if (validateHeadlines(headlines).length > 0 || validateDescriptions(descriptions).length > 0) return null;
  return {
    adGroupAdOperation: {
      update: {
        resourceName,
        ad: { responsiveSearchAd: { headlines, descriptions } },
      },
      updateMask: "ad.responsive_search_ad.headlines,ad.responsive_search_ad.descriptions",
    },
  };
}

function negativeKeyword(payload: Record<string, unknown>): Record<string, unknown> | null {
  const adGroup = payload.adGroupResourceName;
  const text = payload.text;
  const matchType = payload.matchType;
  if (typeof adGroup !== "string" || !/^customers\/\d+\/adGroups\/\d+$/.test(adGroup)) return null;
  if (typeof text !== "string" || text.trim().length === 0 || text.trim().length > 80) return null;
  if (matchType !== "BROAD" && matchType !== "PHRASE" && matchType !== "EXACT") return null;
  return {
    adGroupCriterionOperation: {
      create: { adGroup, status: "ENABLED", negative: true, keyword: { text: text.trim(), matchType } },
    },
  };
}

export function buildApprovedMutate(action: { kind: string; resourceName: string; payloadJson: string | null }, snapshot: unknown): Record<string, unknown> | null {
  const payload = payloadOf(action.payloadJson);
  const operation = statusUpdate(action.kind, action.resourceName)
    ?? (action.kind === "BUDGET_UPDATE" ? budgetUpdate(action.resourceName, payload, snapshot) : null)
    ?? (action.kind === "RSA_UPDATE" ? rsaUpdate(action.resourceName, payload) : null)
    ?? (action.kind === "NEGATIVE_KEYWORD" ? negativeKeyword(payload) : null);
  if (!operation) return null;
  const body = { partialFailure: false, validateOnly: false, mutateOperations: [operation] };
  const text = JSON.stringify(body);
  if (text.includes("PERFORMANCE_MAX") || text.includes("SHOPPING")) return null;
  if (PAUSE_KINDS.has(action.kind) && (text.includes('"status":"ENABLED"') || !text.includes('"status":"PAUSED"'))) return null;
  if (!PAUSE_KINDS.has(action.kind) && !ENABLE_KINDS.has(action.kind) && action.kind !== "BUDGET_UPDATE" && action.kind !== "RSA_UPDATE") return null;
  return body;
}

export async function executeApprovedAction(actionId: string, operator = "operador", transport?: GoogleAuthTransport): Promise<{ ok: true } | { ok: false; issues: string[] }> {
  const action = readOperationAction(actionId);
  if (!action || action.status !== "approved") return { ok: false, issues: ["A ação precisa estar aprovada antes de executar."] };
  const snapshot = readLatestOperationSnapshot("resources", action.resourceName.startsWith("customers/") ? campaignOf(action.resourceName) : action.resourceName);
  const resources = snapshot?.body ?? null;
  const body = buildApprovedMutate(action, resources);
  if (!body) return { ok: false, issues: ["A ação aprovada não tem uma operação segura."] };
  const before = action.snapshotId ? readOperationSnapshotBody(action.snapshotId) : null;
  const env = readGoogleAdsEnvironment();
  const secrets = readGoogleAdsOAuthSecrets();
  const clientId = env.clientId || secrets.clientId;
  const clientSecret = env.clientSecret || secrets.clientSecret;
  if (!clientId || !clientSecret || !secrets.refreshToken || !env.developerToken) {
    return { ok: false, issues: ["A conta do Google Ads ainda não está pronta para executar."] };
  }
  const adGroupResourceName = payloadOf(action.payloadJson).adGroupResourceName;
  const customerId = customerOf(action.resourceName) ?? customerOf(typeof adGroupResourceName === "string" ? adGroupResourceName : "");
  if (!customerId) return { ok: false, issues: ["A ação não aponta para uma conta conhecida."] };
  const client = createGoogleAuthHttpClient(transport);
  const oauth = await exchangeRefreshToken(client, { clientId, clientSecret, refreshToken: secrets.refreshToken });
  if (!oauth.ok) return { ok: false, issues: ["O Google recusou o refresh token."] };
  const headers: Record<string, string> = {
    Authorization: `Bearer ${oauth.grant.accessToken}`,
    "developer-token": env.developerToken,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const loginCustomerId = readGoogleAdsOAuthView().loginCustomerId;
  if (loginCustomerId && /^\d{10}$/.test(loginCustomerId) && loginCustomerId !== customerId) headers["login-customer-id"] = loginCustomerId;
  const mutated = await client.send({
    url: `${googleAdsRoot(GOOGLE_ADS_API_VERSION)}/customers/${customerId}/googleAds:mutate`,
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (mutated.httpStatus !== 200) return { ok: false, issues: ["O Google Ads recusou a ação aprovada."] };
  if (PAUSE_KINDS.has(action.kind) || action.kind === "RESUME_CAMPAIGN") {
    const observed = await observeStatus(client, customerId, env.developerToken, oauth.grant.accessToken, headers, action);
    if (!observed) return { ok: false, issues: ["A leitura posterior não confirmou o status pedido."] };
  }
  const marked = markOperationActionExecuted(action.id);
  if (!marked) return { ok: false, issues: ["A ação deixou de estar aprovada antes da gravação."] };
  const after = readOperationAction(action.id);
  insertOperationAudit({
    actionId: action.id,
    before: before ?? action,
    after: after ?? { status: "executed" },
    operator,
    reason: action.reason,
    resourceName: action.resourceName,
  });
  const unchanged = action.snapshotId ? readOperationSnapshotBody(action.snapshotId) : null;
  if (before !== null && unchanged !== before) return { ok: false, issues: ["O snapshot anterior foi alterado."] };
  insertOperationEvent({ kind: "executed", operator, detail: action.label, resourceName: action.resourceName });
  return { ok: true };
}

function customerOf(resourceName: string): string | null {
  const match = /^customers\/(\d+)\//.exec(resourceName);
  return match?.[1] ?? null;
}

function campaignOf(resourceName: string): string {
  const match = /^(customers\/\d+\/campaigns\/\d+)/.exec(resourceName);
  return match?.[1] ?? resourceName;
}

async function observeStatus(
  client: ReturnType<typeof createGoogleAuthHttpClient>,
  customerId: string,
  developerToken: string,
  accessToken: string,
  headers: Record<string, string>,
  action: { kind: string; resourceName: string },
): Promise<boolean> {
  const expected = PAUSE_KINDS.has(action.kind) ? "PAUSED" : "ENABLED";
  const field = action.kind.endsWith("CAMPAIGN") ? "campaign" : action.kind.endsWith("AD_GROUP") ? "ad_group" : "ad_group_criterion";
  const response = await client.send({
    url: `${googleAdsRoot(GOOGLE_ADS_API_VERSION)}/customers/${customerId}/googleAds:search`,
    method: "POST",
    headers: { ...headers, Authorization: `Bearer ${accessToken}`, "developer-token": developerToken },
    body: JSON.stringify({ query: `SELECT ${field}.status FROM ${field} WHERE ${field}.resource_name = '${action.resourceName}'` }),
  });
  const parsed = parseGoogleAuthJson(response.bodyText);
  const row = isGoogleAuthRecord(parsed) && Array.isArray(parsed.results) ? parsed.results[0] : null;
  if (!isGoogleAuthRecord(row)) return false;
  const entity = row.campaign ?? row.adGroup ?? row.adGroupCriterion;
  return isGoogleAuthRecord(entity) && entity.status === expected;
}
