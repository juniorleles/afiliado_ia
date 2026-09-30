/**
 * First-party funnel measurement (Phase 4).
 *
 * VISIT → CTA CLICK → outbound affiliate hop.
 * ClickBank sales arrive later via INS (Phase 5). Google Ads API is not connected.
 *
 * Visits and sessions do not necessarily represent individual humans.
 */

export const SESSION_COOKIE = "aia_sid";
export const SESSION_HEADER = "x-aia-sid";
export const ANALYTICS_SKIP_HEADER = "x-aia-analytics";
export const ANALYTICS_SKIP_VALUE = "skip";
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30;
export const VIEW_DEDUPE_MS = 2000;
export const ATTR_MAX_LEN = 200;
export const REFERRER_MAX_LEN = 300;

export const CTA_POSITIONS = ["header", "hero", "middle", "final", "guarantee", "sticky"] as const;
export type CtaPosition = (typeof CTA_POSITIONS)[number];

export const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "fbclid",
  "msclkid",
] as const;

export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];

export type Attribution = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  gclid: string | null;
  fbclid: string | null;
  msclkid: string | null;
};

export type AnalyticsRange = "today" | "7d" | "30d" | "all";

const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function generateSessionId(): string {
  return crypto.randomUUID();
}

export function generateClickId(): string {
  return crypto.randomUUID();
}

export function isValidSessionId(value: string | undefined | null): value is string {
  return typeof value === "string" && SESSION_ID_RE.test(value);
}

export function isValidClickId(value: string | undefined | null): value is string {
  return typeof value === "string" && SESSION_ID_RE.test(value);
}

export function isCtaPosition(value: unknown): value is CtaPosition {
  return typeof value === "string" && (CTA_POSITIONS as readonly string[]).includes(value);
}

export function clipAttr(value: string | null | undefined, max = ATTR_MAX_LEN): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export function parseAttribution(params: URLSearchParams | Record<string, string>): Attribution {
  const get = (key: AttributionKey) => {
    if (params instanceof URLSearchParams) return params.get(key);
    return params[key];
  };

  return {
    utmSource: clipAttr(get("utm_source")),
    utmMedium: clipAttr(get("utm_medium")),
    utmCampaign: clipAttr(get("utm_campaign")),
    utmContent: clipAttr(get("utm_content")),
    utmTerm: clipAttr(get("utm_term")),
    gclid: clipAttr(get("gclid")),
    fbclid: clipAttr(get("fbclid")),
    msclkid: clipAttr(get("msclkid")),
  };
}

export function emptyAttribution(): Attribution {
  return {
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    utmTerm: null,
    gclid: null,
    fbclid: null,
    msclkid: null,
  };
}

export function canRecordAnalytics(input: {
  published: boolean;
  isPreview: boolean;
  skipHeader: boolean;
}): boolean {
  if (input.isPreview) return false;
  if (input.skipHeader) return false;
  if (!input.published) return false;
  return true;
}

export function shouldDedupeView(previousIso: string | null, nowMs: number, windowMs = VIEW_DEDUPE_MS): boolean {
  if (!previousIso) return false;
  const previous = Date.parse(previousIso);
  if (Number.isNaN(previous)) return false;
  return nowMs - previous < windowMs;
}

export function rangeStartIso(range: AnalyticsRange, now = new Date()): string | null {
  if (range === "all") return null;
  if (range === "today") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  }
  const days = range === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function parseAnalyticsRange(raw: string | undefined | null): AnalyticsRange {
  if (raw === "today" || raw === "7d" || raw === "30d" || raw === "all") return raw;
  return "7d";
}

/** Session-level CTR: CTA sessions / unique presell sessions. */
export function sessionCtr(ctaSessions: number, uniqueSessions: number): number | null {
  if (uniqueSessions <= 0) return null;
  return ctaSessions / uniqueSessions;
}

export function formatCtr(ctr: number | null): string {
  if (ctr === null) return "n/a";
  return `${(ctr * 100).toFixed(1)}%`;
}

export function analyticsSkipHeaders(): HeadersInit {
  return { [ANALYTICS_SKIP_HEADER]: ANALYTICS_SKIP_VALUE };
}
