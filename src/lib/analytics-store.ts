import { getDb } from "@/lib/db";
import {
  type Attribution,
  type AnalyticsRange,
  type CtaPosition,
  emptyAttribution,
  generateClickId,
  isCtaPosition,
  isValidClickId,
  isValidSessionId,
  rangeStartIso,
  sessionCtr,
  shouldDedupeView,
  VIEW_DEDUPE_MS,
  clipAttr,
  REFERRER_MAX_LEN,
} from "@/lib/analytics";
import { getCampaignById } from "@/lib/campaigns";
import { getClickBankInsSecret } from "@/lib/clickbank";
import { emptyCampaignCommerce, getCampaignCommerce, type CampaignCommerce } from "@/lib/clickbank-store";

export type VisitInput = {
  campaignId: number;
  sessionId: string;
  attribution: Attribution;
  referrer?: string | null;
  at?: Date;
};

export type ClickInput = {
  campaignId: number;
  sessionId: string;
  ctaPosition: CtaPosition;
  clickId?: string;
  attribution?: Attribution;
  at?: Date;
};

export type CampaignAnalytics = {
  visits: number;
  uniqueSessions: number;
  ctaEvents: number;
  ctaSessions: number;
  ctr: number | null;
  byPosition: Record<CtaPosition, number>;
  utmSource: Array<{ key: string; sessions: number }>;
  utmMedium: Array<{ key: string; sessions: number }>;
  gclidSessions: number;
  commerce: CampaignCommerce;
};

function logAnalyticsError(message: string) {
  console.error(`[analytics] ${message}`);
}

export function recordVisit(input: VisitInput): { recorded: boolean } {
  if (!Number.isInteger(input.campaignId) || input.campaignId < 1) {
    return { recorded: false };
  }
  if (!isValidSessionId(input.sessionId)) {
    return { recorded: false };
  }

  const db = getDb();
  const now = input.at ?? new Date();
  const last = db
    .prepare(
      `SELECT visitedAt FROM presell_visits
       WHERE campaignId = ? AND sessionId = ?
       ORDER BY visitedAt DESC LIMIT 1`,
    )
    .get(input.campaignId, input.sessionId) as { visitedAt: string } | undefined;

  if (shouldDedupeView(last?.visitedAt ?? null, now.getTime(), VIEW_DEDUPE_MS)) {
    return { recorded: false };
  }

  const attr = input.attribution;
  db.prepare(
    `INSERT INTO presell_visits (
      campaignId, sessionId, visitedAt,
      utmSource, utmMedium, utmCampaign, utmContent, utmTerm,
      gclid, fbclid, msclkid, referrer
    ) VALUES (
      @campaignId, @sessionId, @visitedAt,
      @utmSource, @utmMedium, @utmCampaign, @utmContent, @utmTerm,
      @gclid, @fbclid, @msclkid, @referrer
    )`,
  ).run({
    campaignId: input.campaignId,
    sessionId: input.sessionId,
    visitedAt: now.toISOString(),
    utmSource: attr.utmSource,
    utmMedium: attr.utmMedium,
    utmCampaign: attr.utmCampaign,
    utmContent: attr.utmContent,
    utmTerm: attr.utmTerm,
    gclid: attr.gclid,
    fbclid: attr.fbclid,
    msclkid: attr.msclkid,
    referrer: clipAttr(input.referrer, REFERRER_MAX_LEN),
  });

  return { recorded: true };
}

export function recordVisitSafe(input: VisitInput): { recorded: boolean } {
  try {
    return recordVisit(input);
  } catch {
    logAnalyticsError("visit insert failed");
    return { recorded: false };
  }
}

function latestVisitAttribution(campaignId: number, sessionId: string): Attribution {
  const row = getDb()
    .prepare(
      `SELECT utmSource, utmMedium, utmCampaign, utmContent, utmTerm, gclid, fbclid, msclkid
       FROM presell_visits
       WHERE campaignId = ? AND sessionId = ?
       ORDER BY visitedAt DESC LIMIT 1`,
    )
    .get(campaignId, sessionId) as Attribution | undefined;
  return row ?? emptyAttribution();
}

export function recordClick(input: ClickInput): { recorded: boolean; clickId: string } {
  let clickId = input.clickId;
  if (clickId != null && clickId !== "") {
    if (!isValidClickId(clickId)) {
      return { recorded: false, clickId };
    }
  } else {
    clickId = generateClickId();
  }
  if (!Number.isInteger(input.campaignId) || input.campaignId < 1) {
    return { recorded: false, clickId };
  }
  if (!isValidSessionId(input.sessionId)) {
    return { recorded: false, clickId };
  }
  if (!isCtaPosition(input.ctaPosition)) {
    return { recorded: false, clickId };
  }

  const attr = input.attribution ?? latestVisitAttribution(input.campaignId, input.sessionId);
  const now = input.at ?? new Date();

  try {
    getDb()
      .prepare(
        `INSERT INTO cta_clicks (
          clickId, campaignId, sessionId, clickedAt, ctaPosition,
          utmSource, utmMedium, utmCampaign, utmContent, utmTerm,
          gclid, fbclid, msclkid
        ) VALUES (
          @clickId, @campaignId, @sessionId, @clickedAt, @ctaPosition,
          @utmSource, @utmMedium, @utmCampaign, @utmContent, @utmTerm,
          @gclid, @fbclid, @msclkid
        )`,
      )
      .run({
        clickId,
        campaignId: input.campaignId,
        sessionId: input.sessionId,
        clickedAt: now.toISOString(),
        ctaPosition: input.ctaPosition,
        utmSource: attr.utmSource,
        utmMedium: attr.utmMedium,
        utmCampaign: attr.utmCampaign,
        utmContent: attr.utmContent,
        utmTerm: attr.utmTerm,
        gclid: attr.gclid,
        fbclid: attr.fbclid,
        msclkid: attr.msclkid,
      });
    return { recorded: true, clickId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/UNIQUE/i.test(message)) {
      return { recorded: false, clickId };
    }
    throw err;
  }
}

export function recordClickSafe(input: ClickInput): { recorded: boolean; clickId: string } {
  try {
    return recordClick(input);
  } catch {
    logAnalyticsError("click insert failed");
    return { recorded: false, clickId: input.clickId ?? generateClickId() };
  }
}

function timeClause(column: string, startIso: string | null): { sql: string; params: string[] } {
  if (!startIso) return { sql: "", params: [] };
  return { sql: ` AND ${column} >= ?`, params: [startIso] };
}

export function getCampaignAnalytics(campaignId: number, range: AnalyticsRange, now = new Date()): CampaignAnalytics {
  const start = rangeStartIso(range, now);
  const db = getDb();
  const visitFilter = timeClause("visitedAt", start);
  const clickFilter = timeClause("clickedAt", start);

  const visits = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM presell_visits WHERE campaignId = ?${visitFilter.sql}`)
      .get(campaignId, ...visitFilter.params) as { n: number }
  ).n;

  const uniqueSessions = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT sessionId) AS n FROM presell_visits WHERE campaignId = ?${visitFilter.sql}`,
      )
      .get(campaignId, ...visitFilter.params) as { n: number }
  ).n;

  const ctaEvents = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM cta_clicks WHERE campaignId = ?${clickFilter.sql}`)
      .get(campaignId, ...clickFilter.params) as { n: number }
  ).n;

  const ctaSessions = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT sessionId) AS n FROM cta_clicks WHERE campaignId = ?${clickFilter.sql}`,
      )
      .get(campaignId, ...clickFilter.params) as { n: number }
  ).n;

  const positionRows = db
    .prepare(
      `SELECT ctaPosition AS position, COUNT(*) AS n FROM cta_clicks
       WHERE campaignId = ?${clickFilter.sql}
       GROUP BY ctaPosition`,
    )
    .all(campaignId, ...clickFilter.params) as Array<{ position: string; n: number }>;

  const byPosition: Record<CtaPosition, number> = { hero: 0, middle: 0, final: 0, guarantee: 0, sticky: 0 };
  for (const row of positionRows) {
    if (isCtaPosition(row.position)) byPosition[row.position] = row.n;
  }

  const utmSource = db
    .prepare(
      `SELECT COALESCE(utmSource, '(none)') AS key, COUNT(DISTINCT sessionId) AS sessions
       FROM presell_visits WHERE campaignId = ?${visitFilter.sql}
       GROUP BY utmSource ORDER BY sessions DESC LIMIT 12`,
    )
    .all(campaignId, ...visitFilter.params) as Array<{ key: string; sessions: number }>;

  const utmMedium = db
    .prepare(
      `SELECT COALESCE(utmMedium, '(none)') AS key, COUNT(DISTINCT sessionId) AS sessions
       FROM presell_visits WHERE campaignId = ?${visitFilter.sql}
       GROUP BY utmMedium ORDER BY sessions DESC LIMIT 12`,
    )
    .all(campaignId, ...visitFilter.params) as Array<{ key: string; sessions: number }>;

  const gclidSessions = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT sessionId) AS n FROM presell_visits
         WHERE campaignId = ? AND gclid IS NOT NULL AND gclid != ''${visitFilter.sql}`,
      )
      .get(campaignId, ...visitFilter.params) as { n: number }
  ).n;

  let commerce: CampaignCommerce;
  try {
    commerce = getCampaignCommerce(
      campaignId,
      range,
      now,
      ctaSessions,
      Boolean(getClickBankInsSecret()),
    );
  } catch {
    logAnalyticsError("commerce rollup failed");
    commerce = emptyCampaignCommerce(Boolean(getClickBankInsSecret()));
  }

  return {
    visits,
    uniqueSessions,
    ctaEvents,
    ctaSessions,
    ctr: sessionCtr(ctaSessions, uniqueSessions),
    byPosition,
    utmSource,
    utmMedium,
    gclidSessions,
    commerce,
  };
}

export function campaignIsPublished(campaignId: number): boolean {
  const campaign = getCampaignById(campaignId);
  return campaign?.publicationStatus === "published";
}
