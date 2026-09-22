export const PRIMARY_BLOCK_REASONS = [
  "HTTP_403",
  "ACCESS_DENIED",
  "ROBOTS_BLOCKED",
  "ANTI_BOT_BLOCKED",
] as const;
export type PrimaryBlockReason = (typeof PRIMARY_BLOCK_REASONS)[number];

export const SOURCE_STATUSES = ["ACCEPTED", "IDENTITY_UNCERTAIN", "REJECTED"] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const SOURCE_RESOLUTION_PHASES = [
  "PRIMARY_IMPORT",
  "PRIMARY_BLOCKED",
  "SOURCE_RESOLUTION_STARTED",
  "SEARCH_QUERY",
  "SEARCH_RESULTS",
  "SEARCH_TIMEOUT",
  "IDENTITY_CHECK",
  "SOURCE_RESOLUTION_COMPLETE",
  "SEARCH_NOT_CONFIGURED",
  "FETCH_TIMEOUT",
  "GLOBAL_TIMEOUT",
] as const;
export type SourceResolutionPhase = (typeof SOURCE_RESOLUTION_PHASES)[number];

export type SearchHit = {
  url: string;
  title: string;
  snippet: string;
};

export type DiscoveredSource = {
  url: string;
  title: string;
  snippet: string;
  query: string;
  status: SourceStatus;
  identityReasons: string[];
};

export type SearchProviderStatus = {
  implemented: boolean;
  configured: boolean;
  name: string;
  apiKeyPresent: boolean;
  realWebSearchAvailable: boolean;
  missingConfig: string[];
  message: string;
};

export type DiscoveryOutcome =
  | "ALTERNATIVE_SOURCES_FOUND"
  | "NO_VERIFIED_SOURCES"
  | "SEARCH_NOT_CONFIGURED"
  | "NEEDS_PRODUCT_NAME"
  | "TIMED_OUT"
  | "SEARCH_TIMEOUT"
  | "CANCELLED";

export type WebDiscoveryReport = {
  triggered: boolean;
  originalUrl: string;
  primaryBlock: PrimaryBlockReason | null;
  productName: string;
  message: string;
  queriesUsed: string[];
  sources: DiscoveredSource[];
  acceptedCount: number;
  uncertainCount: number;
  phases: Array<{ phase: SourceResolutionPhase; detail?: string }>;
  outcome: DiscoveryOutcome;
  operatorMessages: string[];
  searchProvider: SearchProviderStatus;
  timings?: {
    PRIMARY_FETCH_MS: number;
    SEARCH_MS: number;
    ALTERNATIVE_FETCH_MS: number;
    IDENTITY_MS: number;
    EXTRACTION_MS: number;
    ROBOTS_CHECK_MS: number;
    TOTAL_IMPORT_MS: number;
  };
  counts?: {
    SEARCH_RESULTS: number;
    SOURCES_ATTEMPTED: number;
    SOURCES_TIMEOUT: number;
    SOURCES_ACCEPTED: number;
    SOURCES_REJECTED: number;
  };
};

export const SEARCH_OUTCOME_STATUSES = [
  "SUCCESS",
  "SUCCESS_EMPTY",
  "SEARCH_TIMEOUT",
  "HTTP_ERROR",
  "PARSE_ERROR",
  "GLOBAL_ABORT",
] as const;
export type SearchOutcomeStatus = (typeof SEARCH_OUTCOME_STATUSES)[number];

export type SearchOutcome = {
  status: SearchOutcomeStatus;
  hits: SearchHit[];
  httpStatus?: number | null;
  error?: string;
};

export type SearchFn = (query: string, signal?: AbortSignal) => Promise<SearchHit[]>;

export type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;
