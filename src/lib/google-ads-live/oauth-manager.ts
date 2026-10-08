/**
 * Host record domain: OAuth manager.
 *
 * Exchanges an authorization code or a refresh token for a short-lived grant.
 * The grant stays in the return value for the caller and is not written into
 * a session.
 */
import {
  GOOGLE_OAUTH_TOKEN_URL,
  googleAuthErrorCodes,
  parseGoogleAuthJson,
  isGoogleAuthRecord,
  type GoogleAuthHttpClient,
} from "./google-auth-client";
import type { GoogleAuthIssue } from "./authentication-session";

export interface GoogleAuthGrant {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}

export type GoogleAuthOauthResult =
  | { ok: true; grant: GoogleAuthGrant }
  | { ok: false; issues: GoogleAuthIssue[] };

const EXPIRED = new Set(["invalid_grant"]);
const OAUTH = new Set(["invalid_client", "unauthorized_client", "invalid_request", "OAUTH_TOKEN_INVALID", "OAUTH_TOKEN_EXPIRED", "OAUTH_TOKEN_REVOKED"]);

export interface GoogleAuthCredentialSet {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export async function exchangeRefreshToken(client: GoogleAuthHttpClient, credentials: GoogleAuthCredentialSet): Promise<GoogleAuthOauthResult> {
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", credentials.refreshToken);
  body.set("client_id", credentials.clientId);
  body.set("client_secret", credentials.clientSecret);
  const response = await client.send({
    url: GOOGLE_OAUTH_TOKEN_URL,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
  });
  const parsed = parseGoogleAuthJson(response.bodyText);
  const codes = new Set(googleAuthErrorCodes(parsed));
  if ([...codes].some((code) => EXPIRED.has(code))) {
    return { ok: false, issues: [{ field: "configuration.refreshToken", message: "Expired Refresh Token: the refresh token was refused." }] };
  }
  if ([...codes].some((code) => OAUTH.has(code)) || response.httpStatus === 401 || response.httpStatus === 400) {
    return { ok: false, issues: [{ field: "configuration", message: "Invalid OAuth: the token service refused the configuration." }] };
  }
  if (response.httpStatus !== 200 || !isGoogleAuthRecord(parsed) || typeof parsed.access_token !== "string" || parsed.access_token.trim() === "") {
    return { ok: false, issues: [{ field: "configuration", message: "Invalid OAuth: the token service did not return a grant." }] };
  }
  const expiresIn = parsed.expires_in;
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    return { ok: false, issues: [{ field: "configuration", message: "Invalid OAuth: the token service did not return a grant lifetime." }] };
  }
  const tokenType = typeof parsed.token_type === "string" && parsed.token_type.trim() !== "" ? parsed.token_type.trim() : "Bearer";
  return { ok: true, grant: { accessToken: parsed.access_token, tokenType, expiresIn } };
}

export interface GoogleAuthAuthorizationCode {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}

export interface GoogleAuthAuthorizationGrant extends GoogleAuthGrant {
  refreshToken: string;
  scope: string | null;
}

export type GoogleAuthAuthorizationResult =
  | { ok: true; grant: GoogleAuthAuthorizationGrant }
  | { ok: false; issues: GoogleAuthIssue[] };

export async function exchangeAuthorizationCode(
  client: GoogleAuthHttpClient,
  credentials: GoogleAuthAuthorizationCode,
): Promise<GoogleAuthAuthorizationResult> {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", credentials.code);
  body.set("client_id", credentials.clientId);
  body.set("client_secret", credentials.clientSecret);
  body.set("redirect_uri", credentials.redirectUri);
  body.set("code_verifier", credentials.codeVerifier);
  const response = await client.send({
    url: GOOGLE_OAUTH_TOKEN_URL,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
  });
  const parsed = parseGoogleAuthJson(response.bodyText);
  const codes = new Set(googleAuthErrorCodes(parsed));
  if ([...codes].some((code) => EXPIRED.has(code))) {
    return { ok: false, issues: [{ field: "configuration.code", message: "Expired Authorization Code: the authorization code was refused." }] };
  }
  if ([...codes].some((code) => OAUTH.has(code)) || response.httpStatus === 401 || response.httpStatus === 400) {
    return { ok: false, issues: [{ field: "configuration", message: "Invalid OAuth: the token service refused the authorization code." }] };
  }
  if (response.httpStatus !== 200 || !isGoogleAuthRecord(parsed) || typeof parsed.access_token !== "string" || parsed.access_token.trim() === "") {
    return { ok: false, issues: [{ field: "configuration", message: "Invalid OAuth: the token service did not return a grant." }] };
  }
  if (typeof parsed.refresh_token !== "string" || parsed.refresh_token.trim() === "") {
    return { ok: false, issues: [{ field: "configuration.refreshToken", message: "Invalid OAuth: the consent response did not include a refresh token." }] };
  }
  const expiresIn = parsed.expires_in;
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    return { ok: false, issues: [{ field: "configuration", message: "Invalid OAuth: the token service did not return a grant lifetime." }] };
  }
  const tokenType = typeof parsed.token_type === "string" && parsed.token_type.trim() !== "" ? parsed.token_type.trim() : "Bearer";
  const scope = typeof parsed.scope === "string" && parsed.scope.trim() !== "" ? parsed.scope.trim() : null;
  return {
    ok: true,
    grant: {
      accessToken: parsed.access_token,
      tokenType,
      expiresIn,
      refreshToken: parsed.refresh_token.trim(),
      scope,
    },
  };
}
