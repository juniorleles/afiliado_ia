/**
 * Google Ads OAuth authorization-code flow.
 *
 * The consent URL is built here. Token exchange and CustomerService reuse the
 * live Google Ads client. Access tokens are not stored.
 */
import { createHash, randomBytes } from "node:crypto";
import { GOOGLE_ADS_API_VERSION, createGoogleAuthHttpClient, type GoogleAuthTransport } from "@/lib/google-ads-live/google-auth-client";
import { readCustomers } from "@/lib/google-ads-live/customer-manager";
import { exchangeAuthorizationCode, exchangeRefreshToken } from "@/lib/google-ads-live/oauth-manager";
import { googleAdsEncryptionReady } from "./cipher";
import { googleAdsEnvironmentReady, readGoogleAdsEnvironment } from "./environment";
import {
  clearGoogleAdsSession,
  readGoogleAdsOAuthSecrets,
  saveGoogleAdsClientCredentials,
  saveGoogleAdsRefreshToken,
  writeGoogleAdsConnection,
} from "./store";

export const GOOGLE_ADS_OAUTH_SCOPE = "https://www.googleapis.com/auth/adwords";
export const GOOGLE_ADS_CONSENT_ORIGIN = "https://accounts.google.com";

export type GoogleAdsOAuthNotice =
  | "sucesso"
  | "desconectado"
  | "configuracao"
  | "chave"
  | "sessao"
  | "estado"
  | "codigo"
  | "token"
  | "escopo"
  | "teste"
  | "desenvolvedor"
  | "conta";

export function createPkcePair(): { verifier: string; challenge: string; state: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("hex");
  return { verifier, challenge, state };
}

export function buildGoogleAdsConsentUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL("/o/oauth2/v2/auth", GOOGLE_ADS_CONSENT_ORIGIN);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_ADS_OAUTH_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export function prepareGoogleAdsConsent():
  | { ok: true; url: string; state: string; verifier: string }
  | { ok: false; notice: GoogleAdsOAuthNotice } {
  if (!googleAdsEncryptionReady()) return { ok: false, notice: "chave" };
  const env = readGoogleAdsEnvironment();
  if (!googleAdsEnvironmentReady(env) || !env.clientId || !env.clientSecret || !env.redirectUri) {
    return { ok: false, notice: "configuracao" };
  }
  const saved = saveGoogleAdsClientCredentials(env.clientId, env.clientSecret, env.appEnv);
  if (!saved) return { ok: false, notice: "chave" };
  const pkce = createPkcePair();
  return {
    ok: true,
    url: buildGoogleAdsConsentUrl({
      clientId: env.clientId,
      redirectUri: env.redirectUri,
      state: pkce.state,
      codeChallenge: pkce.challenge,
    }),
    state: pkce.state,
    verifier: pkce.verifier,
  };
}

function scopeAllowsAds(scope: string | null): boolean {
  if (scope === null) return true;
  return scope.split(/\s+/).includes(GOOGLE_ADS_OAUTH_SCOPE);
}

function publicFailure(message: string): GoogleAdsOAuthNotice {
  if (message.startsWith("Expired Refresh Token") || message.startsWith("Expired Authorization Code")) return "token";
  if (message.startsWith("Invalid Developer Token")) return "desenvolvedor";
  if (message.startsWith("Missing Customer Access")) return "conta";
  if (message.includes("refresh token")) return "token";
  return "teste";
}

function failureText(notice: GoogleAdsOAuthNotice): string {
  if (notice === "desenvolvedor") return "O token de desenvolvedor não está configurado ou foi recusado.";
  if (notice === "conta") return "A conta do Google Ads não está acessível para este usuário.";
  if (notice === "token") return "O Google recusou o token. Conecte a conta de novo.";
  if (notice === "escopo") return "Os escopos autorizados não incluem o Google Ads.";
  return "A conexão com o Google Ads falhou.";
}

function credentialsForRefresh(): { clientId: string; clientSecret: string; refreshToken: string } | null {
  const env = readGoogleAdsEnvironment();
  const stored = readGoogleAdsOAuthSecrets();
  const clientId = env.clientId || stored.clientId;
  const clientSecret = env.clientSecret || stored.clientSecret;
  if (!clientId || !clientSecret || !stored.refreshToken) return null;
  return { clientId, clientSecret, refreshToken: stored.refreshToken };
}

export async function acceptGoogleAdsAuthorizationCode(input: {
  code: string;
  codeVerifier: string;
  transport?: GoogleAuthTransport;
}): Promise<GoogleAdsOAuthNotice> {
  if (!googleAdsEncryptionReady()) return "chave";
  const env = readGoogleAdsEnvironment();
  if (!googleAdsEnvironmentReady(env) || !env.clientId || !env.clientSecret || !env.redirectUri) return "configuracao";
  const saved = saveGoogleAdsClientCredentials(env.clientId, env.clientSecret, env.appEnv);
  if (!saved) return "chave";
  const client = createGoogleAuthHttpClient(input.transport);
  const exchanged = await exchangeAuthorizationCode(client, {
    clientId: env.clientId,
    clientSecret: env.clientSecret,
    code: input.code,
    redirectUri: env.redirectUri,
    codeVerifier: input.codeVerifier,
  });
  if (!exchanged.ok) return publicFailure(exchanged.issues[0]?.message ?? "");
  if (!scopeAllowsAds(exchanged.grant.scope)) return "escopo";
  const stored = saveGoogleAdsRefreshToken(exchanged.grant.refreshToken);
  if (!stored) return "chave";
  return checkCustomers(exchanged.grant.accessToken, input.transport);
}

async function checkCustomers(accessToken: string, transport?: GoogleAuthTransport): Promise<GoogleAdsOAuthNotice> {
  const env = readGoogleAdsEnvironment();
  if (!env.developerToken) {
    writeGoogleAdsConnection({
      oauthStatus: "connected",
      apiStatus: "error",
      customerId: null,
      loginCustomerId: env.loginCustomerId,
      accountName: null,
      accessLevel: "Não verificado",
      lastConnectionAt: new Date().toISOString(),
      lastError: failureText("desenvolvedor"),
    });
    return "desenvolvedor";
  }
  const client = createGoogleAuthHttpClient(transport);
  const customers = await readCustomers(client, GOOGLE_ADS_API_VERSION, env.developerToken, accessToken);
  if (!customers.ok) {
    const notice = publicFailure(customers.issues[0]?.message ?? "");
    writeGoogleAdsConnection({
      oauthStatus: "connected",
      apiStatus: "error",
      customerId: null,
      loginCustomerId: env.loginCustomerId,
      accountName: null,
      accessLevel: notice === "conta" ? "Não autorizado" : "Não verificado",
      lastConnectionAt: new Date().toISOString(),
      lastError: failureText(notice),
    });
    return notice;
  }
  const account = customers.read.accounts[0];
  const manager = customers.read.accounts.find((item) => item.manager);
  writeGoogleAdsConnection({
    oauthStatus: "connected",
    apiStatus: "success",
    customerId: account?.customerId ?? customers.read.accessibleCustomerIds[0] ?? null,
    loginCustomerId: env.loginCustomerId ?? manager?.customerId ?? null,
    accountName: account?.descriptiveName ?? null,
    accessLevel: "Autorizado",
    lastConnectionAt: new Date().toISOString(),
    lastError: null,
  });
  return "sucesso";
}

export async function testStoredGoogleAdsConnection(transport?: GoogleAuthTransport): Promise<GoogleAdsOAuthNotice> {
  const credentials = credentialsForRefresh();
  if (!credentials) return "token";
  const env = readGoogleAdsEnvironment();
  if (!env.developerToken) {
    writeGoogleAdsConnection({
      oauthStatus: "connected",
      apiStatus: "error",
      customerId: null,
      loginCustomerId: env.loginCustomerId,
      accountName: null,
      accessLevel: "Não verificado",
      lastConnectionAt: new Date().toISOString(),
      lastError: failureText("desenvolvedor"),
    });
    return "desenvolvedor";
  }
  const client = createGoogleAuthHttpClient(transport);
  const oauth = await exchangeRefreshToken(client, credentials);
  if (!oauth.ok) {
    writeGoogleAdsConnection({
      oauthStatus: "error",
      apiStatus: "error",
      customerId: null,
      loginCustomerId: env.loginCustomerId,
      accountName: null,
      accessLevel: "Não autorizado",
      lastConnectionAt: new Date().toISOString(),
      lastError: failureText(publicFailure(oauth.issues[0]?.message ?? "")),
    });
    return publicFailure(oauth.issues[0]?.message ?? "");
  }
  return checkCustomers(oauth.grant.accessToken, transport);
}

export function disconnectStoredGoogleAds(): void {
  clearGoogleAdsSession();
}
