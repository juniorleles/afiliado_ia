// npx tsx scripts/test-analytics.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { migrate, resetDbForTests } from "../src/lib/db.ts";
import { createCampaign } from "../src/lib/campaigns.ts";
import { readyPublicationInput } from "./fixtures/ready-publication-campaign.ts";
import { publishCampaign } from "../src/lib/campaigns.ts";
import {
  ATTRIBUTION_KEYS,
  canRecordAnalytics,
  clipAttr,
  formatCtr,
  generateClickId,
  generateSessionId,
  isValidSessionId,
  parseAnalyticsRange,
  parseAttribution,
  rangeStartIso,
  sessionCtr,
  shouldDedupeView,
} from "../src/lib/analytics.ts";
import { getCampaignAnalytics, recordClick, recordClickSafe, recordVisit } from "../src/lib/analytics-store.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function joinSrc(rel: string) {
  return path.join(process.cwd(), rel);
}

const sidSrc = readFileSync(joinSrc("src/lib/analytics.ts"), "utf8");
assert(sidSrc.includes("crypto.randomUUID()"), "session ID uses platform random UUID");
assert(!/ipAddress|req\.ip|x-forwarded-for|fingerprint|canvas/i.test(sidSrc), "session ID is not derived from IP or fingerprint");

const a = generateSessionId();
const b = generateSessionId();
assert(isValidSessionId(a) && isValidSessionId(b), "session ID is opaque UUID");
assert(a !== b, "session IDs are unique");
assert(!a.includes("."), "session ID is not an IPv4 address");
assert(generateClickId() !== generateClickId(), "clickId is unique per call");

assert(canRecordAnalytics({ published: true, isPreview: false, skipHeader: false }) === true, "published public visit is allowed");
assert(canRecordAnalytics({ published: false, isPreview: false, skipHeader: false }) === false, "draft presell does not record public visit");
assert(canRecordAnalytics({ published: true, isPreview: true, skipHeader: false }) === false, "preview does not record visit");
assert(canRecordAnalytics({ published: true, isPreview: false, skipHeader: true }) === false, "skip header disables analytics");

const now = Date.parse("2026-09-17T15:00:00.000Z");
assert(shouldDedupeView("2026-09-17T14:59:59.000Z", now) === true, "repeated render inside 2s is deduped");
assert(shouldDedupeView("2026-09-17T14:59:50.000Z", now) === false, "later pageview in the same session is a new visit");

const params = new URLSearchParams(
  "utm_source=google&utm_medium=cpc&utm_campaign=winter&utm_content=ad1&utm_term=jacket&gclid=gclid-1&fbclid=fb-1&msclkid=ms-1&email=secret@example.com&debug=1",
);
const attr = parseAttribution(params);
assert(attr.utmSource === "google", "UTMs preserved");
assert(attr.utmMedium === "cpc", "utm_medium preserved");
assert(attr.gclid === "gclid-1", "gclid preserved");
assert(attr.fbclid === "fb-1", "fbclid preserved");
assert(attr.msclkid === "ms-1", "msclkid preserved");
assert(!("email" in attr), "non-whitelisted keys are not stored on the attribution object");
assert(
  ATTRIBUTION_KEYS.join(",") === "utm_source,utm_medium,utm_campaign,utm_content,utm_term,gclid,fbclid,msclkid",
  "only whitelisted parameters are read",
);

const huge = parseAttribution(new URLSearchParams(`utm_source=${"x".repeat(500)}`));
assert(huge.utmSource?.length === 200, "oversized attribution values are clipped");
assert(clipAttr("  ") === null, "blank attribution is dropped");

assert(parseAnalyticsRange("today") === "today", "today filter parses");
assert(parseAnalyticsRange("7d") === "7d", "7-day filter parses");
assert(parseAnalyticsRange("30d") === "30d", "30-day filter parses");
assert(parseAnalyticsRange("all") === "all", "all-time filter parses");
assert(rangeStartIso("all") === null, "all-time has no start bound");
assert(rangeStartIso("today", new Date("2026-09-17T15:00:00.000Z")) === "2026-09-17T00:00:00.000Z", "today starts at UTC midnight");
assert(sessionCtr(1, 4) === 0.25, "CTR is CTA sessions / unique sessions");
assert(formatCtr(sessionCtr(0, 0)) === "n/a", "CTR is n/a with no sessions");

const ctaSrc = readFileSync(joinSrc("src/components/affiliate-cta.tsx"), "utf8");
assert(ctaSrc.includes("sendBeacon"), "CTA click uses beacon/keepalive");
assert(ctaSrc.includes("if (disableAffiliateNavigation)"), "validation lab can disable the hop");
assert(
  /if \(disableAffiliateNavigation\) \{\s*event\.preventDefault\(\);\s*return;/.test(ctaSrc),
  "preventDefault is only used to isolate validation previews",
);
const trackingSlice = ctaSrc.split("if (!trackClicks)")[1] || "";
assert(!trackingSlice.includes("preventDefault"), "analytics failure does not prevent affiliate navigation");
assert(ctaSrc.includes("rel={AFFILIATE_CTA_REL}"), "CTA keeps sponsored rel");
assert(ctaSrc.includes("attachClickBankExtclid"), "CTA attaches official ClickBank extclid on hop clicks");
assert(ctaSrc.includes("clickId"), "CTA beacon includes the same clickId used on the hop");

const previewSrc = readFileSync(joinSrc("src/app/admin/preview/[slug]/page.tsx"), "utf8");
assert(!previewSrc.includes("recordVisit"), "preview produces no visit recording");
assert(!previewSrc.includes("trackClicks"), "preview does not enable CTA analytics");

const templateSrc = readFileSync(joinSrc("src/components/campaign-template.tsx"), "utf8");
assert(templateSrc.includes("attachClickBankExtclid"), "published template can stamp ClickBank extclid");
assert(templateSrc.includes("outboundCta"), "extclid is gated on trackClicks");

const publicSrc = readFileSync(joinSrc("src/app/p/[slug]/page.tsx"), "utf8");
assert(publicSrc.includes("recordVisitSafe"), "published presell records visit");
assert(publicSrc.includes("getPublishedCampaignBySlug"), "only published campaigns hit the public recorder");

const apiSrc = readFileSync(joinSrc("src/app/api/track/cta/route.ts"), "utf8");
assert(apiSrc.includes("status: 204"), "click endpoint stays 204 on failure");
assert(apiSrc.includes("campaignIsPublished"), "clicks require a published campaign");

// --- temp DB ---
const tmp = path.join(os.tmpdir(), `afiliado-ia-phase4-${process.pid}.db`);
if (fs.existsSync(tmp)) fs.unlinkSync(tmp);

const raw = new Database(tmp);
migrate(raw);
const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
assert(tables.some((t) => t.name === "presell_visits"), "migration creates presell_visits");
assert(tables.some((t) => t.name === "cta_clicks"), "migration creates cta_clicks");
assert(tables.some((t) => t.name === "affiliate_transactions"), "migration creates affiliate_transactions");
raw.close();

process.env.PRESELL_OS_DB = tmp;
resetDbForTests();

const campaign = createCampaign(
  readyPublicationInput({
    name: "Analytics fixture",
    slug: "phase4-analytics-fixture",
  }),
);
publishCampaign(campaign.id);
const sessionA = generateSessionId();
const sessionB = generateSessionId();
const t1 = new Date("2026-09-17T12:00:00.000Z");

assert(
  recordVisit({
    campaignId: campaign.id,
    sessionId: sessionA,
    attribution: parseAttribution(new URLSearchParams("utm_source=google&utm_medium=cpc&gclid=abc")),
    at: t1,
  }).recorded,
  "published presell records visit",
);
assert(
  recordVisit({
    campaignId: campaign.id,
    sessionId: sessionA,
    attribution: parseAttribution(new URLSearchParams("utm_source=google")),
    at: new Date(t1.getTime() + 500),
  }).recorded === false,
  "repeated pageviews in the dedupe window do not inflate visits",
);
assert(
  recordVisit({
    campaignId: campaign.id,
    sessionId: sessionA,
    attribution: parseAttribution(new URLSearchParams("utm_source=google&utm_medium=cpc&gclid=abc")),
    at: new Date(t1.getTime() + 10_000),
  }).recorded,
  "later pageview in the same session is counted as another visit",
);
assert(
  recordVisit({
    campaignId: campaign.id,
    sessionId: sessionB,
    attribution: parseAttribution(new URLSearchParams("utm_source=meta&fbclid=fb1")),
    at: t1,
  }).recorded,
  "second session is a separate unique session",
);

assert(recordClick({ campaignId: campaign.id, sessionId: sessionA, ctaPosition: "hero", at: t1 }).recorded, "hero click recorded");
assert(recordClick({ campaignId: campaign.id, sessionId: sessionA, ctaPosition: "middle", at: t1 }).recorded, "middle click recorded");
assert(recordClick({ campaignId: campaign.id, sessionId: sessionA, ctaPosition: "final", at: t1 }).recorded, "final click recorded");

const broken = recordClickSafe({ campaignId: 0, sessionId: "not-a-uuid", ctaPosition: "hero" });
assert(broken.recorded === false, "invalid click is ignored");

const stats = getCampaignAnalytics(campaign.id, "all", new Date("2026-09-17T18:00:00.000Z"));
assert(stats.visits === 3, `visits correct (veio ${stats.visits})`);
assert(stats.uniqueSessions === 2, `unique sessions correct (veio ${stats.uniqueSessions})`);
assert(stats.ctaEvents === 3, `CTA events correct (veio ${stats.ctaEvents})`);
assert(stats.ctaSessions === 1, `CTA sessions correct (veio ${stats.ctaSessions})`);
assert(stats.ctr === 0.5, `CTR calculation correct (veio ${stats.ctr})`);
assert(stats.byPosition.hero === 1 && stats.byPosition.middle === 1 && stats.byPosition.final === 1, "CTA-position breakdown correct");
assert(stats.gclidSessions === 1, "gclid sessions counted");
assert(stats.utmSource.some((row) => row.key === "google" && row.sessions === 1), "utm_source breakdown uses sessions");

const today = getCampaignAnalytics(campaign.id, "today", new Date("2026-09-17T18:00:00.000Z"));
assert(today.visits === 3, "today filter includes today's visits");
const old = getCampaignAnalytics(campaign.id, "today", new Date("2026-09-20T18:00:00.000Z"));
assert(old.visits === 0, "today filter excludes older visits");
const week = getCampaignAnalytics(campaign.id, "7d", new Date("2026-09-18T12:00:00.000Z"));
assert(week.visits === 3, "7-day filter includes recent visits");
const month = getCampaignAnalytics(campaign.id, "30d", new Date("2026-09-18T12:00:00.000Z"));
assert(month.visits === 3, "30-day filter includes recent visits");

resetDbForTests();
delete process.env.PRESELL_OS_DB;
try {
  fs.unlinkSync(tmp);
} catch {
  /* ignore */
}

const analyticsPageSrc = readFileSync(joinSrc("src/app/admin/[id]/analytics/page.tsx"), "utf8");
assert(!analyticsPageSrc.includes("NOT CONNECTED"), "analytics no longer shows NOT CONNECTED placeholders");
assert(analyticsPageSrc.includes("affiliate commission"), "analytics labels commission, not ads revenue");
assert(!/ROI|ROAS|Profit/.test(analyticsPageSrc), "analytics does not show ROI/ROAS/profit without ads spend");

const privacySrc = readFileSync(joinSrc("src/app/privacy/page.tsx"), "utf8");
assert(privacySrc.includes("aia_sid"), "privacy describes the first-party session cookie");
assert(privacySrc.includes("do not necessarily represent individual humans"), "privacy does not overclaim unique humans");
assert(privacySrc.includes("extclid"), "privacy discloses ClickBank hop tracking parameter");
assert(privacySrc.includes("does not persist buyer"), "privacy states buyer PII is not stored");

console.log("\nTodos os testes da Fase 4 (tracking foundation) passaram.");
