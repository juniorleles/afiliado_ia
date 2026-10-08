/**
 * Google Ads account discovery.
 * Uses a temporary database and a fake Google transport. Does not call Google
 * and does not mutate campaigns.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { GoogleAuthHttpRequest, GoogleAuthHttpResponse } from "../src/lib/google-ads-live/google-auth-client";

const root = mkdtempSync(path.join(tmpdir(), "gads-discovery-"));
const dbFile = path.join(root, "discovery.db");
process.env.PRESELL_OS_DB = dbFile;
process.env.ADMIN_SESSION_SECRET = "test-session-secret-value";
process.env.GOOGLE_ADS_CLIENT_ID = "client-discovery-example";
process.env.GOOGLE_ADS_CLIENT_SECRET = "secret-discovery-example";
process.env.GOOGLE_ADS_REDIRECT_URI = "http://127.0.0.1:3000/configuracoes/integracoes/google-ads/retorno";
process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "developer-discovery-example";
process.env.GOOGLE_CLOUD_PROJECT = "demo-cloud-project";
process.env.AIA_ENV = "test";

const MANAGER = "1111111111";
const CHILD = "2222222222";
const STANDARD = "3333333333";
const ACCESS = "access-discovery-example";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`OK: ${message}`);
}

function customer(id: string, name: string, manager: boolean, testAccount: boolean) {
  return {
    httpStatus: 200,
    bodyText: JSON.stringify({
      results: [{
        customer: {
          id,
          descriptiveName: name,
          manager,
          testAccount,
          currencyCode: "USD",
          timeZone: "America/Sao_Paulo",
          status: "ENABLED",
        },
      }],
    }),
  };
}

function role(value: string): GoogleAuthHttpResponse {
  return { httpStatus: 200, bodyText: JSON.stringify({ results: [{ customerUserAccess: { accessRole: value } }] }) };
}

function campaigns(): GoogleAuthHttpResponse {
  return {
    httpStatus: 200,
    bodyText: JSON.stringify({
      results: [
        { campaign: { id: "1", status: "ENABLED" } },
        { campaign: { id: "2", status: "ENABLED" } },
        { campaign: { id: "3", status: "PAUSED" } },
        { campaign: { id: "4", status: "REMOVED" } },
      ],
    }),
  };
}

const calls: string[] = [];

function transport(request: GoogleAuthHttpRequest): Promise<GoogleAuthHttpResponse> {
  calls.push(request.url);
  if (request.url.includes(":mutate")) throw new Error("mutate");
  if (request.url.startsWith("https://oauth2.googleapis.com/token")) {
    const code = request.body?.includes("grant_type=authorization_code");
    return Promise.resolve({
      httpStatus: 200,
      bodyText: JSON.stringify({
        access_token: ACCESS,
        expires_in: 3600,
        token_type: "Bearer",
        scope: "https://www.googleapis.com/auth/adwords",
        ...(code ? { refresh_token: "refresh-discovery-example" } : {}),
      }),
    });
  }
  if (request.url.endsWith("/customers:listAccessibleCustomers")) {
    return Promise.resolve({
      httpStatus: 200,
      bodyText: JSON.stringify({ resourceNames: [`customers/${MANAGER}`, `customers/${STANDARD}`] }),
    });
  }
  const customerId = /customers\/(\d+)\//.exec(request.url)?.[1] ?? "";
  const query = request.body ? String(JSON.parse(request.body).query) : "";
  if (customerId === CHILD && request.headers["login-customer-id"] !== MANAGER) {
    throw new Error("child account was read without its manager");
  }
  if (query.includes("customer_client")) {
    return Promise.resolve({
      httpStatus: 200,
      bodyText: JSON.stringify({
        results: [{
          customerClient: {
            clientCustomer: `customers/${CHILD}`,
            id: CHILD,
            level: "1",
            manager: false,
            descriptiveName: "Conta filha",
            currencyCode: "USD",
            timeZone: "America/Sao_Paulo",
            status: "ENABLED",
          },
        }],
      }),
    });
  }
  if (query.includes("test_account")) {
    if (customerId === MANAGER) return Promise.resolve(customer(MANAGER, "Conta gerente", true, false));
    if (customerId === CHILD) return Promise.resolve(customer(CHILD, "Conta filha", false, true));
    return Promise.resolve(customer(STANDARD, "Conta padrão", false, false));
  }
  if (query.includes("descriptive_name")) {
    if (customerId === MANAGER) return Promise.resolve(customer(MANAGER, "Conta gerente", true, false));
    return Promise.resolve(customer(STANDARD, "Conta padrão", false, false));
  }
  if (query.includes("access_role")) {
    if (customerId === MANAGER) return Promise.resolve(role("READ_ONLY"));
    if (customerId === CHILD) return Promise.resolve(role("ADMIN"));
    return Promise.resolve(role("STANDARD"));
  }
  if (query.includes("campaign.status")) return Promise.resolve(campaigns());
  return Promise.resolve({ httpStatus: 200, bodyText: JSON.stringify({ results: [] }) });
}

async function main(): Promise<void> {
  const source = readFileSync(path.join(process.cwd(), "src/lib/integrations/google-ads-oauth/discovery.ts"), "utf8");
  assert(!source.includes("googleAds:mutate"), "discovery source has no mutate endpoint");
  const flow = await import("../src/lib/integrations/google-ads-oauth/flow.ts");
  const statusMod = await import("../src/lib/integrations/google-ads-oauth/status.ts");
  const db = await import("../src/lib/db.ts");
  const before = db.getDb().prepare("SELECT COUNT(*) AS n FROM campaigns").get() as { n: number };
  const accepted = await flow.acceptGoogleAdsAuthorizationCode({
    code: "auth-code-discovery",
    codeVerifier: "verifier-discovery",
    transport,
  });
  assert(accepted === "sucesso", "oauth discovery completes");
  const view = statusMod.readGoogleAdsIntegrationStatus();
  assert(view.accounts.length === 3, "manager, child, and standard accounts are stored");
  assert(view.accounts.filter((account) => account.selected).length === 0, "several accounts wait for a selection");
  assert(view.customerId === "Não selecionada", "no customer is active before selection");
  const manager = view.accounts.find((account) => account.customerId === MANAGER);
  const child = view.accounts.find((account) => account.customerId === CHILD);
  const standard = view.accounts.find((account) => account.customerId === STANDARD);
  assert(manager?.manager === true && manager.permissions.campaignWrite === "missing", "a read-only manager does not receive write");
  assert(child?.testAccount === true && child.permissions.campaignWrite === "granted", "the child test account keeps an admin role");
  assert(standard?.currencyCode === "USD" && standard.timeZone === "America/Sao_Paulo", "currency and time zone are stored");
  assert(standard?.campaignCount === 4 && standard.enabledCount === 2 && standard.pausedCount === 1 && standard.removedCount === 1, "campaign counts are read");
  assert(standard?.permissions.campaignRead === "granted" && standard.permissions.adGroup === "granted", "read probes are granted");
  assert(view.syncLabel === "Conectado", "sync state is connected");
  assert(view.apiVersion === "v21", "api version is recorded");
  assert(view.cloudProject === "demo-cloud-project", "cloud project is shown");
  assert(view.oauthClient === "Configurado", "oauth client presence is shown");
  const selected = flow.activateGoogleAdsAccount(STANDARD);
  assert(selected, "the operator selects one account");
  const after = statusMod.readGoogleAdsIntegrationStatus();
  assert(after.accounts.filter((account) => account.selected).length === 1, "only one account stays active");
  assert(after.customerId === STANDARD && after.account === "Conta padrão", "the dashboard follows the active account");
  assert(after.campaignCount === "4" && after.pausedCount === "1" && after.enabledCount === "2" && after.removedCount === "1", "dashboard counts follow the active account");
  assert(after.permissions.campaignWrite === "granted", "the active account shows write from its role");
  assert(after.latency !== "Não medida", "latency is recorded");
  const again = await flow.acceptGoogleAdsAuthorizationCode({
    code: "auth-code-reconnect",
    codeVerifier: "verifier-reconnect",
    transport,
  });
  assert(again === "sucesso", "reconnect discovers accounts again");
  const reconnected = statusMod.readGoogleAdsIntegrationStatus();
  assert(reconnected.accounts.length === 3 && reconnected.customerId === STANDARD, "reconnect keeps the selected account");
  flow.disconnectStoredGoogleAds();
  const cleared = statusMod.readGoogleAdsIntegrationStatus();
  assert(cleared.accounts.length === 0 && cleared.syncLabel === "Desconectado", "disconnect removes discovered accounts");
  const afterCount = db.getDb().prepare("SELECT COUNT(*) AS n FROM campaigns").get() as { n: number };
  assert(before.n === afterCount.n, "local campaigns are unchanged");
  assert(calls.length > 0 && calls.every((url) => !url.includes(":mutate")), "no mutate request was sent");
  assert(calls.some((url) => url.includes(`/customers/${CHILD}/`)), "a child account is read through its manager");
  console.log("GOOGLE_ADS_ACCOUNT_DISCOVERY_TEST=PASS");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "account discovery test failed");
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
