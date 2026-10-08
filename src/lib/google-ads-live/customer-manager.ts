/**
 * Host record domain: customer manager.
 *
 * Lists accessible customers, then reads each customer and the children of a
 * manager account. Account text is copied from the response.
 */
import {
  googleAdsRequestHeaders,
  googleAdsRoot,
  googleAuthErrorCodes,
  isGoogleAuthRecord,
  parseGoogleAuthJson,
  type GoogleAuthHttpClient,
} from "./google-auth-client";
import type { GoogleAuthAccount, GoogleAuthIssue, GoogleAuthQueryRecord } from "./authentication-session";

export const CUSTOMER_QUERY = "SELECT customer.id, customer.descriptive_name, customer.manager, customer.currency_code, customer.time_zone, customer.status FROM customer";
export const CUSTOMER_CLIENT_QUERY = "SELECT customer_client.client_customer, customer_client.level, customer_client.manager, customer_client.descriptive_name, customer_client.currency_code, customer_client.time_zone, customer_client.status, customer_client.id FROM customer_client";
export const MAX_ACCOUNT_PAGES = 10;

const DEVELOPER = new Set(["DEVELOPER_TOKEN_INVALID", "DEVELOPER_TOKEN_NOT_APPROVED"]);
const ACCESS = new Set(["USER_PERMISSION_DENIED", "CUSTOMER_NOT_ENABLED", "ACTION_NOT_PERMITTED", "DEVELOPER_TOKEN_PROHIBITED", "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION"]);

export interface GoogleAuthCustomerRead {
  accounts: GoogleAuthAccount[];
  children: GoogleAuthAccount[];
  accessibleCustomerIds: string[];
  accessibleResourceNames: string[];
  queries: GoogleAuthQueryRecord[];
}

export type GoogleAuthCustomerResult =
  | { ok: true; read: GoogleAuthCustomerRead }
  | { ok: false; issues: GoogleAuthIssue[] };

function customerIdOf(resourceName: string): string | null {
  const match = /^customers\/(\d+)$/.exec(resourceName.trim());
  return match?.[1] ?? null;
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" ? null : text;
}

function booleanOf(value: unknown): boolean {
  return value === true;
}

function levelOf(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function failure(parsed: unknown, httpStatus: number): GoogleAuthIssue | null {
  const codes = googleAuthErrorCodes(parsed);
  if (codes.some((code) => DEVELOPER.has(code))) {
    return { field: "configuration.developerToken", message: "Invalid Developer Token: the developer token was refused." };
  }
  if (codes.some((code) => ACCESS.has(code)) || httpStatus === 403) {
    return { field: "accounts", message: "Missing Customer Access: the grant cannot read a customer." };
  }
  if (httpStatus === 401 || codes.length > 0) {
    return { field: "configuration", message: "Invalid OAuth: the account service refused the grant." };
  }
  if (httpStatus !== 200) {
    return { field: "accounts", message: "Missing Customer Access: the account service did not return a customer list." };
  }
  return null;
}

function accountFromCustomer(record: Record<string, unknown>, customerId: string): GoogleAuthAccount {
  return {
    customerId,
    resourceName: `customers/${customerId}`,
    descriptiveName: textOrNull(record.descriptiveName),
    manager: booleanOf(record.manager),
    currencyCode: textOrNull(record.currencyCode),
    timeZone: textOrNull(record.timeZone),
    status: textOrNull(record.status),
    parentCustomerId: null,
    level: null,
  };
}

function accountFromClient(record: Record<string, unknown>, parentCustomerId: string): GoogleAuthAccount | null {
  const fromResource = textOrNull(record.clientCustomer);
  const customerId = (fromResource ? customerIdOf(fromResource) : null) ?? textOrNull(record.id);
  if (customerId === null || !/^\d+$/.test(customerId)) return null;
  return {
    customerId,
    resourceName: `customers/${customerId}`,
    descriptiveName: textOrNull(record.descriptiveName),
    manager: booleanOf(record.manager),
    currencyCode: textOrNull(record.currencyCode),
    timeZone: textOrNull(record.timeZone),
    status: textOrNull(record.status),
    parentCustomerId,
    level: levelOf(record.level),
  };
}

async function search(client: GoogleAuthHttpClient, root: string, customerId: string, developerToken: string, accessToken: string, query: string): Promise<{ httpStatus: number; parsed: unknown }> {
  const pages: unknown[] = [];
  let pageToken = "";
  let httpStatus = 0;
  let parsed: unknown = null;
  for (let page = 0; page < MAX_ACCOUNT_PAGES; page += 1) {
    const payload: Record<string, string> = { query };
    if (pageToken !== "") payload.pageToken = pageToken;
    const response = await client.send({
      url: `${root}/customers/${customerId}/googleAds:search`,
      method: "POST",
      headers: googleAdsRequestHeaders(accessToken, true),
      body: JSON.stringify(payload),
    });
    httpStatus = response.httpStatus;
    parsed = parseGoogleAuthJson(response.bodyText);
    const refused = failure(parsed, httpStatus);
    if (refused) return { httpStatus, parsed };
    if (!isGoogleAuthRecord(parsed)) return { httpStatus: 0, parsed: null };
    const results = Array.isArray(parsed.results) ? parsed.results : [];
    pages.push(...results);
    const next = textOrNull(parsed.nextPageToken);
    if (next === null) return { httpStatus, parsed: { results: pages } };
    pageToken = next;
  }
  return { httpStatus: 0, parsed: { error: "PAGE_LIMIT" } };
}

export async function readCustomers(client: GoogleAuthHttpClient, apiVersion: string, developerToken: string, accessToken: string): Promise<GoogleAuthCustomerResult> {
  const root = googleAdsRoot(apiVersion);
  const listed = await client.send({
    url: `${root}/customers:listAccessibleCustomers`,
    method: "GET",
    headers: googleAdsRequestHeaders(accessToken),
  });
  const listedBody = parseGoogleAuthJson(listed.bodyText);
  const listedFailure = failure(listedBody, listed.httpStatus);
  if (listedFailure) return { ok: false, issues: [listedFailure] };
  if (!isGoogleAuthRecord(listedBody) || !Array.isArray(listedBody.resourceNames)) {
    return { ok: false, issues: [{ field: "accounts", message: "Missing Customer Access: the account service did not return a customer list." }] };
  }
  const accessibleResourceNames: string[] = [];
  const accessibleCustomerIds: string[] = [];
  for (const name of listedBody.resourceNames) {
    if (typeof name !== "string") {
      return { ok: false, issues: [{ field: "accounts", message: "Missing Customer Access: a customer resource name is required." }] };
    }
    const customerId = customerIdOf(name);
    if (customerId === null) {
      return { ok: false, issues: [{ field: "accounts", message: "Missing Customer Access: a customer resource name is required." }] };
    }
    accessibleResourceNames.push(`customers/${customerId}`);
    accessibleCustomerIds.push(customerId);
  }
  if (accessibleCustomerIds.length === 0) {
    return { ok: false, issues: [{ field: "accounts", message: "Missing Customer Access: no customer is available to this grant." }] };
  }
  const accounts: GoogleAuthAccount[] = [];
  const children: GoogleAuthAccount[] = [];
  const queries: GoogleAuthQueryRecord[] = [];
  for (const customerId of accessibleCustomerIds) {
    queries.push({ customerId, kind: "customer", query: CUSTOMER_QUERY });
    const found = await search(client, root, customerId, developerToken, accessToken, CUSTOMER_QUERY);
    const foundFailure = failure(found.parsed, found.httpStatus);
    if (foundFailure) return { ok: false, issues: [foundFailure] };
    if (!isGoogleAuthRecord(found.parsed) || !Array.isArray(found.parsed.results) || found.parsed.results.length === 0) {
      return { ok: false, issues: [{ field: "accounts", message: "Missing Customer Access: a customer record was not returned." }] };
    }
    const row = found.parsed.results[0];
    if (!isGoogleAuthRecord(row) || !isGoogleAuthRecord(row.customer)) {
      return { ok: false, issues: [{ field: "accounts", message: "Missing Customer Access: a customer record was not returned." }] };
    }
    const account = accountFromCustomer(row.customer, customerId);
    accounts.push(account);
    if (!account.manager) continue;
    queries.push({ customerId, kind: "customer_client", query: CUSTOMER_CLIENT_QUERY });
    const clients = await search(client, root, customerId, developerToken, accessToken, CUSTOMER_CLIENT_QUERY);
    const clientFailure = failure(clients.parsed, clients.httpStatus);
    if (clientFailure) return { ok: false, issues: [clientFailure] };
    if (!isGoogleAuthRecord(clients.parsed) || !Array.isArray(clients.parsed.results)) {
      return { ok: false, issues: [{ field: "accounts", message: "Missing Customer Access: a manager did not return its child accounts." }] };
    }
    for (const clientRow of clients.parsed.results) {
      if (!isGoogleAuthRecord(clientRow) || !isGoogleAuthRecord(clientRow.customerClient)) {
        return { ok: false, issues: [{ field: "accounts", message: "Missing Customer Access: a child account record was not returned." }] };
      }
      const child = accountFromClient(clientRow.customerClient, customerId);
      if (child === null) {
        return { ok: false, issues: [{ field: "accounts", message: "Missing Customer Access: a child account record was not returned." }] };
      }
      if (child.customerId === customerId || child.level === 0) continue;
      children.push(child);
    }
  }
  return {
    ok: true,
    read: { accounts, children, accessibleCustomerIds, accessibleResourceNames, queries },
  };
}
