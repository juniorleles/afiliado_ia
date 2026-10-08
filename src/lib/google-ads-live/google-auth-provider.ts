/**
 * Host record domain: authentication provider.
 *
 * One entry point from OAuth configuration to a frozen account registry.
 * A refused run returns REJECTED and stores nothing. The grant used for the
 * account read is not stored. This method never throws.
 */
import { buildAccountRegistry } from "./account-registry";
import type { GoogleAuthMetadata } from "./authentication-context";
import {
  createGoogleAuthSnapshot,
  createGoogleAuthStatistics,
  freezeDeepGoogleAuth,
  type GoogleAuthResult,
  type GoogleAuthSession,
  type GoogleAuthSnapshot,
} from "./authentication-session";
import { createGoogleAuthValidator, type GoogleAuthValidator } from "./authentication-validator";
import { readCustomers } from "./customer-manager";
import { GOOGLE_ADS_API_VERSION, createGoogleAuthHttpClient, type GoogleAuthTransport } from "./google-auth-client";
import { exchangeRefreshToken } from "./oauth-manager";

export type GoogleAuthClock = () => number;
export type GoogleAuthTimestamp = () => string;
export type GoogleAuthIdFactory = () => string;

export interface GoogleAuthProviderOptions {
  now?: GoogleAuthClock;
  timestamp?: GoogleAuthTimestamp;
  idFactory?: GoogleAuthIdFactory;
  sessionFactory?: GoogleAuthIdFactory;
  registryFactory?: GoogleAuthIdFactory;
  transport?: GoogleAuthTransport;
  validator?: GoogleAuthValidator;
}

export interface GoogleAuthProvider {
  readonly validator: GoogleAuthValidator;
  authenticate(input: unknown): Promise<GoogleAuthResult>;
  getSnapshot(authenticationId: string): GoogleAuthSnapshot | null;
  getSession(sessionId: string): GoogleAuthSession | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createGoogleAuthProvider(options: GoogleAuthProviderOptions = {}): GoogleAuthProvider {
  const validator = options.validator ?? createGoogleAuthValidator();
  const now = options.now ?? (() => performance.now());
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  let sessionSerial = 0;
  let registrySerial = 0;
  const idFactory = options.idFactory ?? (() => `google-auth-${++serial}`);
  const sessionFactory = options.sessionFactory ?? (() => `session-${++sessionSerial}`);
  const registryFactory = options.registryFactory ?? (() => `registry-${++registrySerial}`);
  const client = createGoogleAuthHttpClient(options.transport);
  const snapshots = new Map<string, GoogleAuthSnapshot>();
  const sessions = new Map<string, GoogleAuthSession>();

  return {
    validator,
    async authenticate(input) {
      const started = now();
      const refused = (issues: GoogleAuthResult["issues"], metadata: GoogleAuthMetadata = {}): GoogleAuthResult => {
        const executionTime = Math.max(0, now() - started);
        return freezeDeepGoogleAuth({
          status: "REJECTED",
          issues,
          session: null,
          accounts: null,
          registry: null,
          evidence: null,
          statistics: createGoogleAuthStatistics({
            accountCount: 0,
            managerCount: 0,
            childCount: 0,
            accessibleCustomerCount: 0,
            issueCount: issues.length,
            executionTime,
          }),
          snapshot: null,
          metadata,
          executionTime,
        });
      };
      try {
        const issues = validator.validateInput(input);
        if (issues.length > 0 || !isRecord(input) || !isRecord(input.configuration)) return refused(issues);
        const configuration = input.configuration;
        const metadata = isRecord(input.executionMetadata) ? ({ ...input.executionMetadata } as GoogleAuthMetadata) : {};
        const apiVersion = typeof configuration.apiVersion === "string" ? configuration.apiVersion.trim() : GOOGLE_ADS_API_VERSION;
        const oauth = await exchangeRefreshToken(client, {
          clientId: (configuration.clientId as string).trim(),
          clientSecret: (configuration.clientSecret as string).trim(),
          refreshToken: (configuration.refreshToken as string).trim(),
        });
        if (!oauth.ok) return refused(oauth.issues, metadata);
        const developerToken = typeof configuration.developerToken === "string" ? configuration.developerToken.trim() : "";
        const customers = await readCustomers(client, apiVersion, developerToken, oauth.grant.accessToken);
        if (!customers.ok) return refused(customers.issues, metadata);
        const createdAt = timestamp();
        const authenticationId = idFactory();
        const sessionId = sessionFactory();
        const registry = buildAccountRegistry(registryFactory(), customers.read.accounts, customers.read.children, customers.read.accessibleCustomerIds);
        const session: GoogleAuthSession = {
          sessionId,
          authenticated: true,
          tokenType: oauth.grant.tokenType,
          expiresIn: oauth.grant.expiresIn,
          customerCount: registry.accounts.length,
          origin: "OBSERVED",
          provenance: "DIRECT_SOURCE",
        };
        const executionTime = Math.max(0, now() - started);
        const statistics = createGoogleAuthStatistics({
          accountCount: registry.accounts.length,
          managerCount: registry.managerAccounts.length,
          childCount: registry.childAccounts.length,
          accessibleCustomerCount: registry.accessibleCustomerIds.length,
          issueCount: 0,
          executionTime,
        });
        const snapshot = createGoogleAuthSnapshot({
          authenticationId,
          session,
          accounts: registry.accounts,
          registry,
          evidence: {
            grantType: "refresh_token",
            tokenType: oauth.grant.tokenType,
            expiresIn: oauth.grant.expiresIn,
            accessibleResourceNames: customers.read.accessibleResourceNames,
            queries: customers.read.queries,
          },
          statistics,
          context: { customerIds: registry.accessibleCustomerIds },
          createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata);
        snapshots.set(snapshot.authenticationId, snapshot);
        sessions.set(snapshot.session.sessionId, snapshot.session);
        return freezeDeepGoogleAuth({
          status: "OK",
          issues: [],
          session: snapshot.session,
          accounts: snapshot.accounts,
          registry: snapshot.registry,
          evidence: snapshot.evidence,
          statistics: snapshot.statistics,
          snapshot,
          metadata,
          executionTime,
        });
      } catch {
        return refused([{ field: "configuration", message: "Invalid OAuth: the authentication could not restate the accounts." }]);
      }
    },
    getSnapshot: (authenticationId) => snapshots.get(authenticationId) ?? null,
    getSession: (sessionId) => sessions.get(sessionId) ?? null,
  };
}
