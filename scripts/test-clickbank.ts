// npx tsx scripts/test-clickbank.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { migrate, resetDbForTests, getDb } from "../src/lib/db.ts";
import { createCampaign, publishCampaign } from "../src/lib/campaigns.ts";
import { readyPublicationInput } from "./fixtures/ready-publication-campaign.ts";
import { generateClickId, generateSessionId, isValidClickId, parseAttribution } from "../src/lib/analytics.ts";
import { getCampaignAnalytics, recordClick, recordVisit } from "../src/lib/analytics-store.ts";
import {
  attachClickBankExtclid,
  CLICKBANK_EXTCLID_PARAM,
  isClickBankHopUrl,
} from "../src/lib/clickbank-hop.ts";
import { buildAffiliateHref } from "../src/lib/affiliate-url.ts";
import {
  decryptInsEnvelope,
  encryptInsEnvelope,
  formatUsdCents,
  MAX_INS_BODY_BYTES,
  parseInsTransaction,
  parseUsdToCents,
  signedCommissionCents,
} from "../src/lib/clickbank.ts";
import { ingestParsedTransaction, listAffiliateTransactions } from "../src/lib/clickbank-store.ts";
import { POST as insPost, GET as insGet } from "../src/app/api/clickbank/ins/route.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function joinSrc(rel: string) {
  return path.join(process.cwd(), rel);
}

const SECRET = "TESTKEY12345678";
const prevSecret = process.env.CLICKBANK_INS_SECRET;
const prevDb = process.env.PRESELL_OS_DB;

const hopSrc = readFileSync(joinSrc("src/lib/clickbank-hop.ts"), "utf8");
assert(hopSrc.includes('CLICKBANK_EXTCLID_PARAM = "extclid"'), "official hop parameter is extclid");
assert(!hopSrc.includes("searchParams.set(\"tid\""), "tid is not written on hops");

const clickId = "84721a0a-1122-4ea5-936f-def4fec4d83b";
assert(isValidClickId(clickId), "fixture clickId is a UUID");

assert(isClickBankHopUrl("https://hop.clickbank.net/?affiliate=a&vendor=b"), "standard HopLink host is recognized");
assert(
  isClickBankHopUrl("https://vendor.affnick.hop.clickbank.net/?tid=old"),
  "encrypted HopLink host is recognized",
);
assert(!isClickBankHopUrl("https://example.com/hop"), "non-ClickBank URLs are not treated as hops");
assert(!isClickBankHopUrl("not a url"), "malformed href is not a hop");

const incoming = new URLSearchParams("utm_source=google&utm_medium=cpc&gclid=gclid-1&fbclid=fb-1&msclkid=ms-1");
const baseHop = buildAffiliateHref("https://hop.clickbank.net/?affiliate=nick&vendor=vend", incoming);
const withExt = attachClickBankExtclid(baseHop, clickId);
const hopUrl = new URL(withExt);
assert(hopUrl.searchParams.get(CLICKBANK_EXTCLID_PARAM) === clickId, "extclid is the UUID clickId (dashes preserved)");
assert(hopUrl.searchParams.get("utm_source") === "google", "utm_source preserved on ClickBank hop");
assert(hopUrl.searchParams.get("gclid") === "gclid-1", "gclid preserved on ClickBank hop");
assert(hopUrl.searchParams.get("fbclid") === "fb-1", "fbclid preserved on ClickBank hop");
assert(hopUrl.searchParams.get("msclkid") === "ms-1", "msclkid preserved on ClickBank hop");
assert(hopUrl.searchParams.get("tid") === null, "tid is not added");

const other = attachClickBankExtclid("https://aff.example.com/product?utm_source=google", clickId);
assert(!other.includes("extclid"), "extclid is not added to non-ClickBank destinations");
assert(attachClickBankExtclid("not a valid url", clickId) === "not a valid url", "malformed hop rewrite is failure-safe");
assert(attachClickBankExtclid(baseHop, "not-a-uuid") === baseHop, "invalid clickId is not attached");

const ctaSrc = readFileSync(joinSrc("src/components/affiliate-cta.tsx"), "utf8");
assert(ctaSrc.includes("if (disableAffiliateNavigation)"), "validation lab can disable the hop");
assert(
  /if \(disableAffiliateNavigation\) \{\s*event\.preventDefault\(\);\s*return;/.test(ctaSrc),
  "preventDefault is only used to isolate validation previews",
);
const trackingSlice = ctaSrc.split("if (!trackClicks)")[1] || "";
assert(!trackingSlice.includes("preventDefault"), "ClickBank rewrite does not preventDefault navigation");
assert(ctaSrc.includes("sendBeacon"), "beacon tracking remains");
assert(ctaSrc.includes("rel={AFFILIATE_CTA_REL}"), "sponsored rel remains");

const templateSrc = readFileSync(joinSrc("src/components/campaign-template.tsx"), "utf8");
assert(templateSrc.includes("attachClickBankExtclid"), "published template stamps official extclid at render");
assert(templateSrc.includes("generateClickId"), "each tracked CTA gets its own clickId");
assert(templateSrc.includes("outboundCta(href, trackClicks)"), "preview/trackClicks=false does not stamp extclid");

assert(parseUsdToCents("12.34") === 1234, "commission 12.34 stores as 1234 cents");
assert(parseUsdToCents("0") === 0, "zero amount is 0 cents");
assert(parseUsdToCents("5") === 500, "whole dollars become cents");
assert(parseUsdToCents("2.9") === 290, "one decimal pads to cents");
assert(parseUsdToCents("abc") === null, "invalid monetary value rejected");
assert(parseUsdToCents("1.239") === null, "more than 2 decimals rejected");
assert(formatUsdCents(1234) === "$12.34", "cents format does not use floats");
assert(signedCommissionCents("SALE", 1234) === 1234, "sale commission is a credit");
assert(signedCommissionCents("RFND", 1234) === -1234, "refund commission is a debit");
assert(signedCommissionCents("CGBK", 500) === -500, "chargeback commission is a debit");
assert(signedCommissionCents("CANCEL-REBILL", 0) === 0, "cancellation does not count as commission");

const roundTrip = { hello: "clickbank", n: 1 };
const envelope = encryptInsEnvelope(roundTrip, SECRET);
assert(JSON.stringify(decryptInsEnvelope(envelope, SECRET)) === JSON.stringify(roundTrip), "INS AES-256-CBC round-trip");
let decryptFailed = false;
try {
  decryptInsEnvelope(envelope, "WRONGSECRET0001");
} catch {
  decryptFailed = true;
}
assert(decryptFailed, "wrong secret fails authenticity verification");

const tmp = path.join(os.tmpdir(), `afiliado-ia-phase5-${process.pid}.db`);
if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
const raw = new Database(tmp);
migrate(raw);
raw.close();
process.env.PRESELL_OS_DB = tmp;
process.env.CLICKBANK_INS_SECRET = SECRET;
resetDbForTests();

const campaign = createCampaign(
  readyPublicationInput({
    name: "ClickBank fixture",
    slug: "phase5-clickbank-fixture",
    affiliateUrl: "https://hop.clickbank.net/?affiliate=nick&vendor=vend",
  }),
);
publishCampaign(campaign.id);
const sessionA = generateSessionId();
const knownClick = generateClickId();
recordVisit({
  campaignId: campaign.id,
  sessionId: sessionA,
  attribution: parseAttribution(new URLSearchParams("utm_source=google&gclid=abc")),
  at: new Date("2026-09-17T12:00:00.000Z"),
});
assert(
  recordClick({
    campaignId: campaign.id,
    sessionId: sessionA,
    ctaPosition: "final",
    clickId: knownClick,
    at: new Date("2026-09-17T12:01:00.000Z"),
  }).recorded,
  "known clickId stored on CTA click",
);

function notification(overrides: Record<string, unknown> = {}) {
  return {
    transactionTime: "2026-09-17T13:00:00-06:00",
    receipt: "ABCD1234",
    transactionType: "SALE",
    vendor: "testacct",
    affiliate: "affnick1",
    role: "AFFILIATE",
    totalAccountAmount: "12.34",
    paymentMethod: "VISA",
    totalOrderAmount: "47.00",
    trackingCodes: ["tracking_code"],
    affiliateTrackingParameters: { extclid: knownClick },
    customer: {
      shipping: {
        firstName: "Ada",
        lastName: "Buyer",
        email: "buyer@example.com",
        phoneNumber: "555-0100",
        address: { address1: "1 Main Street", city: "Austin", country: "US" },
      },
      billing: { firstName: "Ada", email: "buyer@example.com" },
    },
    version: "8",
    ...overrides,
  };
}

async function postIns(body: string, headers: Record<string, string> = {}, secret = SECRET) {
  process.env.CLICKBANK_INS_SECRET = secret;
  return insPost(
    new Request("http://localhost/api/clickbank/ins", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    }),
  );
}

async function postEncrypted(payload: object, secret = SECRET) {
  return postIns(JSON.stringify(encryptInsEnvelope(payload, secret)), {}, secret);
}

async function main() {
const attributed = await postEncrypted(notification());
assert(attributed.status === 200, `valid SALE is accepted (status ${attributed.status})`);
assert((await attributed.text()) === "OK", "success body is OK without secrets");

const rows = listAffiliateTransactions();
assert(rows.length === 1, "valid sale stored once");
assert(rows[0].transactionType === "SALE", "SALE type preserved");
assert(rows[0].externalTransactionId === "ABCD1234", "receipt stored as transaction id");
assert(rows[0].affiliateCommissionCents === 1234, "commission stored exactly as integer cents");
assert(rows[0].currency === "USD", "currency preserved as ClickBank USD");
assert(rows[0].attributionStatus === "ATTRIBUTED", "valid clickId maps transaction to CTA click");
assert(rows[0].campaignId === campaign.id, "attributed sale maps to campaign");
assert(rows[0].sessionId === sessionA, "attributed sale maps to session");
assert(rows[0].clickId === knownClick, "attributed sale maps to clickId");

const dump = JSON.stringify(getDb().prepare("SELECT * FROM affiliate_transactions").all());
assert(!dump.includes("buyer@example.com"), "buyer email is not persisted");
assert(!dump.includes("Ada"), "buyer name is not persisted");
assert(!dump.includes("1 Main Street"), "buyer address is not persisted");
assert(!dump.includes("555-0100"), "buyer phone is not persisted");

const duplicate = await postEncrypted(notification());
assert(duplicate.status === 200, "duplicate notification is idempotent 200");
assert(listAffiliateTransactions().filter((r) => r.transactionType === "SALE").length === 1, "duplicate SALE not inserted twice");

const missingTrack = await postEncrypted(
  notification({
    receipt: "MISSING1",
    transactionTime: "2026-09-17T14:00:00-06:00",
    affiliateTrackingParameters: {},
  }),
);
assert(missingTrack.status === 200, "sale without extclid is still stored");
const missingRow = listAffiliateTransactions().find((r) => r.externalTransactionId === "MISSING1");
assert(missingRow?.attributionStatus === "UNATTRIBUTED", "missing clickId => UNATTRIBUTED");
assert(missingRow?.campaignId == null, "missing clickId does not fabricate a campaign");

const unknownClick = generateClickId();
const unknown = await postEncrypted(
  notification({
    receipt: "UNKNOWN1",
    transactionTime: "2026-09-17T15:00:00-06:00",
    affiliateTrackingParameters: { extclid: unknownClick },
  }),
);
assert(unknown.status === 200, "sale with unknown extclid is stored");
const unknownRow = listAffiliateTransactions().find((r) => r.externalTransactionId === "UNKNOWN1");
assert(unknownRow?.attributionStatus === "UNATTRIBUTED", "unknown clickId => UNATTRIBUTED");
assert(unknownRow?.campaignId == null, "unknown clickId does not fabricate attribution");

const refund = await postEncrypted(
  notification({
    receipt: "ABCD1234",
    transactionType: "RFND",
    transactionTime: "2026-09-17T16:00:00-06:00",
    totalAccountAmount: "12.34",
    affiliateTrackingParameters: { extclid: knownClick },
  }),
);
assert(refund.status === 200, "RFND is accepted");
const saleStill = listAffiliateTransactions().find(
  (r) => r.externalTransactionId === "ABCD1234" && r.transactionType === "SALE",
);
const refundRow = listAffiliateTransactions().find(
  (r) => r.externalTransactionId === "ABCD1234" && r.transactionType === "RFND",
);
assert(saleStill != null, "refund does not delete the original sale");
assert(refundRow != null, "refund stored as a separate row");
assert(refundRow?.attributionStatus === "ATTRIBUTED", "refund with matching extclid is attributed");

const rebill = await postEncrypted(
  notification({
    receipt: "REBILL01",
    transactionType: "BILL",
    transactionTime: "2026-09-17T17:00:00-06:00",
    totalAccountAmount: "5.00",
    affiliateTrackingParameters: { extclid: knownClick },
  }),
);
assert(rebill.status === 200, "BILL rebill is stored when documented");

const chargeback = await postEncrypted(
  notification({
    receipt: "CGBK0001",
    transactionType: "CGBK",
    transactionTime: "2026-09-17T18:00:00-06:00",
    totalAccountAmount: "1.00",
    affiliateTrackingParameters: { extclid: knownClick },
  }),
);
assert(chargeback.status === 200, "CGBK chargeback is stored when documented");

const bogusType = await postEncrypted(
  notification({
    receipt: "BOGUS001",
    transactionType: "NOT_A_TYPE",
    transactionTime: "2026-09-17T19:00:00-06:00",
  }),
);
assert(bogusType.status === 400, "unknown transaction type is not converted into a sale");
assert(
  listAffiliateTransactions().every((r) => r.externalTransactionId !== "BOGUS001"),
  "unknown transaction type is not persisted as a sale",
);

const parsedMissingId = parseInsTransaction(notification({ receipt: "SHORT" }));
assert("error" in parsedMissingId && parsedMissingId.error === "missing_transaction_id", "missing/short receipt rejected");
const parsedBadMoney = parseInsTransaction(notification({ totalAccountAmount: "12.345" }));
assert("error" in parsedBadMoney && parsedBadMoney.error === "invalid_monetary_value", "invalid monetary value rejected");

const malformed = await postIns("{not-json");
assert(malformed.status === 400, "malformed payload rejected");

const badEnvelope = encryptInsEnvelope(
  notification({ receipt: "AUTHFAIL1", transactionTime: "2026-09-17T20:00:00-06:00" }),
  "OTHERKEY0000001",
);
const badAuth = await postIns(JSON.stringify(badEnvelope));
assert(badAuth.status === 400, "invalid authenticity verification rejected");

const missingIdHttp = await postEncrypted(notification({ receipt: "SHORT" }));
assert(missingIdHttp.status === 400, "missing required transaction identifier rejected over HTTP");

const formEnvelope = encryptInsEnvelope(
  notification({ receipt: "FORMFORM1", transactionTime: "2026-09-17T21:00:00-06:00", affiliateTrackingParameters: {} }),
  SECRET,
);
const formBody = new URLSearchParams({
  notification: formEnvelope.notification,
  iv: formEnvelope.iv,
}).toString();
const formRes = await insPost(
  new Request("http://localhost/api/clickbank/ins", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: formBody,
  }),
);
assert(formRes.status === 200, "HTML FORM POST envelope is accepted");

const oversized = await postIns("x".repeat(MAX_INS_BODY_BYTES + 1));
assert(oversized.status === 413, "oversized payload rejected");

process.env.CLICKBANK_INS_SECRET = "";
const unconfigured = await postIns(JSON.stringify(encryptInsEnvelope(notification(), SECRET)), {}, "");
assert(unconfigured.status === 503, "missing INS secret rejects notifications");
process.env.CLICKBANK_INS_SECRET = SECRET;

const getRes = await insGet();
assert(getRes.status === 405, "INS endpoint does not accept GET");

const ingestDirect = ingestParsedTransaction({
  provider: "clickbank",
  externalTransactionId: "DIRECT01",
  transactionType: "SALE",
  occurredAt: "2026-09-17T22:00:00.000Z",
  currency: "USD",
  affiliateCommissionCents: 100,
  trackingValue: null,
  officialType: true,
});
assert(ingestDirect.stored && ingestDirect.attributionStatus === "UNATTRIBUTED", "direct ingest without tracking is UNATTRIBUTED");

const testPing = await postEncrypted(
  notification({
    receipt: "********",
    transactionType: "TEST",
    transactionTime: "2026-09-17T22:30:00-06:00",
    totalAccountAmount: "0.00",
    affiliateTrackingParameters: {},
  }),
);
assert(testPing.status === 200, "official INS Test URL type TEST is stored");
assert(
  listAffiliateTransactions().some((r) => r.transactionType === "TEST" && r.externalTransactionId === "********"),
  "TEST ping is persisted for operator inspection",
);

const cancel = await postEncrypted(
  notification({
    receipt: "CANCEL01",
    transactionType: "CANCEL-REBILL",
    transactionTime: "2026-09-17T22:45:00-06:00",
    totalAccountAmount: "0.00",
    affiliateTrackingParameters: { extclid: knownClick },
  }),
);
assert(cancel.status === 200, "CANCEL-REBILL is stored when documented");

const stats = getCampaignAnalytics(campaign.id, "all", new Date("2026-09-18T00:00:00.000Z"));
assert(stats.commerce.sales === 1, `attributed sales count correct (veio ${stats.commerce.sales})`);
assert(stats.commerce.refunds === 1, `refund count correct (veio ${stats.commerce.refunds})`);
assert(stats.commerce.attributedSales === 1, "attributed sales count matches SALE");
assert(stats.commerce.unattributedSalesSitewide === 4, `unattributed sales counted site-wide (veio ${stats.commerce.unattributedSalesSitewide})`);
assert(stats.commerce.grossCommissionCents === 1734, `gross commission SALE+BILL cents (veio ${stats.commerce.grossCommissionCents})`);
assert(stats.commerce.refundedCommissionCents === 1334, `refunded commission RFND+CGBK (veio ${stats.commerce.refundedCommissionCents})`);
assert(stats.commerce.netCommissionCents === 400, `net commission calculated correctly (veio ${stats.commerce.netCommissionCents})`);
assert(stats.commerce.rebills === 1, "rebill BILL counted separately");
assert(stats.commerce.ctaToSaleRate === 1, "CTA → Sale is attributed sales / CTA sessions");
assert(stats.visits >= 1 && stats.ctaEvents >= 1, "existing funnel analytics still populate");
assert(
  stats.commerce.sales === 1 && stats.commerce.grossCommissionCents === 1734,
  "TEST and CANCEL-REBILL are not converted into sales or commission",
);

const txPage = readFileSync(joinSrc("src/app/admin/transactions/page.tsx"), "utf8");
assert(txPage.includes("attributionStatus"), "transaction admin shows attribution status");
assert(txPage.includes("externalTransactionId"), "transaction admin shows transaction ID");

const envExample = readFileSync(joinSrc(".env.example"), "utf8");
assert(envExample.includes("CLICKBANK_INS_SECRET"), ".env.example documents INS secret");
assert(!envExample.includes(SECRET), ".env.example has no real secret");

const research = readFileSync(joinSrc("docs/CLICKBANK_INTEGRATION_RESEARCH.md"), "utf8");
assert(research.includes("extclid"), "research documents extclid");
assert(research.includes("Instant Notification"), "research documents INS");

resetDbForTests();
if (prevSecret === undefined) delete process.env.CLICKBANK_INS_SECRET;
else process.env.CLICKBANK_INS_SECRET = prevSecret;
if (prevDb === undefined) delete process.env.PRESELL_OS_DB;
else process.env.PRESELL_OS_DB = prevDb;
try {
  fs.unlinkSync(tmp);
} catch {
  /* ignore */
}

console.log("\nTodos os testes da Fase 5 (ClickBank attribution) passaram.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
