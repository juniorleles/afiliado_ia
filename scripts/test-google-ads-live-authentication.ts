import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { GOOGLE_AUTH_CONTEXT_MEMBERS } from "../src/lib/google-ads-live/authentication-context.ts";
import {
  GOOGLE_AUTH_ORIGINS,
  GOOGLE_AUTH_PROVENANCE,
  GOOGLE_AUTH_REGISTRY_KEYS,
  GOOGLE_AUTH_RESULT_KEYS,
  GOOGLE_AUTH_SESSION_KEYS,
  GOOGLE_AUTH_SNAPSHOT_KEYS,
  GOOGLE_AUTH_STATISTICS_KEYS,
  GOOGLE_AUTH_STATUSES,
} from "../src/lib/google-ads-live/authentication-session.ts";
import { createGoogleAuthProvider } from "../src/lib/google-ads-live/google-auth-provider.ts";
import type { GoogleAuthHttpRequest, GoogleAuthTransport } from "../src/lib/google-ads-live/google-auth-client.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((item) => text.test(`${item.field} ${item.message}`));
const T0 = "2026-01-01T00:00:00.000Z";
const SECRETS = ["secret-marker", "refresh-marker", "developer-marker", "access-marker"];

function configuration(over: Record<string, unknown> = {}) {
  return {
    clientId: "client-marker",
    clientSecret: "secret-marker",
    developerToken: "developer-marker",
    refreshToken: "refresh-marker",
    ...over,
  };
}

function inputOf(over: Record<string, unknown> = {}) {
  return { configuration: configuration(), executionMetadata: { note: "kept" }, ...over };
}

type ScriptMode = "ok" | "expired" | "oauth" | "developer" | "empty" | "denied";

function scripted(mode: ScriptMode = "ok") {
  const calls: GoogleAuthHttpRequest[] = [];
  const transport: GoogleAuthTransport = async (request) => {
    calls.push({ url: request.url, method: request.method, headers: { ...request.headers }, body: request.body });
    if (request.url.endsWith("/token")) {
      if (mode === "expired") return { httpStatus: 400, bodyText: JSON.stringify({ error: "invalid_grant" }) };
      if (mode === "oauth") return { httpStatus: 401, bodyText: JSON.stringify({ error: "invalid_client" }) };
      return { httpStatus: 200, bodyText: JSON.stringify({ access_token: "access-marker", expires_in: 3600, token_type: "Bearer" }) };
    }
    if (request.url.includes("listAccessibleCustomers")) {
      if (mode === "developer") {
        return {
          httpStatus: 401,
          bodyText: JSON.stringify({ error: { details: [{ errors: [{ errorCode: { authenticationError: "DEVELOPER_TOKEN_INVALID" } }] }] } }),
        };
      }
      if (mode === "empty") return { httpStatus: 200, bodyText: JSON.stringify({ resourceNames: [] }) };
      if (mode === "denied") {
        return {
          httpStatus: 403,
          bodyText: JSON.stringify({ error: { details: [{ errors: [{ errorCode: { authorizationError: "USER_PERMISSION_DENIED" } }] }] } }),
        };
      }
      return { httpStatus: 200, bodyText: JSON.stringify({ resourceNames: ["customers/1111111111", "customers/2222222222"] }) };
    }
    if (request.body?.includes("customer_client")) {
      return {
        httpStatus: 200,
        bodyText: JSON.stringify({
          results: [{ customerClient: { clientCustomer: "customers/3333333333", level: "1", manager: false, descriptiveName: "Child Desk", currencyCode: "USD", timeZone: "America/New_York", status: "ENABLED", id: "3333333333" } }],
        }),
      };
    }
    if (request.url.includes("/customers/1111111111/")) {
      return {
        httpStatus: 200,
        bodyText: JSON.stringify({
          results: [{ customer: { id: "1111111111", descriptiveName: "Manager North", manager: true, currencyCode: "USD", timeZone: "America/New_York", status: "ENABLED" } }],
        }),
      };
    }
    if (request.url.includes("/customers/2222222222/")) {
      return {
        httpStatus: 200,
        bodyText: JSON.stringify({
          results: [{ customer: { id: "2222222222", descriptiveName: "Plain Account", manager: false, currencyCode: "USD", timeZone: "America/Chicago", status: "ENABLED" } }],
        }),
      };
    }
    return { httpStatus: 500, bodyText: "" };
  };
  return { calls, transport };
}

function provider(transport: GoogleAuthTransport, idFactory?: () => string) {
  let tick = 0;
  return createGoogleAuthProvider({ now: () => tick++, timestamp: () => T0, idFactory, transport });
}

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) out.push(...listTs(path));
    else if (name.name.endsWith(".ts")) out.push(path);
  }
  return out;
}

async function main() {
  check("statuses are OK and REJECTED", GOOGLE_AUTH_STATUSES.join() === "OK,REJECTED");
  check("origin is OBSERVED and provenance is DIRECT_SOURCE", GOOGLE_AUTH_ORIGINS.join() === "OBSERVED" && GOOGLE_AUTH_PROVENANCE.join() === "DIRECT_SOURCE");
  check("context members name the OAuth configuration and the metadata", GOOGLE_AUTH_CONTEXT_MEMBERS.join() === "configuration,executionMetadata,runtimeMetadata");

  const live = scripted();
  const input = inputOf();
  const host = provider(live.transport);
  const authenticated = await host.authenticate(input);
  input.configuration.clientId = "changed";
  input.executionMetadata.note = "changed";
  const stored = JSON.stringify(authenticated);
  const accounts = authenticated.accounts ?? [];
  check(
    "authentication returns the manager, the child, and the plain account",
    authenticated.status === "OK" &&
      accounts.map((account) => `${account.customerId}:${account.descriptiveName}:${account.manager}:${account.parentCustomerId ?? ""}`).join() ===
        "1111111111:Manager North:true:,2222222222:Plain Account:false:,3333333333:Child Desk:false:1111111111" &&
      authenticated.registry?.managerAccounts.map((account) => account.customerId).join() === "1111111111" &&
      authenticated.registry.childAccounts.map((account) => account.customerId).join() === "3333333333" &&
      authenticated.registry.accessibleCustomerIds.join() === "1111111111,2222222222" &&
      authenticated.session?.authenticated === true &&
      authenticated.session.tokenType === "Bearer" &&
      authenticated.session.expiresIn === 3600 &&
      authenticated.session.customerCount === 3 &&
      authenticated.evidence?.grantType === "refresh_token" &&
      authenticated.evidence.queries.map((query) => query.kind).join() === "customer,customer_client,customer" &&
      authenticated.statistics.accountCount === 3 &&
      authenticated.statistics.managerCount === 1 &&
      authenticated.statistics.childCount === 1 &&
      authenticated.statistics.accessibleCustomerCount === 2 &&
      authenticated.statistics.issueCount === 0 &&
      live.calls.length === 5 &&
      live.calls[0]?.body?.includes("grant_type=refresh_token") === true &&
      live.calls[0]?.body?.includes("refresh-marker") === true &&
      live.calls[1]?.headers["developer-token"] === "developer-marker" &&
      live.calls[1]?.headers.Authorization === "Bearer access-marker" &&
      Object.keys(authenticated).join() === GOOGLE_AUTH_RESULT_KEYS.join() &&
      Object.keys(authenticated.session ?? {}).join() === GOOGLE_AUTH_SESSION_KEYS.join() &&
      Object.keys(authenticated.registry ?? {}).join() === GOOGLE_AUTH_REGISTRY_KEYS.join() &&
      Object.keys(authenticated.statistics).join() === GOOGLE_AUTH_STATISTICS_KEYS.join() &&
      Object.keys(authenticated.snapshot ?? {}).join() === GOOGLE_AUTH_SNAPSHOT_KEYS.join(),
  );
  check(
    "the customer list is immutable and later input changes leave it unchanged",
    authenticated.snapshot !== null &&
      host.getSnapshot("google-auth-1") === authenticated.snapshot &&
      host.getSession("session-1") === authenticated.session &&
      Object.isFrozen(authenticated.snapshot) &&
      Object.isFrozen(authenticated.accounts) &&
      Object.isFrozen(authenticated.registry) &&
      Object.isFrozen(authenticated.session) &&
      authenticated.snapshot?.metadata.note === "kept" &&
      authenticated.snapshot.context.customerIds.join() === "1111111111,2222222222",
  );
  check("no secrets are stored on the session, the registry, or the snapshot", SECRETS.every((secret) => !stored.includes(secret)) && !stored.includes("client-marker"));

  const againScript = scripted();
  const again = await provider(againScript.transport).authenticate(inputOf());
  check(
    "a second provider reproduces the account list and keeps its own session",
    again.status === "OK" &&
      again.snapshot !== authenticated.snapshot &&
      JSON.stringify(again.accounts) === JSON.stringify(authenticated.accounts) &&
      JSON.stringify(again.registry?.accessibleCustomerIds) === JSON.stringify(authenticated.registry?.accessibleCustomerIds) &&
      host.getSnapshot("google-auth-1") !== null &&
      provider(scripted().transport).getSnapshot("google-auth-1") === null,
  );

  const missingScript = scripted();
  const missing = await provider(missingScript.transport).authenticate({ configuration: configuration({ clientSecret: "  " }), executionMetadata: { note: "kept" } });
  check("missing credentials store nothing and send no request", missing.status === "REJECTED" && has(missing.issues, /Missing Credentials/) && missing.snapshot === null && missing.accounts === null && missingScript.calls.length === 0);

  const expiredScript = scripted("expired");
  const expired = await provider(expiredScript.transport).authenticate(inputOf());
  check("an expired refresh token stores nothing", expired.status === "REJECTED" && has(expired.issues, /Expired Refresh Token/) && expired.snapshot === null && expiredScript.calls.length === 1);

  const oauthScript = scripted("oauth");
  const oauth = await provider(oauthScript.transport).authenticate(inputOf());
  check("invalid OAuth stores nothing", oauth.status === "REJECTED" && has(oauth.issues, /Invalid OAuth/) && oauth.snapshot === null && oauthScript.calls.length === 1);

  const developerScript = scripted("developer");
  const developer = await provider(developerScript.transport).authenticate(inputOf());
  check("an invalid developer token stores nothing", developer.status === "REJECTED" && has(developer.issues, /Invalid Developer Token/) && developer.snapshot === null && developerScript.calls.length === 2);

  const emptyScript = scripted("empty");
  const empty = await provider(emptyScript.transport).authenticate(inputOf());
  check("missing customer access stores nothing", empty.status === "REJECTED" && has(empty.issues, /Missing Customer Access/) && empty.snapshot === null && empty.registry === null);

  const deniedScript = scripted("denied");
  const denied = await provider(deniedScript.transport).authenticate(inputOf());
  check("a refused customer read stores nothing", denied.status === "REJECTED" && has(denied.issues, /Missing Customer Access/) && denied.snapshot === null);

  const nestedScript = scripted();
  const nested = await provider(nestedScript.transport).authenticate(inputOf({ executionMetadata: { nested: { inner: true } } }));
  check("nested metadata stores nothing and sends no request", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/) && nested.snapshot === null && nestedScript.calls.length === 0);

  const badId = await provider(scripted().transport, () => "BAD").authenticate(inputOf());
  check("a corrupted authentication id stores nothing", badId.status === "REJECTED" && has(badId.issues, /Invalid Metadata/) && badId.snapshot === null && host.getSnapshot("BAD") === null);

  const dir = join(process.cwd(), "src/lib/google-ads-live");
  const names = [
    "google-auth-provider.ts",
    "google-auth-client.ts",
    "oauth-manager.ts",
    "customer-manager.ts",
    "account-registry.ts",
    "authentication-validator.ts",
    "authentication-context.ts",
    "authentication-session.ts",
  ];
  check("eight authentication modules exist", names.every((name) => readdirSync(dir).includes(name)));
  const bundled = names.map((name) => readFileSync(join(dir, name), "utf8")).join("\n");
  const isCode = (line: string) => !/^\s*(\/\/|\/\*|\*)/.test(line);
  const code = bundled.split(/\r?\n/).filter(isCode);
  const clientSource = readFileSync(join(dir, "google-auth-client.ts"), "utf8");
  const otherSource = names.filter((name) => name !== "google-auth-client.ts").map((name) => readFileSync(join(dir, name), "utf8")).join("\n");
  check("no product names", !bundled.split(/\r?\n/).some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line)));
  check("the http client is the only retrieval path", /fetch\(/.test(clientSource) && !/fetch\(/.test(otherSource));
  check("credentials are not read from the environment", !code.some((line) => /process\.env|node:fs|readFileSync/.test(line)));
  check("no campaign, group, keyword, rsa, budget, or publish path in code", !code.some((line) => /\bcampaign\b|\bkeyword\b|\brsa\b|\bbudget\b|publish\(/i.test(line)));
  check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "authentication-context.ts"), "utf8")));
  check("authentication imports stay inside this folder", !code.some((line) => /from\s+["']\.\.\//.test(line)));
  const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform", "product-intelligence", "market-discovery", "search-intelligence", "search-provider", "real-landing-page", "real-product", "real-market-report", "opportunity-scoring", "opportunity-ranking", "opportunity-portfolio", "opportunity-recommendation"];
  for (const folder of folders) {
    const sources = listTs(join(process.cwd(), "src/lib", folder));
    check(`${folder} modules do not import live authentication`, !sources.some((file) => /google-ads-live/.test(readFileSync(file, "utf8"))));
  }

  if (failures > 0) {
    console.log(`GOOGLE_AUTH_LIVE_FAILURES=${failures}`);
    process.exit(1);
  }
  console.log("GOOGLE_AUTH_LIVE_FAILURES=0");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
