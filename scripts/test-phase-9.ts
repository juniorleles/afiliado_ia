// npx tsx scripts/test-phase-9.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { collectEnvIssues, looksLikeSecretKey, mediaStorageKind, originIsHttps } from "../src/lib/env.ts";
import { logEvent } from "../src/lib/logger.ts";
import { mintAdminSession, verifyAdminSession, ADMIN_COOKIE } from "../src/lib/admin-session.ts";
import { adminAuthRequired, requireAdminApi, verifyAdminPassword } from "../src/lib/admin-auth.ts";
import { assertSafeOutboundUrl } from "../src/lib/fetch-guard.ts";
import { validateManualProductUpload } from "../src/lib/product-image.ts";
import { migrate, resetDbForTests, getDb, schemaVersion } from "../src/lib/db.ts";
import { createCampaign, listPublishedCampaigns, publishCampaign } from "../src/lib/campaigns.ts";
import { securityHeaders } from "../src/lib/security-headers.ts";
import { CACHE_POLICY, cacheInvalidationAfter } from "../src/lib/cache-policy.ts";
import { createBackup, restoreBackup } from "./backup-presell-os.ts";
import { GET as healthGet } from "../src/app/api/health/route.ts";
import { s3SignedRequest } from "../src/lib/storage/object.ts";
import { SESSION_COOKIE } from "../src/lib/analytics.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function joinSrc(rel: string) {
  return path.join(process.cwd(), rel);
}

const prev = { ...process.env };

function campaignInput(slug: string) {
  return {
    name: "Phase 9 fixture",
    slug,
    headline: "How to Choose a Trail Bottle",
    body: "A trail bottle is a reusable flask for daily hiking.\n\n## Key Features\n\n- Stainless wall\n- Screw cap\n",
    ctaLabel: "Check Current Price",
    affiliateUrl: "https://example.com/hop",
    headScript: null,
    adHeadline: null,
  };
}

async function main() {
const issues = collectEnvIssues("production");
assert(issues.some((i) => i.name === "PUBLIC_SITE_URL" && i.fatal), "production requires canonical origin");
assert(issues.some((i) => i.name === "ADMIN_PASSWORD"), "production requires admin password");
assert(issues.some((i) => i.name === "CLICKBANK_INS_SECRET"), "production requires INS secret");
assert(originIsHttps("https://reviews.example"), "https origin accepted");
assert(!originIsHttps("http://reviews.example"), "http origin rejected");
assert(looksLikeSecretKey("CLICKBANK_INS_SECRET"), "INS secret classified SECRET");
assert(!looksLikeSecretKey("PUBLIC_SITE_NAME"), "site name is not SECRET");
assert(mediaStorageKind() === "LOCAL" || mediaStorageKind() === "OBJECT_STORAGE", "storage kind is explicit");

const example = readFileSync(joinSrc(".env.example"), "utf8");
assert(example.includes("ADMIN_PASSWORD"), ".env.example documents admin password");
assert(example.includes("SECRET"), ".env.example classifies secrets");
assert(!example.includes("NEXT_PUBLIC_ADMIN"), "admin secret is not NEXT_PUBLIC");

process.env.ADMIN_PASSWORD = "correct-horse";
assert(verifyAdminPassword("correct-horse"), "admin password verifies");
assert(!verifyAdminPassword("wrong"), "wrong admin password is rejected");

process.env.ADMIN_SESSION_SECRET = "session-secret-16";
const token = await mintAdminSession();
assert(Boolean(token), "admin session mints");
assert(await verifyAdminSession(token), "admin session verifies");
assert(!(await verifyAdminSession("v1.1.deadbeef")), "forged admin session is rejected");

process.env.AIA_ENV = "production";
process.env.ADMIN_PASSWORD = "pw";
process.env.ADMIN_SESSION_SECRET = "session-secret-16";
assert(adminAuthRequired(), "production requires admin auth");
const denied = await requireAdminApi(new Request("http://localhost/api/admin/design", { method: "POST" }));
assert(denied !== null && denied.status === 401, "admin API without session is 401");
process.env.AIA_ENV = "development";
process.env.ADMIN_PASSWORD = "";
assert(!adminAuthRequired(), "development without password does not force auth");

let blocked = false;
try {
  assertSafeOutboundUrl("http://127.0.0.1/secret");
} catch {
  blocked = true;
}
assert(blocked, "importer SSRF blocks loopback");
blocked = false;
try {
  assertSafeOutboundUrl("file:///etc/passwd");
} catch {
  blocked = true;
}
assert(blocked, "importer rejects non-http");
assert(assertSafeOutboundUrl("https://vendor.example/product").hostname === "vendor.example", "public https import host allowed");

const svg = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
const svgCheck = validateManualProductUpload(svg, "image/svg+xml");
assert(!svgCheck.ok, "SVG upload is rejected");
const html = Buffer.from("<!doctype html><script>alert(1)</script>");
assert(!validateManualProductUpload(html, "image/jpeg").ok, "HTML disguised as jpeg is rejected");

const headers = securityHeaders({ https: true, frameAncestors: "'none'" });
assert(headers["Content-Security-Policy"].includes("frame-ancestors 'none'"), "CSP sets frame-ancestors");
assert(headers["X-Content-Type-Options"] === "nosniff", "nosniff header");
assert(headers["Strict-Transport-Security"].includes("max-age"), "HSTS on https");
assert(headers["Content-Security-Policy"].includes("script-src 'self' 'unsafe-inline'"), "CSP allows required inline pixels");
assert(!headers["Content-Security-Policy"].includes("unsafe-eval"), "production CSP does not allow eval");
const devHeaders = securityHeaders({ https: false, frameAncestors: "'none'", scriptEval: true });
assert(devHeaders["Content-Security-Policy"].includes("unsafe-eval"), "localhost next dev allows webpack eval so Import facts hydrates");

const mw = readFileSync(joinSrc("src/middleware.ts"), "utf8");
assert(mw.includes('secure: https || isProduction()'), "tracking cookie Secure in production");
assert(mw.includes('sameSite: "lax"'), "tracking cookie SameSite=Lax");
assert(mw.includes('httpOnly: true'), "tracking cookie HttpOnly");
assert(mw.includes('ADMIN_COOKIE'), "middleware guards admin");
assert(mw.includes("/visual-frame"), "middleware classifies internal routes");
assert(mw.includes("/api/clickbank/ins"), "middleware classifies webhook");
assert(SESSION_COOKIE === "aia_sid" && ADMIN_COOKIE === "aia_adm", "cookie names unchanged");

const ins = readFileSync(joinSrc("src/app/api/clickbank/ins/route.ts"), "utf8");
assert(ins.includes('logEvent("INFO", "CLICKBANK_INS"'), "INS structured observability");
assert(!ins.includes("CLICKBANK_INS_SECRET}"), "INS handler does not print the secret");

assert(CACHE_POLICY.publishedHtml.includes("no-store"), "published HTML is not cached");
assert(cacheInvalidationAfter("publish").includes("no-store"), "publish invalidation documented");
assert(cacheInvalidationAfter("asset-replace").includes("content-hash"), "asset replace uses new hash URL");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-p9-"));
process.env.PRESELL_OS_DB = path.join(tmp, "os.db");
resetDbForTests();
migrate(getDb());
assert(schemaVersion() >= 1, "schema migrations recorded");
const draft = createCampaign(campaignInput("phase9-draft-only"));
assert(listPublishedCampaigns().every((c) => c.slug !== draft.slug), "drafts are absent from sitemap source");
const live = createCampaign(campaignInput("phase9-published-fixture"));
publishCampaign(live.id);
assert(listPublishedCampaigns().some((c) => c.slug === "phase9-published-fixture"), "published campaigns are sitemap-eligible");

const backupDir = path.join(tmp, "bak");
fs.mkdirSync(backupDir, { recursive: true });
process.env.PRESELL_OS_MEDIA = path.join(tmp, "media");
fs.mkdirSync(process.env.PRESELL_OS_MEDIA, { recursive: true });
fs.writeFileSync(path.join(process.env.PRESELL_OS_MEDIA, "aabbccddeeff001122334455.png"), Buffer.from("png"));
const made = createBackup("phase9-test");
assert(fs.existsSync(path.join(made, "presell-os.db")), "backup copies sqlite");
const restoredDb = path.join(tmp, "restored.db");
restoreBackup(made, restoredDb, path.join(tmp, "restored-media"));
assert(fs.existsSync(restoredDb), "restore writes sqlite");

const health = await healthGet();
assert(health.status === 200, "health endpoint 200 when db reachable");
const healthJson = (await health.json()) as { status?: string; database?: string };
assert(healthJson.status === "ok" && healthJson.database === "ok", "health body is non-secret");
assert(!JSON.stringify(healthJson).includes(tmp), "health does not leak filesystem path");

process.env.S3_BUCKET = "bucket";
process.env.S3_ACCESS_KEY_ID = "AKIATEST";
process.env.S3_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
process.env.S3_REGION = "us-east-1";
const signed = await s3SignedRequest({ method: "PUT", key: "aabb.png", body: Buffer.from("x"), contentType: "image/png", now: new Date("2013-05-24T00:00:00Z") });
assert(signed.headers.authorization.includes("AWS4-HMAC-SHA256"), "object storage signs requests");
assert(signed.url.includes("aabb.png"), "object storage key is not path-traversed");

const robotsSrc = readFileSync(joinSrc("src/app/robots.ts"), "utf8");
assert(robotsSrc.includes("/admin") && robotsSrc.includes("/visual-frame"), "robots still isolates admin and visual-frame");
assert(robotsSrc.includes("/preview"), "robots disallows draft recommended LP preview");
assert(robotsSrc.includes("sitemap"), "robots points at sitemap");
const mapSrc = readFileSync(joinSrc("src/app/sitemap.ts"), "utf8");
assert(mapSrc.includes("listPublishedCampaigns"), "sitemap uses published-only query");
assert(!mapSrc.includes("visual-frame"), "sitemap does not include visual-frame");

const errSrc = readFileSync(joinSrc("src/app/error.tsx"), "utf8");
assert(!errSrc.includes("stack") && !errSrc.includes("digest"), "public error UI has no stack traces");

const envSrc = readFileSync(joinSrc("src/lib/env.ts"), "utf8");
assert(!envSrc.includes("NEXT_PUBLIC_ADMIN_PASSWORD"), "admin password is not a public env");

let logged = "";
const orig = console.info;
console.info = (msg?: unknown) => {
  logged += String(msg);
};
logEvent("INFO", "AUTH", "probe", { ADMIN_PASSWORD: "super-secret-value", ok: true });
console.info = orig;
assert(logged.includes("[redacted]"), "structured logs redact secret fields");
assert(!logged.includes("super-secret-value"), "secret values are not printed");

resetDbForTests();
Object.assign(process.env, prev);
delete process.env.AIA_ENV;
delete process.env.ADMIN_PASSWORD;
delete process.env.ADMIN_SESSION_SECRET;
delete process.env.S3_BUCKET;
delete process.env.S3_ACCESS_KEY_ID;
delete process.env.S3_SECRET_ACCESS_KEY;
delete process.env.PRESELL_OS_DB;
delete process.env.PRESELL_OS_MEDIA;

console.log("\nTodos os testes da Phase 9 passaram.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
