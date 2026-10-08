/**
 * Google Ads OAuth foundation.
 * Uses a temporary database and a fake Google transport. Does not call Google.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { GoogleAuthHttpRequest, GoogleAuthHttpResponse } from "../src/lib/google-ads-live/google-auth-client";

const root = mkdtempSync(path.join(tmpdir(), "gads-oauth-"));
const dbFile = path.join(root, "oauth.db");
const CLIENT = "client-PLAINTEXT-do-not-store";
const SECRET = "secret-PLAINTEXT-do-not-store";
const DEVELOPER = "developer-PLAINTEXT-do-not-store";
const REFRESH = "refresh-PLAINTEXT-do-not-store";
const REFRESH_TWO = "refresh-PLAINTEXT-second-token";
const ACCESS = "access-PLAINTEXT-do-not-store";

process.env.PRESELL_OS_DB = dbFile;
process.env.ADMIN_SESSION_SECRET = "test-session-secret-value";
process.env.GOOGLE_ADS_CLIENT_ID = CLIENT;
process.env.GOOGLE_ADS_CLIENT_SECRET = SECRET;
process.env.GOOGLE_ADS_REDIRECT_URI = "http://127.0.0.1:3000/configuracoes/integracoes/google-ads/retorno";
process.env.GOOGLE_ADS_DEVELOPER_TOKEN = DEVELOPER;
process.env.GOOGLE_CLOUD_PROJECT = "demo-cloud-project";
process.env.AIA_ENV = "test";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`OK: ${message}`);
}

function tokenResponse(refresh: string | null): GoogleAuthHttpResponse {
  const body: Record<string, unknown> = {
    access_token: ACCESS,
    expires_in: 3600,
    token_type: "Bearer",
    scope: "https://www.googleapis.com/auth/adwords",
  };
  if (refresh) body.refresh_token = refresh;
  return { httpStatus: 200, bodyText: JSON.stringify(body) };
}

function customers(ok: boolean): (request: GoogleAuthHttpRequest) => Promise<GoogleAuthHttpResponse> {
  return async (request) => {
    if (request.url.startsWith("https://oauth2.googleapis.com/token")) {
      const code = request.body?.includes("grant_type=authorization_code");
      return tokenResponse(code ? REFRESH : null);
    }
    if (!ok) {
      return {
        httpStatus: 403,
        bodyText: JSON.stringify({ error: { details: [{ errors: [{ errorCode: { authorizationError: "USER_PERMISSION_DENIED" } }] }] } }),
      };
    }
    if (request.url.endsWith("/customers:listAccessibleCustomers")) {
      return { httpStatus: 200, bodyText: JSON.stringify({ resourceNames: ["customers/1234567890"] }) };
    }
    if (request.url.includes("/googleAds:search")) {
      return {
        httpStatus: 200,
        bodyText: JSON.stringify({
          results: [{ customer: { descriptiveName: "Conta observada", manager: false, status: "ENABLED" } }],
        }),
      };
    }
    return { httpStatus: 404, bodyText: "" };
  };
}

async function main(): Promise<void> {
const flow = await import("../src/lib/integrations/google-ads-oauth/flow.ts");
const statusMod = await import("../src/lib/integrations/google-ads-oauth/status.ts");
const store = await import("../src/lib/integrations/google-ads-oauth/store.ts");
const state = await import("../src/lib/integrations/google-ads-oauth/state-cookie.ts");

const prepared = flow.prepareGoogleAdsConsent();
assert(prepared.ok, "consent preparation accepts the environment");
if (!prepared.ok) process.exit(1);
const consent = new URL(prepared.url);
assert(consent.origin === "https://accounts.google.com", "consent screen opens on Google");
assert(consent.searchParams.get("response_type") === "code", "consent uses the authorization code flow");
assert(consent.searchParams.get("scope") === "https://www.googleapis.com/auth/adwords", "consent requests the Google Ads scope");
assert(consent.searchParams.get("code_challenge_method") === "S256", "consent uses PKCE");
assert(!prepared.url.includes(SECRET), "consent URL does not carry the client secret");
assert(!prepared.url.includes(DEVELOPER), "consent URL does not carry the developer token");

const sealed = state.sealGoogleAdsState(prepared.state, prepared.verifier);
assert(sealed !== null, "state cookie is sealed");
const opened = state.openGoogleAdsState(sealed);
assert(opened?.state === prepared.state && opened.verifier === prepared.verifier, "state cookie opens the same verifier");
assert(state.openGoogleAdsState(`${sealed}x`) === null, "a tampered state cookie is refused");

const accepted = await flow.acceptGoogleAdsAuthorizationCode({
  code: "auth-code-example",
  codeVerifier: prepared.verifier,
  transport: customers(true),
});
assert(accepted === "sucesso", "authorization code becomes a stored connection");
const view = statusMod.readGoogleAdsIntegrationStatus();
assert(view.connection === "Conectado", "status says connected");
assert(view.customerId === "1234567890", "customer id comes from CustomerService");
assert(view.account === "Conta observada", "account name comes from the customer record");
assert(view.accessLevel === "Autorizado", "access level follows a successful customer read");
assert(view.apiStatus === "Operacional", "API status follows a successful customer read");
assert(view.refreshToken === "Configurado", "refresh token is present");
assert(view.clientId === "Configurado" && view.clientSecret === "Configurado", "client credentials are present");
assert(view.cloudProject === "demo-cloud-project", "cloud project is read from the environment");
assert(view.lastSynchronization !== "Não sincronizado", "account discovery records a sync time");
assert(view.accounts.length === 1, "one accessible account is stored");
assert(view.accounts[0]?.customerId === "1234567890", "the stored account keeps the customer id");
assert(!readFileSync(dbFile).toString("utf8").includes(":mutate"), "discovery does not record a mutate call");
const secrets = store.readGoogleAdsOAuthSecrets();
assert(secrets.refreshToken === REFRESH && secrets.clientSecret === SECRET, "stored secrets decrypt to the granted values");
const dumped = readFileSync(dbFile);
const dump = dumped.toString("utf8");
for (const hidden of [CLIENT, SECRET, DEVELOPER, REFRESH, ACCESS]) {
  assert(!dump.includes(hidden), "database file does not contain a credential plaintext");
}
const rendered = JSON.stringify(view);
for (const hidden of [CLIENT, SECRET, DEVELOPER, REFRESH, ACCESS]) {
  assert(!rendered.includes(hidden), "status payload does not contain a credential");
}

flow.disconnectStoredGoogleAds();
const disconnected = statusMod.readGoogleAdsIntegrationStatus();
assert(disconnected.connection === "Não conectado", "disconnect clears the connection");
assert(disconnected.refreshToken === "Não configurado", "disconnect removes the refresh token");
assert(disconnected.clientId === "Configurado" && disconnected.clientSecret === "Configurado", "disconnect keeps the client credentials");
assert(disconnected.customerId === "Não observado", "disconnect clears the customer id");
assert(store.readGoogleAdsOAuthSecrets().refreshToken === null, "refresh token ciphertext is gone");

const again = await flow.acceptGoogleAdsAuthorizationCode({
  code: "auth-code-second",
  codeVerifier: "verifier-second",
  transport: async (request) => {
    if (request.url.startsWith("https://oauth2.googleapis.com/token") && request.body?.includes("authorization_code")) {
      return tokenResponse(REFRESH_TWO);
    }
    return customers(true)(request);
  },
});
assert(again === "sucesso", "reconnect stores a new grant");
assert(store.readGoogleAdsOAuthSecrets().refreshToken === REFRESH_TWO, "reconnect replaces the refresh token");
assert(!readFileSync(dbFile).toString("utf8").includes(REFRESH_TWO), "the new refresh token is encrypted");

const refused = await flow.testStoredGoogleAdsConnection(customers(false));
assert(refused === "conta", "CustomerService refusal becomes a detailed account error");
const failed = statusMod.readGoogleAdsIntegrationStatus();
assert(failed.connection === "Erro", "a refused account is an error state");
assert(failed.lastError === "A conta do Google Ads não está acessível para este usuário.", "the error text is the account message");
assert(!JSON.stringify(failed).includes(ACCESS), "the error state does not echo the access token");

flow.disconnectStoredGoogleAds();
const missingScope = await flow.acceptGoogleAdsAuthorizationCode({
  code: "auth-code-scope",
  codeVerifier: "verifier-scope",
  transport: async (request) => {
    if (request.url.startsWith("https://oauth2.googleapis.com/token")) {
      return {
        httpStatus: 200,
        bodyText: JSON.stringify({
          access_token: ACCESS,
          refresh_token: REFRESH,
          expires_in: 3600,
          token_type: "Bearer",
          scope: "openid",
        }),
      };
    }
    return { httpStatus: 500, bodyText: "" };
  },
});
assert(missingScope === "escopo", "a grant without the Ads scope is refused");
assert(store.readGoogleAdsOAuthSecrets().refreshToken === null, "a refused scope does not store a refresh token");

delete process.env.GOOGLE_ADS_REDIRECT_URI;
const blocked = flow.prepareGoogleAdsConsent();
assert(!blocked.ok && blocked.notice === "configuracao", "a missing redirect URI blocks the consent screen");

console.log("GOOGLE_ADS_OAUTH_FOUNDATION_TEST=PASS");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "oauth foundation test failed");
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
