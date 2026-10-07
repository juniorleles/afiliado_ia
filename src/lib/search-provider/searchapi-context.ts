/**
 * Host record domain: read-only SearchApi context.
 *
 * Interface only. The host is given a keyword, a locale, a device, and
 * optional search options. It does not reshape the JSON it receives.
 */
import type { SearchApiMetadata } from "./searchapi-types";

export const SEARCHAPI_CONTEXT_MEMBERS = [
  "keyword",
  "country",
  "language",
  "device",
  "searchOptions",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;

/**
 * Read-only bundle one SearchApi retrieval may be given. Nothing here is written back.
 */
export interface SearchApiContext {
  keyword?: string;
  country?: string;
  language?: string;
  device?: string;
  searchOptions?: Readonly<Record<string, string>>;
  executionMetadata?: SearchApiMetadata;
  runtimeMetadata?: SearchApiMetadata;
  configuration?: SearchApiMetadata;
}
