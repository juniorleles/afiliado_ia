/**
 * Host record domain: authentication session.
 *
 * A frozen copy of one authenticated account list. Credential values are not
 * members of the session, the registry, or the snapshot.
 */
import type { GoogleAuthMetadata } from "./authentication-context";

export const GOOGLE_AUTH_STATUSES = ["OK", "REJECTED"] as const;
export type GoogleAuthStatus = (typeof GOOGLE_AUTH_STATUSES)[number];

export const GOOGLE_AUTH_ORIGINS = ["OBSERVED"] as const;
export type GoogleAuthOrigin = (typeof GOOGLE_AUTH_ORIGINS)[number];

export const GOOGLE_AUTH_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type GoogleAuthProvenance = (typeof GOOGLE_AUTH_PROVENANCE)[number];

export interface GoogleAuthIssue {
  field: string;
  message: string;
}

export const GOOGLE_AUTH_ACCOUNT_KEYS = [
  "customerId",
  "resourceName",
  "descriptiveName",
  "manager",
  "currencyCode",
  "timeZone",
  "status",
  "parentCustomerId",
  "level",
] as const;

export interface GoogleAuthAccount {
  customerId: string;
  resourceName: string;
  descriptiveName: string | null;
  manager: boolean;
  currencyCode: string | null;
  timeZone: string | null;
  status: string | null;
  parentCustomerId: string | null;
  level: number | null;
}

export const GOOGLE_AUTH_REGISTRY_KEYS = ["registryId", "accounts", "managerAccounts", "childAccounts", "accessibleCustomerIds"] as const;

export interface GoogleAuthRegistry {
  registryId: string;
  accounts: readonly GoogleAuthAccount[];
  managerAccounts: readonly GoogleAuthAccount[];
  childAccounts: readonly GoogleAuthAccount[];
  accessibleCustomerIds: readonly string[];
}

export const GOOGLE_AUTH_SESSION_KEYS = ["sessionId", "authenticated", "tokenType", "expiresIn", "customerCount", "origin", "provenance"] as const;

export interface GoogleAuthSession {
  sessionId: string;
  authenticated: true;
  tokenType: string;
  expiresIn: number;
  customerCount: number;
  origin: GoogleAuthOrigin;
  provenance: GoogleAuthProvenance;
}

export const GOOGLE_AUTH_QUERY_KEYS = ["customerId", "kind", "query"] as const;

export interface GoogleAuthQueryRecord {
  customerId: string;
  kind: "customer" | "customer_client";
  query: string;
}

export const GOOGLE_AUTH_EVIDENCE_KEYS = ["grantType", "tokenType", "expiresIn", "accessibleResourceNames", "queries"] as const;

export interface GoogleAuthEvidence {
  grantType: "refresh_token";
  tokenType: string;
  expiresIn: number;
  accessibleResourceNames: readonly string[];
  queries: readonly GoogleAuthQueryRecord[];
}

export const GOOGLE_AUTH_STATISTICS_KEYS = [
  "accountCount",
  "managerCount",
  "childCount",
  "accessibleCustomerCount",
  "issueCount",
  "executionTime",
] as const;

export interface GoogleAuthStatistics {
  accountCount: number;
  managerCount: number;
  childCount: number;
  accessibleCustomerCount: number;
  issueCount: number;
  executionTime: number;
}

export const GOOGLE_AUTH_CONTEXT_RECORD_KEYS = ["customerIds"] as const;

export interface GoogleAuthContextRecord {
  customerIds: readonly string[];
}

export const GOOGLE_AUTH_SNAPSHOT_KEYS = [
  "authenticationId",
  "session",
  "accounts",
  "registry",
  "evidence",
  "statistics",
  "context",
  "createdAt",
  "origin",
  "provenance",
  "metadata",
] as const;

export interface GoogleAuthSnapshot {
  authenticationId: string;
  session: GoogleAuthSession;
  accounts: readonly GoogleAuthAccount[];
  registry: GoogleAuthRegistry;
  evidence: GoogleAuthEvidence;
  statistics: GoogleAuthStatistics;
  context: GoogleAuthContextRecord;
  createdAt: string;
  origin: GoogleAuthOrigin;
  provenance: GoogleAuthProvenance;
  metadata: GoogleAuthMetadata;
}

export const GOOGLE_AUTH_RESULT_KEYS = [
  "status",
  "issues",
  "session",
  "accounts",
  "registry",
  "evidence",
  "statistics",
  "snapshot",
  "metadata",
  "executionTime",
] as const;

export interface GoogleAuthResult {
  status: GoogleAuthStatus;
  issues: GoogleAuthIssue[];
  session: GoogleAuthSession | null;
  accounts: readonly GoogleAuthAccount[] | null;
  registry: GoogleAuthRegistry | null;
  evidence: GoogleAuthEvidence | null;
  statistics: GoogleAuthStatistics;
  snapshot: GoogleAuthSnapshot | null;
  metadata: GoogleAuthMetadata;
  executionTime: number;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepGoogleAuth<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepGoogleAuth(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function createGoogleAuthStatistics(init: GoogleAuthStatistics): GoogleAuthStatistics {
  return freezeDeepGoogleAuth({
    accountCount: init.accountCount,
    managerCount: init.managerCount,
    childCount: init.childCount,
    accessibleCustomerCount: init.accessibleCustomerCount,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

export function createGoogleAuthSnapshot(init: {
  authenticationId: string;
  session: GoogleAuthSession;
  accounts: readonly GoogleAuthAccount[];
  registry: GoogleAuthRegistry;
  evidence: GoogleAuthEvidence;
  statistics: GoogleAuthStatistics;
  context: GoogleAuthContextRecord;
  createdAt: string;
  metadata?: GoogleAuthMetadata;
}): GoogleAuthSnapshot {
  return freezeDeepGoogleAuth({
    authenticationId: init.authenticationId,
    session: init.session,
    accounts: init.accounts.map((account) => ({ ...account })),
    registry: {
      registryId: init.registry.registryId,
      accounts: init.registry.accounts.map((account) => ({ ...account })),
      managerAccounts: init.registry.managerAccounts.map((account) => ({ ...account })),
      childAccounts: init.registry.childAccounts.map((account) => ({ ...account })),
      accessibleCustomerIds: [...init.registry.accessibleCustomerIds],
    },
    evidence: {
      grantType: init.evidence.grantType,
      tokenType: init.evidence.tokenType,
      expiresIn: init.evidence.expiresIn,
      accessibleResourceNames: [...init.evidence.accessibleResourceNames],
      queries: init.evidence.queries.map((query) => ({ ...query })),
    },
    statistics: init.statistics,
    context: { customerIds: [...init.context.customerIds] },
    createdAt: init.createdAt,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    metadata: { ...(init.metadata ?? {}) },
  });
}
