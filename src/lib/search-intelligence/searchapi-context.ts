/**
 * Host record domain: read-only SearchApi normalizer context.
 *
 * Interface only. The host is given a provider response and flat metadata.
 * It does not retrieve a page.
 */
import type { FlatRecord } from "./searchapi-types";

export const SEARCHAPI_NORMALIZER_CONTEXT_MEMBERS = ["providerResponse", "executionMetadata", "runtimeMetadata", "configuration"] as const;

/**
 * Read-only bundle one normalization may be given. Nothing here is written back.
 * The usual input is the provider response itself.
 */
export interface SearchApiNormalizerContext {
  providerResponse?: unknown;
  executionMetadata?: FlatRecord;
  runtimeMetadata?: FlatRecord;
  configuration?: FlatRecord;
}
