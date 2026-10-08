/**
 * Safe Google Ads publisher.
 *
 * Sends one paused Search mutate, then reads the campaign back. A plan that
 * fails validation never leaves this process. An observed status other than
 * PAUSED is not stored as a success.
 */
import { randomUUID } from "node:crypto";
import {
  GOOGLE_ADS_API_VERSION,
  googleAdsRequestHeaders,
  createGoogleAuthHttpClient,
  googleAdsRoot,
  isGoogleAuthRecord,
  parseGoogleAuthJson,
  type GoogleAuthTransport,
} from "@/lib/google-ads-live/google-auth-client";
import { exchangeRefreshToken } from "@/lib/google-ads-live/oauth-manager";
import { readGoogleAdsEnvironment } from "@/lib/integrations/google-ads-oauth/environment";
import { readGoogleAdsOAuthSecrets, readGoogleAdsOAuthView } from "@/lib/integrations/google-ads-oauth/store";
import { buildPausedSearchMutate } from "./operations";
import type { SafePlan } from "./plan";
import { insertGoogleAdsPublication, readGoogleAdsPublication, type GoogleAdsPublication } from "./store";

export type SafePublishResult =
  | { ok: true; publication: GoogleAdsPublication }
  | { ok: false; issues: string[] };

function resourceId(resourceName: string, kind: string): string | null {
  const match = new RegExp(`^customers/\\d+/${kind}/(\\d+)$`).exec(resourceName);
  return match?.[1] ?? null;
}

function metricNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function adId(resourceName: string): string | null {
  const match = /^customers\/\d+\/adGroupAds\/\d+~(\d+)$/.exec(resourceName);
  return match?.[1] ?? null;
}

export async function publishPausedSearchCampaign(plan: SafePlan, transport?: GoogleAuthTransport): Promise<SafePublishResult> {
  const existing = readGoogleAdsPublication(plan.localCampaignId);
  if (existing && existing.customerId === plan.customerId) {
    return { ok: false, issues: ["Esta campanha já tem uma publicação pausada nesta conta."] };
  }
  const body = buildPausedSearchMutate(plan);
  if (!body) return { ok: false, issues: ["A operação deixaria de ser uma campanha de pesquisa pausada."] };
  const env = readGoogleAdsEnvironment();
  const secrets = readGoogleAdsOAuthSecrets();
  const clientId = env.clientId || secrets.clientId;
  const clientSecret = env.clientSecret || secrets.clientSecret;
  if (!clientId || !clientSecret || !secrets.refreshToken) {
    return { ok: false, issues: ["A conta do Google Ads ainda não está pronta para publicar."] };
  }
  const client = createGoogleAuthHttpClient(transport);
  const oauth = await exchangeRefreshToken(client, { clientId, clientSecret, refreshToken: secrets.refreshToken });
  if (!oauth.ok) return { ok: false, issues: ["O Google recusou o refresh token."] };
  const root = googleAdsRoot(GOOGLE_ADS_API_VERSION);
  const headers = googleAdsRequestHeaders(oauth.grant.accessToken, true);
  const loginCustomerId = readGoogleAdsOAuthView().loginCustomerId;
  if (loginCustomerId && /^\d{10}$/.test(loginCustomerId) && loginCustomerId !== plan.customerId) {
    headers["login-customer-id"] = loginCustomerId;
  }
  const mutated = await client.send({
    url: `${root}/customers/${plan.customerId}/googleAds:mutate`,
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const parsed = parseGoogleAuthJson(mutated.bodyText);
  if (mutated.httpStatus !== 200 || !isGoogleAuthRecord(parsed) || !Array.isArray(parsed.mutateOperationResponses)) {
    return { ok: false, issues: ["O Google Ads recusou a campanha pausada."] };
  }
  const names: string[] = [];
  for (const row of parsed.mutateOperationResponses) {
    if (!isGoogleAuthRecord(row)) continue;
    for (const value of Object.values(row)) {
      if (isGoogleAuthRecord(value) && typeof value.resourceName === "string") names.push(value.resourceName);
    }
  }
  const campaignResourceName = names.find((name) => /\/campaigns\/\d+$/.test(name)) ?? null;
  const adGroupResourceName = names.find((name) => /\/adGroups\/\d+$/.test(name)) ?? null;
  const googleCampaignId = campaignResourceName ? resourceId(campaignResourceName, "campaigns") : null;
  const adGroupId = adGroupResourceName ? resourceId(adGroupResourceName, "adGroups") : null;
  const adIds = names.map(adId).filter((id): id is string => id !== null);
  const keywordResourceNames = names.filter((name) => name.includes("/adGroupCriteria/"));
  const assetResourceNames = names.filter((name) => name.includes("/assets/") || name.includes("/campaignAssets/"));
  if (!campaignResourceName || !googleCampaignId || !adGroupResourceName || !adGroupId || adIds.length === 0) {
    return { ok: false, issues: ["O Google Ads não devolveu os identificadores pausados."] };
  }
  const observed = await client.send({
    url: `${root}/customers/${plan.customerId}/googleAds:search`,
    method: "POST",
    headers,
    body: JSON.stringify({
      query: `SELECT campaign.id, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros FROM campaign WHERE campaign.resource_name = '${campaignResourceName}' AND segments.date DURING TODAY`,
    }),
  });
  const observedBody = parseGoogleAuthJson(observed.bodyText);
  const row = isGoogleAuthRecord(observedBody) && Array.isArray(observedBody.results) ? observedBody.results[0] : null;
  const campaign = isGoogleAuthRecord(row) && isGoogleAuthRecord(row.campaign) ? row.campaign : null;
  const metrics = isGoogleAuthRecord(row) && isGoogleAuthRecord(row.metrics) ? row.metrics : null;
  if (!campaign || campaign.status !== "PAUSED") {
    return { ok: false, issues: ["A campanha observada não está pausada. Nada foi marcado como publicado."] };
  }
  const impressions = metricNumber(metrics?.impressions);
  const clicks = metricNumber(metrics?.clicks);
  const costMicros = metricNumber(metrics?.costMicros);
  if (impressions !== 0 || clicks !== 0 || costMicros !== 0) {
    return { ok: false, issues: ["A leitura mostrou impressões, cliques ou custo. A publicação não foi aceita."] };
  }
  const publication: GoogleAdsPublication = {
    id: randomUUID(),
    localCampaignId: plan.localCampaignId,
    customerId: plan.customerId,
    googleCampaignId,
    campaignResourceName,
    adGroupId,
    adGroupResourceName,
    adIds,
    keywordResourceNames,
    assetResourceNames,
    status: "PAUSED",
    campaignType: "SEARCH",
    bidding: plan.bidding,
    budgetMicros: plan.amountMicros,
    impressions,
    clicks,
    costMicros,
    publishedAt: new Date().toISOString(),
  };
  insertGoogleAdsPublication(publication);
  return { ok: true, publication };
}
