/**
 * Host record domain: read-only context.
 *
 * Interface only. The host is given an execution contract, an execution plan,
 * execution metadata, and runtime metadata. Each named record is an id holder
 * only. The host does not read fields beyond the id, does not copy the
 * contract or the plan, and does not change them.
 */
import type { GoogleAdsMetadata } from "./google-ads-types";

/** Read-only context members the host may be given. */
export const GOOGLE_ADS_CONTEXT_MEMBERS = [
  "executionContract",
  "executionPlan",
  "executionMetadata",
  "runtimeMetadata",
] as const;

/**
 * Read-only bundle the host may be given. Nothing here is written back to an
 * execution contract, an execution plan, or any other engine.
 */
export interface GoogleAdsContext {
  /** The execution contract this model reads. An id holder only. */
  executionContract: { id: string } | null;
  /** The execution plan this model reads. An id holder only. */
  executionPlan: { id: string } | null;
  executionMetadata: GoogleAdsMetadata;
  runtimeMetadata: GoogleAdsMetadata;
}
