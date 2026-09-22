import { getDb } from "@/lib/db";
import { isValidClickId, type AnalyticsRange, rangeStartIso } from "@/lib/analytics";
import {
  countsTowardCommission,
  isChargebackType,
  isOfficialTransactionType,
  isRebillType,
  isRefundType,
  isSaleType,
  isTestType,
  signedCommissionCents,
  type AttributionStatus,
  type ParsedInsTransaction,
} from "@/lib/clickbank";

export type StoredTransaction = {
  id: number;
  provider: string;
  externalTransactionId: string;
  transactionType: string;
  campaignId: number | null;
  campaignName: string | null;
  sessionId: string | null;
  clickId: string | null;
  occurredAt: string;
  currency: string;
  affiliateCommissionCents: number;
  trackingValue: string | null;
  attributionStatus: AttributionStatus;
  createdAt: string;
};

export type IngestResult = {
  stored: boolean;
  duplicate: boolean;
  attributionStatus: AttributionStatus | null;
  error?: string;
};

export type CampaignCommerce = {
  sales: number;
  refunds: number;
  chargebacks: number;
  rebills: number;
  attributedSales: number;
  unattributedSalesSitewide: number;
  grossCommissionCents: number;
  refundedCommissionCents: number;
  netCommissionCents: number;
  ctaToSaleRate: number | null;
  insConfigured: boolean;
};

function logClickBank(message: string) {
  console.error(`[clickbank] ${message}`);
}

export type ClickLookup = {
  clickId: string;
  campaignId: number;
  sessionId: string;
};

export function lookupCtaClick(clickId: string): ClickLookup | null {
  if (!isValidClickId(clickId)) return null;
  const row = getDb()
    .prepare(
      `SELECT clickId, campaignId, sessionId FROM cta_clicks WHERE clickId = ? LIMIT 1`,
    )
    .get(clickId) as ClickLookup | undefined;
  return row ?? null;
}

function timeClause(column: string, startIso: string | null): { sql: string; params: string[] } {
  if (!startIso) return { sql: "", params: [] };
  return { sql: ` AND ${column} >= ?`, params: [startIso] };
}

export function ingestParsedTransaction(parsed: ParsedInsTransaction): IngestResult {
  if (!parsed.officialType) {
    logClickBank(`unknown transactionType rejected type=${parsed.transactionType}`);
    return { stored: false, duplicate: false, attributionStatus: null, error: "unknown_transaction_type" };
  }

  let attributionStatus: AttributionStatus = "UNATTRIBUTED";
  let campaignId: number | null = null;
  let sessionId: string | null = null;
  let clickId: string | null = null;

  if (parsed.trackingValue && isValidClickId(parsed.trackingValue)) {
    const click = lookupCtaClick(parsed.trackingValue);
    if (click) {
      attributionStatus = "ATTRIBUTED";
      campaignId = click.campaignId;
      sessionId = click.sessionId;
      clickId = click.clickId;
    }
  }

  const createdAt = new Date().toISOString();
  try {
    getDb()
      .prepare(
        `INSERT INTO affiliate_transactions (
          provider, externalTransactionId, transactionType,
          campaignId, sessionId, clickId, occurredAt, currency,
          affiliateCommissionCents, trackingValue, attributionStatus, createdAt
        ) VALUES (
          @provider, @externalTransactionId, @transactionType,
          @campaignId, @sessionId, @clickId, @occurredAt, @currency,
          @affiliateCommissionCents, @trackingValue, @attributionStatus, @createdAt
        )`,
      )
      .run({
        provider: parsed.provider,
        externalTransactionId: parsed.externalTransactionId,
        transactionType: parsed.transactionType,
        campaignId,
        sessionId,
        clickId,
        occurredAt: parsed.occurredAt,
        currency: parsed.currency,
        affiliateCommissionCents: parsed.affiliateCommissionCents,
        trackingValue: parsed.trackingValue,
        attributionStatus,
        createdAt,
      });
    return { stored: true, duplicate: false, attributionStatus };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/UNIQUE/i.test(message)) {
      return { stored: false, duplicate: true, attributionStatus };
    }
    logClickBank("insert failed");
    return { stored: false, duplicate: false, attributionStatus: null, error: "insert_failed" };
  }
}

export function listAffiliateTransactions(limit = 200): StoredTransaction[] {
  const cap = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 200;
  return getDb()
    .prepare(
      `SELECT t.id, t.provider, t.externalTransactionId, t.transactionType,
              t.campaignId, c.name AS campaignName, t.sessionId, t.clickId,
              t.occurredAt, t.currency, t.affiliateCommissionCents,
              t.trackingValue, t.attributionStatus, t.createdAt
       FROM affiliate_transactions t
       LEFT JOIN campaigns c ON c.id = t.campaignId
       ORDER BY t.occurredAt DESC, t.id DESC
       LIMIT ?`,
    )
    .all(cap) as StoredTransaction[];
}

function countTypes(
  sqlExtra: string,
  params: Array<string | number>,
  predicate: (type: string) => boolean,
): number {
  const rows = getDb()
    .prepare(
      `SELECT transactionType AS type, COUNT(*) AS n
       FROM affiliate_transactions
       WHERE 1=1${sqlExtra}
       GROUP BY transactionType`,
    )
    .all(...params) as Array<{ type: string; n: number }>;
  let total = 0;
  for (const row of rows) {
    if (isOfficialTransactionType(row.type) && !isTestType(row.type) && predicate(row.type)) {
      total += row.n;
    }
  }
  return total;
}

function commissionTotals(sqlExtra: string, params: Array<string | number>): {
  gross: number;
  refunded: number;
  net: number;
} {
  const rows = getDb()
    .prepare(
      `SELECT transactionType AS type, affiliateCommissionCents AS cents
       FROM affiliate_transactions
       WHERE 1=1${sqlExtra}`,
    )
    .all(...params) as Array<{ type: string; cents: number }>;
  let gross = 0;
  let refunded = 0;
  let net = 0;
  for (const row of rows) {
    if (!isOfficialTransactionType(row.type) || isTestType(row.type) || !countsTowardCommission(row.type)) {
      continue;
    }
    const signed = signedCommissionCents(row.type, row.cents);
    net += signed;
    if (signed > 0) gross += signed;
    if (signed < 0) refunded += -signed;
  }
  return { gross, refunded, net };
}

export function getCampaignCommerce(
  campaignId: number,
  range: AnalyticsRange,
  now = new Date(),
  ctaSessions = 0,
  insConfigured = false,
): CampaignCommerce {
  const start = rangeStartIso(range, now);
  const filter = timeClause("occurredAt", start);
  const attributedSql = ` AND campaignId = ? AND attributionStatus = 'ATTRIBUTED'${filter.sql}`;
  const attributedParams: Array<string | number> = [campaignId, ...filter.params];
  const unattrSql = ` AND attributionStatus = 'UNATTRIBUTED'${filter.sql}`;

  const sales = countTypes(attributedSql, attributedParams, isSaleType);
  const refunds = countTypes(attributedSql, attributedParams, isRefundType);
  const chargebacks = countTypes(attributedSql, attributedParams, isChargebackType);
  const rebills = countTypes(attributedSql, attributedParams, isRebillType);
  const unattributedSalesSitewide = countTypes(unattrSql, filter.params, isSaleType);
  const money = commissionTotals(attributedSql, attributedParams);
  const ctaToSaleRate = ctaSessions > 0 ? sales / ctaSessions : null;

  return {
    sales,
    refunds,
    chargebacks,
    rebills,
    attributedSales: sales,
    unattributedSalesSitewide,
    grossCommissionCents: money.gross,
    refundedCommissionCents: money.refunded,
    netCommissionCents: money.net,
    ctaToSaleRate,
    insConfigured,
  };
}

export function emptyCampaignCommerce(insConfigured: boolean): CampaignCommerce {
  return {
    sales: 0,
    refunds: 0,
    chargebacks: 0,
    rebills: 0,
    attributedSales: 0,
    unattributedSalesSitewide: 0,
    grossCommissionCents: 0,
    refundedCommissionCents: 0,
    netCommissionCents: 0,
    ctaToSaleRate: null,
    insConfigured,
  };
}
