/**
 * Traffic Intelligence Engine: domain model.
 *
 * Architecture only. This engine decides how a product should be promoted. It
 * does not create campaigns, generate keywords, or reach any ad platform. This
 * module names the shapes the engine will exchange and defines no scale,
 * weight, formula, or rule: `priority` and `confidence` are carried data whose
 * meaning a later step defines. Nothing here depends on Discovery, the
 * Opportunity Engine, an ad platform, AI, or any other platform module.
 *
 * Other engines are referred to by id only. A traffic analysis points at the
 * Discovery candidate and at the Opportunity analysis it follows; it never
 * copies or changes either.
 */

/** The groups a traffic signal can belong to. */
export const TRAFFIC_SIGNAL_CATEGORIES = [
  "TRAFFIC_CHANNEL",
  "TRAFFIC_RISK",
  "TRAFFIC_STRATEGY",
  "POLICY",
  "AUDIENCE",
  "OFFER",
  "CREATIVE",
  "FUTURE",
] as const;
export type TrafficSignalCategory = (typeof TRAFFIC_SIGNAL_CATEGORIES)[number];

/** Lifecycle of an analysis. */
export const TRAFFIC_STATUSES = ["PENDING", "ANALYZING", "COMPLETED", "FAILED"] as const;
export type TrafficStatus = (typeof TRAFFIC_STATUSES)[number];

/**
 * The only moves between statuses. COMPLETED and FAILED are final: a finished
 * analysis is never reopened, so a closed decision cannot be brought back.
 */
export const TRAFFIC_STATUS_TRANSITIONS: Readonly<Record<TrafficStatus, readonly TrafficStatus[]>> = {
  PENDING: ["ANALYZING", "FAILED"],
  ANALYZING: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
};

/** Flat metadata: strings, numbers, booleans, or null. */
export type TrafficMetadata = Record<string, string | number | boolean | null>;

/** One analysis of how one discovered candidate should be promoted. Timestamps are ISO strings. */
export interface TrafficAnalysis {
  id: string;
  /** The Discovery candidate under analysis. A reference only. */
  candidateId: string;
  /** The Opportunity analysis this one follows. A reference only. */
  opportunityAnalysisId: string;
  status: TrafficStatus;
  createdAt: string;
  /** Null until the analysis is COMPLETED or FAILED. */
  completedAt: string | null;
  version: number;
}

/** A single named input to a traffic analysis. */
export interface TrafficSignal {
  id: string;
  category: TrafficSignalCategory;
  /** Carried data. This architecture assigns it no scale or meaning. */
  priority: number;
  /** Changed only through the registry. A disabled signal stays registered. */
  enabled: boolean;
  metadata: TrafficMetadata;
}
