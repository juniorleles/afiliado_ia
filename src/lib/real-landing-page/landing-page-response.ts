/**
 * Host record domain: real landing page response and snapshot.
 *
 * A frozen copy of one downloaded page. The markup is stored as text.
 * This module does not read that text and does not reach an outside system.
 */
import type { RealLandingPageMetadata } from "./landing-page-context";

export const REAL_LANDING_PAGE_STATUSES = ["OK", "REJECTED"] as const;
export type RealLandingPageStatus = (typeof REAL_LANDING_PAGE_STATUSES)[number];

export const REAL_LANDING_PAGE_ORIGINS = ["COLLECTED"] as const;
export type RealLandingPageOrigin = (typeof REAL_LANDING_PAGE_ORIGINS)[number];

export const REAL_LANDING_PAGE_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type RealLandingPageProvenance = (typeof REAL_LANDING_PAGE_PROVENANCE)[number];

export interface RealLandingPageIssue {
  field: string;
  message: string;
}

export const REAL_LANDING_PAGE_KEYS = [
  "landingPageId",
  "originalUrl",
  "finalUrl",
  "redirectChain",
  "httpStatus",
  "headers",
  "html",
  "responseBytes",
  "responseTime",
  "retrievedAt",
  "origin",
  "provenance",
  "metadata",
] as const;

export interface RealLandingPageSnapshot {
  landingPageId: string;
  originalUrl: string;
  finalUrl: string;
  redirectChain: readonly string[];
  httpStatus: number;
  headers: Record<string, string>;
  html: string;
  responseBytes: number;
  responseTime: number;
  retrievedAt: string;
  origin: RealLandingPageOrigin;
  provenance: RealLandingPageProvenance;
  metadata: RealLandingPageMetadata;
}

export const REAL_LANDING_PAGE_STATISTICS_KEYS = ["requestCount", "pageCount", "responseBytes", "issueCount", "executionTime"] as const;

export interface RealLandingPageStatistics {
  requestCount: number;
  pageCount: number;
  responseBytes: number;
  issueCount: number;
  executionTime: number;
}

export const REAL_LANDING_PAGE_CONTEXT_RECORD_KEYS = ["urls"] as const;

export interface RealLandingPageContextRecord {
  urls: readonly string[];
}

export const REAL_LANDING_PAGE_SESSION_KEYS = [
  "sessionId",
  "pages",
  "statistics",
  "context",
  "createdAt",
  "origin",
  "provenance",
  "metadata",
] as const;

export interface RealLandingPageSessionSnapshot {
  sessionId: string;
  pages: readonly RealLandingPageSnapshot[];
  statistics: RealLandingPageStatistics;
  context: RealLandingPageContextRecord;
  createdAt: string;
  origin: RealLandingPageOrigin;
  provenance: RealLandingPageProvenance;
  metadata: RealLandingPageMetadata;
}

export const REAL_LANDING_PAGE_RESULT_KEYS = [
  "status",
  "issues",
  "pages",
  "statistics",
  "snapshot",
  "metadata",
  "executionTime",
] as const;

export interface RealLandingPageResult {
  status: RealLandingPageStatus;
  issues: RealLandingPageIssue[];
  pages: readonly RealLandingPageSnapshot[] | null;
  statistics: RealLandingPageStatistics;
  snapshot: RealLandingPageSessionSnapshot | null;
  metadata: RealLandingPageMetadata;
  executionTime: number;
}

export interface RealLandingPageSnapshotInit {
  landingPageId: string;
  originalUrl: string;
  finalUrl: string;
  redirectChain: readonly string[];
  httpStatus: number;
  headers: Record<string, string>;
  html: string;
  responseBytes: number;
  responseTime: number;
  retrievedAt: string;
  metadata?: RealLandingPageMetadata;
}

export interface RealLandingPageSessionInit {
  sessionId: string;
  pages: readonly RealLandingPageSnapshot[];
  statistics: RealLandingPageStatistics;
  context: RealLandingPageContextRecord;
  createdAt: string;
  metadata?: RealLandingPageMetadata;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepRealLandingPage<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepRealLandingPage(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainRealLandingPage<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainRealLandingPage(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainRealLandingPage(inner)])) as T;
  }
  return value;
}

export function createRealLandingPageStatistics(init: RealLandingPageStatistics): RealLandingPageStatistics {
  return freezeDeepRealLandingPage({
    requestCount: init.requestCount,
    pageCount: init.pageCount,
    responseBytes: init.responseBytes,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

export function createRealLandingPageSnapshot(init: RealLandingPageSnapshotInit): RealLandingPageSnapshot {
  return freezeDeepRealLandingPage({
    landingPageId: init.landingPageId,
    originalUrl: init.originalUrl,
    finalUrl: init.finalUrl,
    redirectChain: [...init.redirectChain],
    httpStatus: init.httpStatus,
    headers: { ...init.headers },
    html: init.html,
    responseBytes: init.responseBytes,
    responseTime: init.responseTime,
    retrievedAt: init.retrievedAt,
    origin: "COLLECTED",
    provenance: "DIRECT_SOURCE",
    metadata: { ...(init.metadata ?? {}) },
  });
}

export function createRealLandingPageSessionSnapshot(init: RealLandingPageSessionInit): RealLandingPageSessionSnapshot {
  return freezeDeepRealLandingPage({
    sessionId: init.sessionId,
    pages: init.pages,
    statistics: init.statistics,
    context: { urls: [...init.context.urls] },
    createdAt: init.createdAt,
    origin: "COLLECTED",
    provenance: "DIRECT_SOURCE",
    metadata: { ...(init.metadata ?? {}) },
  });
}
