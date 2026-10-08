/**
 * Read-only Google Ads account discovery.
 *
 * Lists accessible customers, then reads customer, campaign, and permission
 * probes with search. This module never calls a mutate method.
 */
import {
  googleAdsRequestHeaders,
  googleAdsRoot,
  googleAuthErrorCodes,
  isGoogleAuthRecord,
  parseGoogleAuthJson,
  type GoogleAuthHttpClient,
} from "@/lib/google-ads-live/google-auth-client";
import type { GoogleAuthAccount } from "@/lib/google-ads-live/authentication-session";
import type { GoogleAuthCustomerRead } from "@/lib/google-ads-live/customer-manager";
import type { GoogleAdsPermissions, GoogleAdsStoredAccount } from "./store";

const CUSTOMER_QUERY = "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager, customer.test_account, customer.status FROM customer";
const ACCESS_QUERY = "SELECT customer_user_access.access_role FROM customer_user_access";
const CAMPAIGN_QUERY = "SELECT campaign.id, campaign.status FROM campaign";
const AD_GROUP_QUERY = "SELECT ad_group.id FROM ad_group";
const ADS_QUERY = "SELECT ad_group_ad.ad.id FROM ad_group_ad";
const KEYWORD_QUERY = "SELECT ad_group_criterion.criterion_id FROM ad_group_criterion WHERE ad_group_criterion.type = KEYWORD";
const REPORTING_QUERY = "SELECT campaign.id, metrics.impressions FROM campaign WHERE segments.date DURING YESTERDAY";
const ASSET_QUERY = "SELECT asset.id FROM asset";
const MAX_PAGES = 10;
const WRITE_ROLES = new Set(["ADMIN", "STANDARD"]);

export type GoogleAdsDiscoveryRead = {
  accounts: GoogleAdsStoredAccount[];
  latencyMs: number;
};

function textOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" ? null : text;
}

function denied(httpStatus: number, parsed: unknown): boolean {
  if (httpStatus === 401 || httpStatus === 403) return true;
  return googleAuthErrorCodes(parsed).some((code) => code === "USER_PERMISSION_DENIED" || code === "ACTION_NOT_PERMITTED" || code === "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION");
}

async function search(
  client: GoogleAuthHttpClient,
  root: string,
  customerId: string,
  developerToken: string,
  accessToken: string,
  loginCustomerId: string | null,
  query: string,
): Promise<{ ok: true; rows: Record<string, unknown>[] } | { ok: false; permission: boolean }> {
  if (query.includes(":mutate") || !/^\d{10}$/.test(customerId)) return { ok: false, permission: true };
  const rows: Record<string, unknown>[] = [];
  let pageToken = "";
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload: Record<string, string> = { query };
    if (pageToken !== "") payload.pageToken = pageToken;
    const headers = googleAdsRequestHeaders(accessToken, true);
    if (loginCustomerId && /^\d{10}$/.test(loginCustomerId)) headers["login-customer-id"] = loginCustomerId;
    const response = await client.send({
      url: `${root}/customers/${customerId}/googleAds:search`,
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const parsed = parseGoogleAuthJson(response.bodyText);
    if (denied(response.httpStatus, parsed)) return { ok: false, permission: true };
    if (response.httpStatus !== 200 || !isGoogleAuthRecord(parsed)) return { ok: false, permission: false };
    const results = Array.isArray(parsed.results) ? parsed.results : [];
    for (const result of results) {
      if (isGoogleAuthRecord(result)) rows.push(result);
    }
    const next = textOf(parsed.nextPageToken);
    if (next === null) return { ok: true, rows };
    pageToken = next;
  }
  return { ok: true, rows };
}

function accessLabel(role: string | null): string | null {
  if (role === "ADMIN") return "Administrador";
  if (role === "STANDARD") return "Padrão";
  if (role === "READ_ONLY") return "Somente leitura";
  if (role === "EMAIL_ONLY") return "E-mail";
  return null;
}

function statusLabel(status: string | null): string | null {
  if (status === "ENABLED") return "Ativa";
  if (status === "SUSPENDED") return "Suspensa";
  if (status === "CANCELED") return "Cancelada";
  if (status === "CLOSED") return "Encerrada";
  return status;
}

function campaignCounts(rows: Record<string, unknown>[]): { total: number; paused: number; enabled: number; removed: number } {
  let paused = 0;
  let enabled = 0;
  let removed = 0;
  let total = 0;
  for (const row of rows) {
    if (!isGoogleAuthRecord(row.campaign)) continue;
    const status = textOf(row.campaign.status);
    if (!status) continue;
    total += 1;
    if (status === "PAUSED") paused += 1;
    else if (status === "ENABLED") enabled += 1;
    else if (status === "REMOVED") removed += 1;
  }
  return { total, paused, enabled, removed };
}

function roleFromRows(rows: Record<string, unknown>[]): string | null {
  const roles = new Set<string>();
  for (const row of rows) {
    if (!isGoogleAuthRecord(row.customerUserAccess)) continue;
    const role = textOf(row.customerUserAccess.accessRole);
    if (role) roles.add(role);
  }
  if (roles.size !== 1) return null;
  return [...roles][0] ?? null;
}

function seed(account: GoogleAuthAccount): GoogleAdsStoredAccount {
  return {
    customerId: account.customerId,
    accountName: account.descriptiveName,
    currencyCode: account.currencyCode,
    timeZone: account.timeZone,
    manager: account.manager,
    testAccount: false,
    accountStatus: statusLabel(account.status),
    accessLevel: null,
    selected: false,
    campaignCount: null,
    pausedCount: null,
    enabledCount: null,
    removedCount: null,
    permissions: {
      campaignRead: "missing",
      campaignWrite: "missing",
      adGroup: "missing",
      ads: "missing",
      keywords: "missing",
      reporting: "missing",
      assets: "missing",
    },
    discoveredAt: new Date().toISOString(),
  };
}

function uniqueAccounts(read: GoogleAuthCustomerRead): GoogleAuthAccount[] {
  const byId = new Map<string, GoogleAuthAccount>();
  for (const account of [...read.accounts, ...read.children]) {
    if (!/^\d{10}$/.test(account.customerId)) continue;
    const current = byId.get(account.customerId);
    if (!current) byId.set(account.customerId, account);
  }
  return [...byId.values()];
}

export async function discoverGoogleAdsAccounts(
  client: GoogleAuthHttpClient,
  apiVersion: string,
  developerToken: string,
  accessToken: string,
  read: GoogleAuthCustomerRead,
): Promise<GoogleAdsDiscoveryRead> {
  const started = Date.now();
  const root = googleAdsRoot(apiVersion);
  const accounts: GoogleAdsStoredAccount[] = [];
  for (const source of uniqueAccounts(read)) {
    const loginCustomerId = source.parentCustomerId;
    const account = seed(source);
    const detail = await search(client, root, source.customerId, developerToken, accessToken, loginCustomerId, CUSTOMER_QUERY);
    if (detail.ok) {
      const customer = detail.rows.find((row) => isGoogleAuthRecord(row.customer));
      if (customer && isGoogleAuthRecord(customer.customer)) {
        account.accountName = textOf(customer.customer.descriptiveName) ?? account.accountName;
        account.currencyCode = textOf(customer.customer.currencyCode) ?? account.currencyCode;
        account.timeZone = textOf(customer.customer.timeZone) ?? account.timeZone;
        if (typeof customer.customer.manager === "boolean") account.manager = customer.customer.manager;
        if (typeof customer.customer.testAccount === "boolean") account.testAccount = customer.customer.testAccount;
        account.accountStatus = statusLabel(textOf(customer.customer.status)) ?? account.accountStatus;
      }
    }
    const access = await search(client, root, source.customerId, developerToken, accessToken, loginCustomerId, ACCESS_QUERY);
    const role = access.ok ? roleFromRows(access.rows) : null;
    account.accessLevel = accessLabel(role);
    const probes: Array<[keyof GoogleAdsPermissions, string]> = [
      ["campaignRead", CAMPAIGN_QUERY],
      ["adGroup", AD_GROUP_QUERY],
      ["ads", ADS_QUERY],
      ["keywords", KEYWORD_QUERY],
      ["reporting", REPORTING_QUERY],
      ["assets", ASSET_QUERY],
    ];
    for (const [name, query] of probes) {
      const result = await search(client, root, source.customerId, developerToken, accessToken, loginCustomerId, query);
      account.permissions[name] = result.ok ? "granted" : "missing";
      if (name === "campaignRead" && result.ok) {
        const counts = campaignCounts(result.rows);
        account.campaignCount = counts.total;
        account.pausedCount = counts.paused;
        account.enabledCount = counts.enabled;
        account.removedCount = counts.removed;
      }
    }
    account.permissions.campaignWrite = role !== null && WRITE_ROLES.has(role) ? "granted" : "missing";
    accounts.push(account);
  }
  return { accounts, latencyMs: Math.max(0, Date.now() - started) };
}
