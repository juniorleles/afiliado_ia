// Isolated publication + tracking + attribution E2E against a running app.
//
// Requires (all must point at the SAME isolated SQLite file the app server uses):
//   PRESELL_OS_DB=<isolated copy>  E2E_BASE_URL=http://localhost:<port>
//   E2E_CAMPAIGN_ID=<id>           CLICKBANK_INS_SECRET=<test secret shared with the server>
// Optional: E2E_REPORT=<path to write the JSON report>
//
// Refuses to run against the default data/presell-os.db. No request follows the affiliate hop.
import fs from "node:fs";
import path from "node:path";
import { getDb, getDbPath, resetDbForTests } from "../src/lib/db.ts";
import {
  deleteCampaign,
  duplicateCampaign,
  getCampaignById,
  getPublishedCampaignBySlug,
  publishCampaign,
  unpublishCampaign,
  type Campaign,
} from "../src/lib/campaigns.ts";
import { tryPublish } from "../src/lib/publication.ts";
import { applyProductionCandidate, hasProductionCandidate } from "../src/lib/production-candidate-view.ts";
import { generateClickId, generateSessionId, isValidClickId, SESSION_COOKIE } from "../src/lib/analytics.ts";
import { getCampaignAnalytics } from "../src/lib/analytics-store.ts";
import { CLICKBANK_EXTCLID_PARAM, isClickBankHopUrl } from "../src/lib/clickbank-hop.ts";
import { encryptInsEnvelope } from "../src/lib/clickbank.ts";

type Check = { name: string; pass: boolean; detail?: unknown };
const checks: Check[] = [];
const facts: Record<string, unknown> = {};

function check(name: string, pass: boolean, detail?: unknown) {
  checks.push(detail === undefined ? { name, pass } : { name, pass, detail });
  console.log(`${pass ? "OK" : "FALHOU"}: ${name}${pass || detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`);
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const base = requireEnv("E2E_BASE_URL").replace(/\/$/, "");
const campaignId = Number(requireEnv("E2E_CAMPAIGN_ID"));
const insSecret = requireEnv("CLICKBANK_INS_SECRET");
requireEnv("PRESELL_OS_DB");
const dbPath = path.resolve(getDbPath());
if (dbPath === path.resolve(process.cwd(), "data", "presell-os.db")) {
  throw new Error("Refusing to run: PRESELL_OS_DB resolves to the default production database");
}
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) {
  throw new Error("Refusing to run: E2E_BASE_URL must be a local server");
}

const count = (table: string, where = "campaignId = ?", ...args: unknown[]) =>
  (getDb().prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get(...args) as { n: number }).n;

async function http(
  urlPath: string,
  init: RequestInit & { sid?: string } = {},
): Promise<{ status: number; body: string; location: string | null }> {
  const headers = new Headers(init.headers);
  if (init.sid) headers.set("cookie", `${SESSION_COOKIE}=${init.sid}`);
  const res = await fetch(`${base}${urlPath}`, { ...init, headers, redirect: "manual" });
  return { status: res.status, body: await res.text(), location: res.headers.get("location") };
}

function trackCta(sid: string, body: Record<string, unknown>) {
  return http("/api/track/cta", {
    method: "POST",
    sid,
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify(body),
  });
}

function postIns(payload: object) {
  return http("/api/clickbank/ins", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(encryptInsEnvelope(payload, insSecret)),
  });
}

function decodeHtml(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

type RenderedCta = { position: string; href: string; index: number };

function renderedCtas(html: string): RenderedCta[] {
  const out: RenderedCta[] = [];
  const re = /<a\b[^>]*\bdata-cta-position="([a-z]+)"[^>]*>/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const href = /\bhref="([^"]*)"/.exec(m[0])?.[1];
    if (href) out.push({ position: m[1], href: decodeHtml(href), index: m.index });
  }
  return out;
}

/** Mirrors publishCampaignAction after requireAdmin: gate verdict first, persistence only on ok. */
function operatorPublish(id: number, confirmWarnings = false) {
  const campaign = getCampaignById(id);
  if (!campaign) return { ok: false as const, gate: "BLOCKED", error: "not found" };
  const verdict = tryPublish(campaign, confirmWarnings);
  if (!verdict.ok) return verdict;
  publishCampaign(id);
  return verdict;
}

const CLAIM = "This formula cures arthritis and reverses joint damage in days.";

function withInjectedClaim(campaign: Campaign): Campaign {
  const field = hasProductionCandidate(campaign) ? "productionPageComposition" : "pageComposition";
  const raw = campaign[field];
  if (!raw) return { ...campaign, body: `${campaign.body}\n\n${CLAIM}` };
  const page = JSON.parse(raw) as { hero?: { summary?: string } };
  if (page.hero) page.hero.summary = `${page.hero.summary ?? ""} ${CLAIM}`.trim();
  return { ...campaign, [field]: JSON.stringify(page) };
}

function insSale(receipt: string, extclid: unknown, amount = "12.34", transactionTime = new Date().toISOString()) {
  return {
    transactionTime,
    receipt,
    transactionType: "SALE",
    vendor: "e2evendor",
    affiliate: "e2eaffiliate",
    role: "AFFILIATE",
    totalAccountAmount: amount,
    paymentMethod: "VISA",
    totalOrderAmount: "49.00",
    trackingCodes: [],
    affiliateTrackingParameters: extclid === undefined ? {} : { extclid },
    version: "8",
  };
}

async function main() {
  const original = getCampaignById(campaignId);
  if (!original) throw new Error(`campaign ${campaignId} not found in isolated DB`);
  const slug = original.slug;
  const route = `/p/${slug}`;
  const token = Date.now().toString(36).toUpperCase();
  facts.isolatedDb = path.relative(process.cwd(), dbPath);
  facts.slug = slug;

  // --- DRAFT ---
  check("isolated campaign starts as draft", original.publicationStatus === "draft", original.publicationStatus);
  const draftSid = generateSessionId();
  const visitsBefore = count("presell_visits", "campaignId = ?", campaignId);
  const clicksBefore = count("cta_clicks", "campaignId = ?", campaignId);
  const draftPage = await http(`${route}?utm_source=e2e`, { sid: draftSid });
  check("draft public route is 404", draftPage.status === 404, draftPage.status);
  check("draft 404 records no pageview", count("presell_visits", "campaignId = ?", campaignId) === visitsBefore);
  const draftTrack = await trackCta(draftSid, { campaignId, ctaPosition: "hero", clickId: generateClickId() });
  check("draft CTA beacon answers 204", draftTrack.status === 204, draftTrack.status);
  check("draft campaign accepts no CTA tracking", count("cta_clicks", "campaignId = ?", campaignId) === clicksBefore);

  // --- PUBLICATION GATE: negatives ---
  const claimVerdict = tryPublish(withInjectedClaim(original), true);
  check("injected unsupported health claim is not publishable (even with confirmWarnings)", !claimVerdict.ok, claimVerdict.gate);
  facts.injectedClaimGate = claimVerdict.gate;
  const noFactsVerdict = tryPublish({ ...original, sourceFactsJson: null }, true);
  check("missing sourceFactsJson fails closed", !noFactsVerdict.ok && noFactsVerdict.gate === "BLOCKED", noFactsVerdict.gate);

  const fixture = duplicateCampaign(campaignId);
  getDb().prepare("UPDATE campaigns SET sourceFactsJson = NULL WHERE id = ?").run(fixture.id);
  const fixtureVerdict = operatorPublish(fixture.id, true);
  const fixtureAfter = getCampaignById(fixture.id);
  check("failed gate refuses persisted publish", !fixtureVerdict.ok && fixtureAfter?.publicationStatus === "draft", {
    gate: fixtureVerdict.gate,
    status: fixtureAfter?.publicationStatus,
  });
  const fixturePage = await http(`/p/${fixture.slug}`);
  check("gate-failed fixture stays unavailable publicly", fixturePage.status === 404, fixturePage.status);
  deleteCampaign(fixture.id);

  // --- PUBLICATION GATE: positive + controlled publish ---
  const gateVerdict = tryPublish(original, false);
  facts.contentGate = gateVerdict.gate;
  check("campaign content gate is READY without confirmWarnings", gateVerdict.ok && gateVerdict.gate === "READY", gateVerdict);
  if (!gateVerdict.ok) throw new Error("Stopping: campaign is not READY; publication is not bypassed");
  const published = operatorPublish(campaignId, false);
  const afterPublish = getCampaignById(campaignId);
  check("controlled publish persists published + publishedAt", published.ok && afterPublish?.publicationStatus === "published" && Boolean(afterPublish?.publishedAt));
  check("published slug resolves through the public loader", getPublishedCampaignBySlug(slug)?.id === campaignId);

  // --- PUBLISHED ROUTE + PAGEVIEW ---
  const sid = generateSessionId();
  const query = `utm_source=e2e_src&utm_medium=cpc&utm_campaign=e2e_camp&utm_content=e2e_ct&utm_term=e2e_term&gclid=E2E-GCLID-${token}`;
  const livePage = await http(`${route}?${query}`, { sid });
  check("published route is 200 (no redirect)", livePage.status === 200 && !livePage.location, { status: livePage.status, location: livePage.location });
  const rendered = applyProductionCandidate(afterPublish!);
  check("published page renders the campaign headline", livePage.body.includes(decodeHtml(rendered.headline)) || livePage.body.includes(rendered.headline));
  check("published page has no preview banner", !livePage.body.includes("PREVIEW — NOT PUBLISHED"));

  const visit = getDb()
    .prepare("SELECT * FROM presell_visits WHERE campaignId = ? AND sessionId = ? ORDER BY visitedAt DESC LIMIT 1")
    .get(campaignId, sid) as Record<string, string | null> | undefined;
  check("pageview recorded for campaign + session", Boolean(visit));
  check(
    "pageview stores all UTM parameters",
    visit?.utmSource === "e2e_src" && visit?.utmMedium === "cpc" && visit?.utmCampaign === "e2e_camp" && visit?.utmContent === "e2e_ct" && visit?.utmTerm === "e2e_term",
    visit,
  );
  check("pageview stores gclid", visit?.gclid === `E2E-GCLID-${token}`, visit?.gclid);

  // --- CTAs as rendered ---
  const ctas = renderedCtas(livePage.body);
  const positions = ctas.map((c) => c.position);
  facts.renderedCtaPositions = positions;
  const disclosureIndex = livePage.body.indexOf("data-affiliate-disclosure");
  check("affiliate disclosure precedes the first CTA", disclosureIndex >= 0 && ctas.length > 0 && disclosureIndex < ctas[0].index, { disclosureIndex, firstCta: ctas[0]?.index });
  const clickIds: Record<string, string> = {};
  for (const position of ["header", "hero", "final"]) {
    const cta = ctas.find((c) => c.position === position);
    check(`CTA ${position} rendered`, Boolean(cta));
    if (!cta) continue;
    const url = new URL(cta.href);
    const extclid = url.searchParams.get(CLICKBANK_EXTCLID_PARAM);
    check(`CTA ${position} href is the direct affiliate hop (no app redirect)`, isClickBankHopUrl(cta.href) && url.host !== new URL(base).host);
    check(`CTA ${position} carries a valid extclid`, isValidClickId(extclid), extclid);
    check(
      `CTA ${position} passes UTM + gclid through`,
      url.searchParams.get("utm_source") === "e2e_src" && url.searchParams.get("utm_campaign") === "e2e_camp" && url.searchParams.get("gclid") === `E2E-GCLID-${token}`,
      Object.fromEntries(url.searchParams),
    );
    if (extclid) clickIds[position] = extclid;
  }
  check("each CTA has a unique clickId", new Set(Object.values(clickIds)).size === 3, clickIds);

  for (const [position, clickId] of Object.entries(clickIds)) {
    const res = await trackCta(sid, { campaignId, ctaPosition: position, clickId });
    const row = getDb().prepare("SELECT * FROM cta_clicks WHERE clickId = ?").get(clickId) as Record<string, string | null> | undefined;
    check(`CTA ${position} beacon recorded with position`, res.status === 204 && row?.ctaPosition === position && Number(row?.campaignId) === campaignId, row);
    check(`CTA ${position} stored clickId == rendered extclid`, row?.clickId === clickId);
    check(`CTA ${position} click inherits session + UTM/gclid`, row?.sessionId === sid && row?.utmSource === "e2e_src" && row?.gclid === `E2E-GCLID-${token}`);
  }
  const replay = await trackCta(sid, { campaignId, ctaPosition: "hero", clickId: clickIds.hero });
  check("replayed beacon does not duplicate the click", replay.status === 204 && count("cta_clicks", "clickId = ?", clickIds.hero) === 1);

  // --- ClickBank INS attribution ---
  const receipt = `E2E${token}`.slice(0, 21).padEnd(8, "0");
  // A ClickBank retry re-delivers the identical notification (same receipt, type and transactionTime).
  const salePayload = insSale(receipt, clickIds.hero);
  const sale = await postIns(salePayload);
  const tx = getDb()
    .prepare("SELECT * FROM affiliate_transactions WHERE externalTransactionId = ? AND transactionType = 'SALE'")
    .all(receipt) as Array<Record<string, string | number | null>>;
  check("INS SALE accepted", sale.status === 200, sale.status);
  check(
    "INS extclid resolves to the hero CTA click",
    tx.length === 1 && tx[0].attributionStatus === "ATTRIBUTED" && Number(tx[0].campaignId) === campaignId && tx[0].clickId === clickIds.hero && tx[0].sessionId === sid,
    tx[0],
  );
  check("INS commission stored in integer cents", tx[0]?.affiliateCommissionCents === 1234, tx[0]?.affiliateCommissionCents);
  const dup = await postIns(salePayload);
  check(
    "duplicate INS is idempotent (200, single row)",
    dup.status === 200 && count("affiliate_transactions", "externalTransactionId = ? AND transactionType = 'SALE'", receipt) === 1,
  );

  const unmatchedReceipt = `U${receipt}`.slice(0, 21);
  const unmatched = await postIns(insSale(unmatchedReceipt, generateClickId(), "3.00"));
  const unmatchedRow = getDb().prepare("SELECT * FROM affiliate_transactions WHERE externalTransactionId = ?").get(unmatchedReceipt) as Record<string, unknown> | undefined;
  check("unmatched extclid stored UNATTRIBUTED with no campaign", unmatched.status === 200 && unmatchedRow?.attributionStatus === "UNATTRIBUTED" && unmatchedRow?.campaignId == null, unmatchedRow);
  const invalidReceipt = `X${receipt}`.slice(0, 21);
  const invalid = await postIns(insSale(invalidReceipt, "not-a-click-id", "2.00"));
  const invalidRow = getDb().prepare("SELECT * FROM affiliate_transactions WHERE externalTransactionId = ?").get(invalidReceipt) as Record<string, unknown> | undefined;
  check("invalid extclid stored UNATTRIBUTED with no campaign", invalid.status === 200 && invalidRow?.attributionStatus === "UNATTRIBUTED" && invalidRow?.campaignId == null, invalidRow);

  // --- analytics ---
  const stats = getCampaignAnalytics(campaignId, "all");
  facts.analytics = {
    visits: stats.visits,
    uniqueSessions: stats.uniqueSessions,
    ctaEvents: stats.ctaEvents,
    byPosition: stats.byPosition,
    gclidSessions: stats.gclidSessions,
    sales: stats.commerce.sales,
    attributedSales: stats.commerce.attributedSales,
    grossCommissionCents: stats.commerce.grossCommissionCents,
    unattributedSalesSitewide: stats.commerce.unattributedSalesSitewide,
    ctaToSaleRate: stats.commerce.ctaToSaleRate,
  };
  check("analytics: 1 visit / 1 session / 3 CTA events", stats.visits === 1 && stats.uniqueSessions === 1 && stats.ctaEvents === 3, facts.analytics);
  check("analytics: header/hero/final = 1 each", stats.byPosition.header === 1 && stats.byPosition.hero === 1 && stats.byPosition.final === 1);
  check("analytics: gclid session and UTM source visible", stats.gclidSessions === 1 && stats.utmSource.some((r) => r.key === "e2e_src"));
  check(
    "analytics: exactly one attributed sale, $12.34 gross, unmatched sales not credited",
    stats.commerce.sales === 1 && stats.commerce.attributedSales === 1 && stats.commerce.grossCommissionCents === 1234,
    stats.commerce,
  );
  const adminAnalytics = await http(`/admin/${campaignId}/analytics?range=all`);
  check(
    "admin analytics page shows the attributed commission",
    adminAnalytics.status === 200 && adminAnalytics.body.includes("$12.34") && adminAnalytics.body.includes("Header"),
    adminAnalytics.status,
  );

  // --- unpublish ---
  unpublishCampaign(campaignId);
  check("controlled unpublish returns campaign to draft", getCampaignById(campaignId)?.publicationStatus === "draft");
  const visitsLive = count("presell_visits", "campaignId = ?", campaignId);
  const clicksLive = count("cta_clicks", "campaignId = ?", campaignId);
  const goneSid = generateSessionId();
  const gone = await http(`${route}?${query}`, { sid: goneSid });
  check("unpublished public route is 404", gone.status === 404, gone.status);
  check("unpublished route records no pageview", count("presell_visits", "campaignId = ?", campaignId) === visitsLive);
  const lateBeacon = await trackCta(sid, { campaignId, ctaPosition: "final", clickId: generateClickId() });
  check("unpublished campaign rejects CTA tracking", lateBeacon.status === 204 && count("cta_clicks", "campaignId = ?", campaignId) === clicksLive);

  const failed = checks.filter((c) => !c.pass);
  const report = { generatedAt: new Date().toISOString(), campaignId, facts, total: checks.length, failed: failed.length, checks };
  const reportPath = process.env.E2E_REPORT?.trim();
  if (reportPath) fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  resetDbForTests();
  if (failed.length) {
    console.error(`\n${failed.length} E2E check(s) failed.`);
    process.exit(1);
  }
  console.log(`\nTracking + publication E2E passed (${checks.length} checks).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  resetDbForTests();
  process.exit(1);
});
