/**
 * Host record domain: authentication HTTP client.
 *
 * Builds one request and returns the response text. The caller supplies the
 * address, headers, and body. This file is the only place a retrieval runs.
 */
export const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_ADS_API_VERSION = "v21";

export interface GoogleAuthHttpRequest {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
}

export interface GoogleAuthHttpResponse {
  httpStatus: number;
  bodyText: string;
}

export type GoogleAuthTransport = (request: GoogleAuthHttpRequest) => Promise<GoogleAuthHttpResponse>;

export interface GoogleAuthHttpClient {
  send(request: GoogleAuthHttpRequest): Promise<GoogleAuthHttpResponse>;
}

const defaultTransport: GoogleAuthTransport = async (request) => {
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });
    return { httpStatus: response.status, bodyText: await response.text() };
  } catch {
    return { httpStatus: 0, bodyText: "" };
  }
};

export function createGoogleAuthHttpClient(transport: GoogleAuthTransport = defaultTransport): GoogleAuthHttpClient {
  return {
    async send(request) {
      try {
        return await transport(request);
      } catch {
        return { httpStatus: 0, bodyText: "" };
      }
    },
  };
}

export function googleAdsRoot(apiVersion: string): string {
  return `https://googleads.googleapis.com/${apiVersion}`;
}

export function parseGoogleAuthJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function isGoogleAuthRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Collects named error codes from a response body. Does not return the body text. */
export function googleAuthErrorCodes(value: unknown): string[] {
  const found: string[] = [];
  const visit = (inner: unknown): void => {
    if (Array.isArray(inner)) {
      for (const item of inner) visit(item);
      return;
    }
    if (!isGoogleAuthRecord(inner)) return;
    const authenticationError = inner.authenticationError;
    const authorizationError = inner.authorizationError;
    const error = inner.error;
    if (typeof authenticationError === "string") found.push(authenticationError);
    if (typeof authorizationError === "string") found.push(authorizationError);
    if (typeof error === "string") found.push(error);
    for (const child of Object.values(inner)) visit(child);
  };
  visit(value);
  return found;
}
