/**
 * One encrypted Google Ads OAuth record.
 *
 * Public reads expose presence and account labels. Secret values stay inside
 * the server functions that talk to Google.
 */
import { getDb } from "@/lib/db";
import { decryptGoogleAdsSecret, encryptGoogleAdsSecret } from "./cipher";

export type GoogleAdsOAuthPhase = "disconnected" | "connected" | "error";
export type GoogleAdsApiPhase = "unchecked" | "success" | "error";

export type GoogleAdsOAuthView = {
  clientIdConfigured: boolean;
  clientSecretConfigured: boolean;
  refreshTokenConfigured: boolean;
  environment: string | null;
  customerId: string | null;
  loginCustomerId: string | null;
  accountName: string | null;
  accessLevel: string | null;
  oauthStatus: GoogleAdsOAuthPhase;
  apiStatus: GoogleAdsApiPhase;
  lastConnectionAt: string | null;
  lastError: string | null;
  updatedAt: string | null;
};

export type GoogleAdsConnectionWrite = {
  oauthStatus: GoogleAdsOAuthPhase;
  apiStatus: GoogleAdsApiPhase;
  customerId: string | null;
  loginCustomerId: string | null;
  accountName: string | null;
  accessLevel: string | null;
  lastConnectionAt: string | null;
  lastError: string | null;
};

type Row = {
  client_id_cipher: string | null;
  client_secret_cipher: string | null;
  refresh_token_cipher: string | null;
  environment: string;
  customer_id: string | null;
  login_customer_id: string | null;
  account_name: string | null;
  access_level: string | null;
  oauth_status: string;
  api_status: string;
  last_connection_at: string | null;
  last_error: string | null;
  updated_at: string;
};

const EMPTY: GoogleAdsOAuthView = {
  clientIdConfigured: false,
  clientSecretConfigured: false,
  refreshTokenConfigured: false,
  environment: null,
  customerId: null,
  loginCustomerId: null,
  accountName: null,
  accessLevel: null,
  oauthStatus: "disconnected",
  apiStatus: "unchecked",
  lastConnectionAt: null,
  lastError: null,
  updatedAt: null,
};

function phase(value: string): GoogleAdsOAuthPhase {
  if (value === "connected" || value === "error") return value;
  return "disconnected";
}

function apiPhase(value: string): GoogleAdsApiPhase {
  if (value === "success" || value === "error") return value;
  return "unchecked";
}

function safeText(value: string | null, limit: number): string | null {
  if (!value) return null;
  const cleaned = value.replace(/ya29\.[A-Za-z0-9_\-]+/g, "").replace(/1\/\/[A-Za-z0-9_\-]+/g, "").trim();
  return cleaned === "" ? null : cleaned.slice(0, limit);
}

function readRow(): Row | null {
  const row = getDb().prepare("SELECT * FROM google_ads_oauth WHERE id = 1").get() as Row | undefined;
  return row ?? null;
}

export function readGoogleAdsOAuthView(): GoogleAdsOAuthView {
  try {
    const row = readRow();
    if (!row) return EMPTY;
    return {
      clientIdConfigured: Boolean(row.client_id_cipher),
      clientSecretConfigured: Boolean(row.client_secret_cipher),
      refreshTokenConfigured: Boolean(row.refresh_token_cipher),
      environment: row.environment,
      customerId: row.customer_id,
      loginCustomerId: row.login_customer_id,
      accountName: row.account_name,
      accessLevel: row.access_level,
      oauthStatus: phase(row.oauth_status),
      apiStatus: apiPhase(row.api_status),
      lastConnectionAt: row.last_connection_at,
      lastError: row.last_error,
      updatedAt: row.updated_at,
    };
  } catch {
    return EMPTY;
  }
}

export function readGoogleAdsOAuthSecrets(): { clientId: string | null; clientSecret: string | null; refreshToken: string | null } {
  const row = readRow();
  if (!row) return { clientId: null, clientSecret: null, refreshToken: null };
  return {
    clientId: decryptGoogleAdsSecret(row.client_id_cipher),
    clientSecret: decryptGoogleAdsSecret(row.client_secret_cipher),
    refreshToken: decryptGoogleAdsSecret(row.refresh_token_cipher),
  };
}

export function saveGoogleAdsClientCredentials(clientId: string, clientSecret: string, environment: string): boolean {
  const clientCipher = encryptGoogleAdsSecret(clientId);
  const secretCipher = encryptGoogleAdsSecret(clientSecret);
  if (!clientCipher || !secretCipher) return false;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO google_ads_oauth (
        id, client_id_cipher, client_secret_cipher, environment, oauth_status, api_status, updated_at
      ) VALUES (1, ?, ?, ?, 'disconnected', 'unchecked', ?)
      ON CONFLICT(id) DO UPDATE SET
        client_id_cipher = excluded.client_id_cipher,
        client_secret_cipher = excluded.client_secret_cipher,
        environment = excluded.environment,
        updated_at = excluded.updated_at`,
    )
    .run(clientCipher, secretCipher, environment, now);
  return true;
}

export function saveGoogleAdsRefreshToken(refreshToken: string): boolean {
  const cipher = encryptGoogleAdsSecret(refreshToken);
  if (!cipher) return false;
  const now = new Date().toISOString();
  const result = getDb()
    .prepare(
      `UPDATE google_ads_oauth
       SET refresh_token_cipher = ?, oauth_status = 'connected', updated_at = ?
       WHERE id = 1`,
    )
    .run(cipher, now);
  return result.changes > 0;
}

export function writeGoogleAdsConnection(update: GoogleAdsConnectionWrite): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE google_ads_oauth SET
        oauth_status = ?,
        api_status = ?,
        customer_id = ?,
        login_customer_id = ?,
        account_name = ?,
        access_level = ?,
        last_connection_at = ?,
        last_error = ?,
        updated_at = ?
      WHERE id = 1`,
    )
    .run(
      update.oauthStatus,
      update.apiStatus,
      safeText(update.customerId, 32),
      safeText(update.loginCustomerId, 32),
      safeText(update.accountName, 120),
      safeText(update.accessLevel, 40),
      update.lastConnectionAt,
      safeText(update.lastError, 300),
      now,
    );
}

export function clearGoogleAdsSession(): void {
  const now = new Date().toISOString();
  const db = getDb();
  db.prepare(
    `UPDATE google_ads_oauth SET
      refresh_token_cipher = NULL,
      customer_id = NULL,
      login_customer_id = NULL,
      account_name = NULL,
      access_level = NULL,
      oauth_status = 'disconnected',
      api_status = 'unchecked',
      last_connection_at = NULL,
      last_error = NULL,
      updated_at = ?
    WHERE id = 1`,
  ).run(now);
  db.prepare("DELETE FROM google_ads_accounts").run();
  db.prepare("DELETE FROM google_ads_discovery").run();
}

export type GoogleAdsPermissionName = "campaignRead" | "campaignWrite" | "adGroup" | "ads" | "keywords" | "reporting" | "assets";
export type GoogleAdsPermissionState = "granted" | "missing";
export type GoogleAdsPermissions = Record<GoogleAdsPermissionName, GoogleAdsPermissionState>;
export type GoogleAdsSyncState = "connected" | "disconnected" | "needs_authorization" | "permission_error";

export type GoogleAdsStoredAccount = {
  customerId: string;
  accountName: string | null;
  currencyCode: string | null;
  timeZone: string | null;
  manager: boolean;
  testAccount: boolean;
  accountStatus: string | null;
  accessLevel: string | null;
  selected: boolean;
  campaignCount: number | null;
  pausedCount: number | null;
  enabledCount: number | null;
  removedCount: number | null;
  permissions: GoogleAdsPermissions;
  discoveredAt: string;
};

export type GoogleAdsDiscoveryHealth = {
  syncState: GoogleAdsSyncState;
  latencyMs: number | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  apiVersion: string | null;
};

const EMPTY_PERMISSIONS: GoogleAdsPermissions = {
  campaignRead: "missing",
  campaignWrite: "missing",
  adGroup: "missing",
  ads: "missing",
  keywords: "missing",
  reporting: "missing",
  assets: "missing",
};

function permissionsOf(value: string): GoogleAdsPermissions {
  try {
    const parsed = JSON.parse(value) as Partial<GoogleAdsPermissions>;
    return {
      campaignRead: parsed.campaignRead === "granted" ? "granted" : "missing",
      campaignWrite: parsed.campaignWrite === "granted" ? "granted" : "missing",
      adGroup: parsed.adGroup === "granted" ? "granted" : "missing",
      ads: parsed.ads === "granted" ? "granted" : "missing",
      keywords: parsed.keywords === "granted" ? "granted" : "missing",
      reporting: parsed.reporting === "granted" ? "granted" : "missing",
      assets: parsed.assets === "granted" ? "granted" : "missing",
    };
  } catch {
    return EMPTY_PERMISSIONS;
  }
}

function syncStateOf(value: string | undefined): GoogleAdsSyncState {
  if (value === "connected" || value === "needs_authorization" || value === "permission_error") return value;
  return "disconnected";
}

type AccountRow = {
  customer_id: string;
  account_name: string | null;
  currency_code: string | null;
  time_zone: string | null;
  manager: number;
  test_account: number;
  account_status: string | null;
  access_level: string | null;
  selected: number;
  campaign_count: number | null;
  paused_count: number | null;
  enabled_count: number | null;
  removed_count: number | null;
  permissions_json: string;
  discovered_at: string;
};

function accountFromRow(row: AccountRow): GoogleAdsStoredAccount {
  return {
    customerId: row.customer_id,
    accountName: row.account_name,
    currencyCode: row.currency_code,
    timeZone: row.time_zone,
    manager: row.manager === 1,
    testAccount: row.test_account === 1,
    accountStatus: row.account_status,
    accessLevel: row.access_level,
    selected: row.selected === 1,
    campaignCount: row.campaign_count,
    pausedCount: row.paused_count,
    enabledCount: row.enabled_count,
    removedCount: row.removed_count,
    permissions: permissionsOf(row.permissions_json),
    discoveredAt: row.discovered_at,
  };
}

export function readGoogleAdsAccounts(): GoogleAdsStoredAccount[] {
  try {
    const rows = getDb().prepare("SELECT * FROM google_ads_accounts ORDER BY account_name, customer_id").all() as AccountRow[];
    return rows.map(accountFromRow);
  } catch {
    return [];
  }
}

export function readGoogleAdsDiscoveryHealth(): GoogleAdsDiscoveryHealth {
  try {
    const row = getDb().prepare("SELECT * FROM google_ads_discovery WHERE id = 1").get() as
      | { sync_state: string; latency_ms: number | null; last_success_at: string | null; last_error: string | null; api_version: string }
      | undefined;
    if (!row) return { syncState: "disconnected", latencyMs: null, lastSuccessAt: null, lastError: null, apiVersion: null };
    return {
      syncState: syncStateOf(row.sync_state),
      latencyMs: row.latency_ms,
      lastSuccessAt: row.last_success_at,
      lastError: row.last_error,
      apiVersion: row.api_version,
    };
  } catch {
    return { syncState: "disconnected", latencyMs: null, lastSuccessAt: null, lastError: null, apiVersion: null };
  }
}

export function writeGoogleAdsDiscoveryHealth(input: {
  syncState: GoogleAdsSyncState;
  latencyMs: number | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  apiVersion: string;
}): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO google_ads_discovery (id, sync_state, latency_ms, last_success_at, last_error, api_version, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         sync_state = excluded.sync_state,
         latency_ms = excluded.latency_ms,
         last_success_at = excluded.last_success_at,
         last_error = excluded.last_error,
         api_version = excluded.api_version,
         updated_at = excluded.updated_at`,
    )
    .run(input.syncState, input.latencyMs, input.lastSuccessAt, safeText(input.lastError, 300), input.apiVersion, now);
}

export function replaceGoogleAdsAccounts(accounts: GoogleAdsStoredAccount[]): GoogleAdsStoredAccount | null {
  const db = getDb();
  const previous = db.prepare("SELECT customer_id FROM google_ads_accounts WHERE selected = 1").get() as { customer_id: string } | undefined;
  const seen = new Set<string>();
  const unique = accounts.filter((account) => {
    if (!/^\d{10}$/.test(account.customerId) || seen.has(account.customerId)) return false;
    seen.add(account.customerId);
    return true;
  });
  const selectedId = unique.some((account) => account.customerId === previous?.customer_id)
    ? previous?.customer_id ?? null
    : unique.length === 1
      ? unique[0]!.customerId
      : null;
  const insert = db.prepare(
    `INSERT INTO google_ads_accounts (
      customer_id, account_name, currency_code, time_zone, manager, test_account, account_status, access_level,
      selected, campaign_count, paused_count, enabled_count, removed_count, permissions_json, discovered_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM google_ads_accounts").run();
    for (const account of unique) {
      insert.run(
        account.customerId,
        safeText(account.accountName, 120),
        safeText(account.currencyCode, 8),
        safeText(account.timeZone, 64),
        account.manager ? 1 : 0,
        account.testAccount ? 1 : 0,
        safeText(account.accountStatus, 40),
        safeText(account.accessLevel, 40),
        account.customerId === selectedId ? 1 : 0,
        account.campaignCount,
        account.pausedCount,
        account.enabledCount,
        account.removedCount,
        JSON.stringify(account.permissions),
        account.discoveredAt,
      );
    }
  });
  tx();
  return unique.find((account) => account.customerId === selectedId) ?? null;
}

export function selectGoogleAdsAccount(customerId: string): GoogleAdsStoredAccount | null {
  if (!/^\d{10}$/.test(customerId)) return null;
  const db = getDb();
  const existing = db.prepare("SELECT customer_id FROM google_ads_accounts WHERE customer_id = ?").get(customerId);
  if (!existing) return null;
  const tx = db.transaction(() => {
    db.prepare("UPDATE google_ads_accounts SET selected = 0").run();
    db.prepare("UPDATE google_ads_accounts SET selected = 1 WHERE customer_id = ?").run(customerId);
  });
  tx();
  return readGoogleAdsAccounts().find((account) => account.customerId === customerId) ?? null;
}
