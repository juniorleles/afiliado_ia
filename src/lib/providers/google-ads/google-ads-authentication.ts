/**
 * Host record domain: Google Ads authentication.
 *
 * Turns a read-only configuration, runtime metadata, and execution metadata
 * into one frozen authentication context, validation report, configuration
 * status, session metadata, and snapshot. It loads configuration, validates
 * tokens, and prepares an offline session. It never opens a token flow, never
 * reaches an outside system, and never sends a record. A refused input
 * returns REJECTED with issues and no context. This layer stays offline.
 *
 * This framework is not a transport, not an adapter, and not a campaign
 * builder.
 */
import type { GoogleAdsMetadata } from "./google-ads-types";
import type { GoogleAdsIssue } from "./google-ads-validator";
import {
  copyPlainGoogleAdsAuthentication,
  createGoogleAdsAuthenticationSnapshot,
  freezeDeepGoogleAdsAuthentication,
  type GoogleAdsAuthenticationContext,
  type GoogleAdsAuthenticationHealth,
  type GoogleAdsAuthenticationHealthReport,
  type GoogleAdsAuthenticationReport,
  type GoogleAdsAuthenticationSnapshot,
  type GoogleAdsConfigurationStatus,
  type GoogleAdsSessionMetadata,
} from "./google-ads-authentication-snapshot";
import { createGoogleAdsOAuthConfiguration, type GoogleAdsOAuthConfigurationLoader } from "./google-ads-authentication-configuration";
import { createGoogleAdsTokenStore, type GoogleAdsTokenStore } from "./google-ads-authentication-store";
import { createGoogleAdsTokenValidator, tokenRecordOf, type GoogleAdsTokenValidator } from "./google-ads-authentication-validator";

export const GOOGLE_ADS_AUTHENTICATION_STATUSES = ["OK", "REJECTED"] as const;
export type GoogleAdsAuthenticationStatus = (typeof GOOGLE_ADS_AUTHENTICATION_STATUSES)[number];

export type GoogleAdsAuthenticationClock = () => number;
export type GoogleAdsAuthenticationTimestamp = () => string;
export type GoogleAdsAuthenticationIdFactory = () => string;

export interface GoogleAdsAuthenticationInput {
  configuration?: GoogleAdsMetadata;
  runtimeMetadata?: GoogleAdsMetadata;
  executionMetadata?: GoogleAdsMetadata;
}

export interface GoogleAdsAuthenticationResult {
  status: GoogleAdsAuthenticationStatus;
  issues: GoogleAdsIssue[];
  context: GoogleAdsAuthenticationContext | null;
  report: GoogleAdsAuthenticationReport;
  configurationStatus: GoogleAdsConfigurationStatus;
  session: GoogleAdsSessionMetadata | null;
  snapshot: GoogleAdsAuthenticationSnapshot | null;
  metadata: GoogleAdsMetadata;
  health: GoogleAdsAuthenticationHealth;
  executionTime: number;
}

export interface GoogleAdsAuthentication {
  readonly configuration: GoogleAdsOAuthConfigurationLoader;
  readonly store: GoogleAdsTokenStore;
  readonly validator: GoogleAdsTokenValidator;
  authenticate(input: unknown): GoogleAdsAuthenticationResult;
  healthCheck(input: unknown): GoogleAdsAuthenticationHealthReport;
  getSnapshot(authenticationId: string): GoogleAdsAuthenticationSnapshot | null;
  getSession(sessionId: string): GoogleAdsSessionMetadata | null;
}

export interface GoogleAdsAuthenticationOptions {
  configuration?: GoogleAdsOAuthConfigurationLoader;
  store?: GoogleAdsTokenStore;
  validator?: GoogleAdsTokenValidator;
  now?: GoogleAdsAuthenticationClock;
  timestamp?: GoogleAdsAuthenticationTimestamp;
  idFactory?: GoogleAdsAuthenticationIdFactory;
}

const defaultClock: GoogleAdsAuthenticationClock = () => performance.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reportOf(init: {
  id: string;
  status: GoogleAdsAuthenticationStatus;
  issues: GoogleAdsIssue[];
  configurationStatus: GoogleAdsConfigurationStatus;
  health: GoogleAdsAuthenticationHealth;
  createdAt: string;
  metadata: GoogleAdsMetadata;
}): GoogleAdsAuthenticationReport {
  return freezeDeepGoogleAdsAuthentication({
    id: init.id,
    status: init.status,
    issues: [...init.issues],
    configurationStatus: init.configurationStatus,
    health: init.health,
    createdAt: init.createdAt,
    metadata: copyPlainGoogleAdsAuthentication(init.metadata),
  });
}

function refused(issues: GoogleAdsIssue[], createdAt: string, id: string, metadata: GoogleAdsMetadata, executionTime = 0): GoogleAdsAuthenticationResult {
  const health: GoogleAdsAuthenticationHealth = "UNAVAILABLE";
  return {
    status: "REJECTED",
    issues,
    context: null,
    report: reportOf({ id, status: "REJECTED", issues, configurationStatus: "REJECTED", health, createdAt, metadata }),
    configurationStatus: "REJECTED",
    session: null,
    snapshot: null,
    metadata,
    health,
    executionTime,
  };
}

export function createGoogleAdsAuthentication(options: GoogleAdsAuthenticationOptions = {}): GoogleAdsAuthentication {
  const configuration = options.configuration ?? createGoogleAdsOAuthConfiguration();
  const store = options.store ?? createGoogleAdsTokenStore();
  const validator = options.validator ?? createGoogleAdsTokenValidator();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `auth-${++serial}`);
  const snapshots = new Map<string, GoogleAdsAuthenticationSnapshot>();
  const sessions = new Map<string, GoogleAdsSessionMetadata>();

  return {
    configuration,
    store,
    validator,
    healthCheck(input) {
      try {
        const issues = validator.validateInput(input);
        return freezeDeepGoogleAdsAuthentication({
          status: issues.length > 0 ? "UNAVAILABLE" : "OFFLINE",
          mode: "OFFLINE",
          issues,
        });
      } catch (error) {
        return freezeDeepGoogleAdsAuthentication({
          status: "UNAVAILABLE",
          mode: "OFFLINE",
          issues: [{ field: "authentication", message: error instanceof Error ? error.message : "Invalid Metadata: health could not be checked." }],
        });
      }
    },
    authenticate(input) {
      try {
        const start = now();
        const createdAt = timestamp();
        const id = idFactory();
        const inputIssues = validator.validateInput(input);
        const metadata = isRecord(input) && isRecord(input.executionMetadata) ? copyPlainGoogleAdsAuthentication(input.executionMetadata as GoogleAdsMetadata) : {};
        if (inputIssues.length > 0) return refused(inputIssues, createdAt, id, metadata, Math.max(0, now() - start));
        const draft = input as GoogleAdsAuthenticationInput;
        const loaded = configuration.load(draft.configuration);
        if (loaded.issues.length > 0 || loaded.configuration === null) {
          return refused(loaded.issues, createdAt, id, metadata, Math.max(0, now() - start));
        }
        const sessionId = id.replace(/^auth-/, "session-");
        const tokens = tokenRecordOf(sessionId, loaded.configuration);
        const tokenIssues = store.put(tokens);
        if (tokenIssues.length > 0) return refused(tokenIssues, createdAt, id, metadata, Math.max(0, now() - start));
        const session = freezeDeepGoogleAdsAuthentication({
          id: sessionId,
          authenticationId: id,
          customerId: loaded.configuration.customerId,
          loginCustomerId: loaded.configuration.loginCustomerId,
          environment: loaded.configuration.environment,
          mode: "OFFLINE" as const,
          createdAt,
          metadata,
        });
        const context = freezeDeepGoogleAdsAuthentication({
          id,
          clientId: loaded.configuration.clientId,
          customerId: loaded.configuration.customerId,
          loginCustomerId: loaded.configuration.loginCustomerId,
          environment: loaded.configuration.environment,
          mode: "OFFLINE" as const,
          sessionId,
          configurationStatus: "LOADED" as const,
          metadata,
          createdAt,
        });
        const executionTime = Math.max(0, now() - start);
        const builtIssues = [...validator.validateSession(session), ...validator.validateContext(context), ...validator.validateTokens(tokens)];
        if (builtIssues.length > 0) return refused(builtIssues, createdAt, id, metadata, executionTime);
        const snapshot = createGoogleAdsAuthenticationSnapshot({
          authenticationId: id,
          sessionId,
          clientId: context.clientId,
          customerId: context.customerId,
          mode: "OFFLINE",
          health: "OFFLINE",
          createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, createdAt, id, metadata, executionTime);
        snapshots.set(id, snapshot);
        sessions.set(sessionId, session);
        return {
          status: "OK",
          issues: [],
          context,
          report: reportOf({ id, status: "OK", issues: [], configurationStatus: "LOADED", health: "OFFLINE", createdAt, metadata }),
          configurationStatus: "LOADED",
          session,
          snapshot,
          metadata: context.metadata,
          health: "OFFLINE",
          executionTime,
        };
      } catch (error) {
        return refused(
          [{ field: "authentication", message: error instanceof Error ? error.message : "Invalid Metadata: the framework could not prepare a session." }],
          new Date().toISOString(),
          "auth-0",
          {},
        );
      }
    },
    getSnapshot: (authenticationId) => snapshots.get(authenticationId) ?? null,
    getSession: (sessionId) => sessions.get(sessionId) ?? null,
  };
}
