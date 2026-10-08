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
  getDb()
    .prepare(
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
    )
    .run(now);
}
