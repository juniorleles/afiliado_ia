/**
 * Opportunity Engine: domain model.
 *
 * Architecture only. This module names the shapes the engine will exchange.
 * It defines no scale, weight, formula, or rule: fields such as `weight` are
 * carried data whose meaning a later step defines. Nothing here depends on
 * Discovery, Google Ads, AI, or any other platform module.
 */

/** The groups a signal can belong to. */
export const OPPORTUNITY_SIGNAL_CATEGORIES = [
  "COMPETITION",
  "COMMERCIAL_INTENT",
  "EVIDENCE",
  "LANDING_PAGE",
  "MARKET",
  "BRAND",
  "OFFER",
  "COMPLIANCE",
  "FUTURE",
] as const;
export type OpportunitySignalCategory = (typeof OPPORTUNITY_SIGNAL_CATEGORIES)[number];

/** Lifecycle of an analysis. */
export const OPPORTUNITY_STATUSES = ["PENDING", "ANALYZING", "COMPLETED", "FAILED"] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

/** Whether a signal definition is in use. Changed only through the registry. */
export const OPPORTUNITY_SIGNAL_STATUSES = ["ENABLED", "DISABLED"] as const;
export type OpportunitySignalStatus = (typeof OPPORTUNITY_SIGNAL_STATUSES)[number];

/** Flat metadata: strings, numbers, booleans, or null. */
export type OpportunityMetadata = Record<string, string | number | boolean | null>;

/** One analysis of one discovered candidate. Timestamps are ISO strings. */
export interface OpportunityAnalysis {
  id: string;
  /** The Discovery candidate under analysis. A reference only. */
  candidateId: string;
  status: OpportunityStatus;
  createdAt: string;
  /** Null until the analysis is COMPLETED or FAILED. */
  completedAt: string | null;
  version: number;
}

/** A single named input to an analysis. */
export interface OpportunitySignal {
  id: string;
  category: OpportunitySignalCategory;
  /** Carried data. This architecture assigns it no scale or meaning. */
  weight: number | null;
  status: OpportunitySignalStatus;
  metadata: OpportunityMetadata;
}
