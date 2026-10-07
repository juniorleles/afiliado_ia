/**
 * Host record domain: campaign publisher.
 *
 * Applies one explicit create, update, pause, resume, or archive operation
 * against a read-only execution plan, resolved provider, and authentication
 * context. It restates ids and records a frozen publish result. It never
 * chooses an operation, never adjusts a budget, never retries, and never
 * sends a record. A refused input returns REJECTED with issues and no
 * result. This layer stays offline.
 *
 * This publisher is not a campaign builder and not a business-rule host.
 */
import type { GoogleAdsMetadata } from "./google-ads-types";
import type { GoogleAdsIssue } from "./google-ads-validator";
import {
  computeGoogleAdsPublishStatistics,
  copyPlainGoogleAdsPublish,
  createGoogleAdsPublishResult,
  createGoogleAdsPublishSnapshot,
  freezeDeepGoogleAdsPublish,
  type GoogleAdsPublishOperationKind,
  type GoogleAdsPublishResult,
  type GoogleAdsPublishSnapshot,
  type GoogleAdsPublishStatistics,
} from "./google-ads-publish-snapshot";
import { createGoogleAdsPublishErrorMapper, type GoogleAdsPublishErrorReport } from "./google-ads-publish-errors";
import { googleAdsPublishOperationOf } from "./google-ads-publish-operations";
import { createGoogleAdsPublishValidator, type GoogleAdsPublishValidator } from "./google-ads-publish-validator";

export type GoogleAdsPublishClock = () => number;
export type GoogleAdsPublishTimestamp = () => string;
export type GoogleAdsPublishIdFactory = () => string;

export interface GoogleAdsPublishClient {
  execute(input: unknown): {
    status: string;
    issues?: readonly GoogleAdsIssue[];
    parsedResponse?: { body?: unknown; requestId?: string } | null;
    execution?: { body?: unknown } | null;
  };
}

export interface GoogleAdsCampaignPublisher {
  readonly validator: GoogleAdsPublishValidator;
  apply(input: unknown): GoogleAdsPublishApplyResult;
  getSnapshot(publishId: string): GoogleAdsPublishSnapshot | null;
}

export interface GoogleAdsPublishApplyResult {
  status: "OK" | "REJECTED";
  issues: GoogleAdsIssue[];
  result: GoogleAdsPublishResult | null;
  errors: GoogleAdsPublishErrorReport;
  statistics: GoogleAdsPublishStatistics | null;
  snapshot: GoogleAdsPublishSnapshot | null;
  metadata: GoogleAdsMetadata;
  executionTime: number;
}

export interface GoogleAdsCampaignPublisherOptions {
  validator?: GoogleAdsPublishValidator;
  client?: GoogleAdsPublishClient;
  now?: GoogleAdsPublishClock;
  timestamp?: GoogleAdsPublishTimestamp;
  idFactory?: GoogleAdsPublishIdFactory;
}

const defaultClock: GoogleAdsPublishClock = () => performance.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function refused(
  issues: GoogleAdsIssue[],
  createdAt: string,
  id: string,
  metadata: GoogleAdsMetadata,
  executionTime = 0,
): GoogleAdsPublishApplyResult {
  const errors = createGoogleAdsPublishErrorMapper().map(issues, id, createdAt);
  return {
    status: "REJECTED",
    issues,
    result: null,
    errors,
    statistics: computeGoogleAdsPublishStatistics({ operationCount: 0, successCount: 0, errorCount: errors.errors.length, executionTime }),
    snapshot: null,
    metadata,
    executionTime,
  };
}

function responseOf(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return copyPlainGoogleAdsPublish(value);
  return null;
}

export function createGoogleAdsCampaignPublisher(options: GoogleAdsCampaignPublisherOptions = {}): GoogleAdsCampaignPublisher {
  const validator = options.validator ?? createGoogleAdsPublishValidator();
  const client = options.client;
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `publish-${++serial}`);
  const snapshots = new Map<string, GoogleAdsPublishSnapshot>();
  const created = new Set<string>();

  return {
    validator,
    apply(input) {
      try {
        const start = now();
        const createdAt = timestamp();
        const id = idFactory();
        const metadata = isRecord(input) && isRecord(input.executionMetadata) ? copyPlainGoogleAdsPublish(input.executionMetadata as GoogleAdsMetadata) : {};
        const inputIssues = validator.validateInput(input);
        if (inputIssues.length > 0) return refused(inputIssues, createdAt, id, metadata, Math.max(0, now() - start));
        const draft = input as Record<string, unknown>;
        const plan = draft.executionPlan as { id: string };
        const provider = draft.provider as { id: string };
        const session = draft.authenticationContext as { sessionId?: string };
        const operation = textOf(draft.operation) as GoogleAdsPublishOperationKind;
        const campaignId = textOf(draft.campaignId) ?? `campaign-${plan.id}`;
        if (operation === "CREATE" && created.has(campaignId)) {
          return refused([{ field: "campaignId", message: `Conflict: campaign "${campaignId}" was already created.` }], createdAt, id, metadata, Math.max(0, now() - start));
        }
        const applied = googleAdsPublishOperationOf(operation).apply({
          planId: plan.id,
          providerId: provider.id,
          campaignId,
          sessionId: textOf(session.sessionId),
        });
        if (applied.issues.length > 0) return refused(applied.issues, createdAt, id, metadata, Math.max(0, now() - start));
        const preparedRequest = freezeDeepGoogleAdsPublish({
          id: `request-${id}`,
          payloadId: plan.id,
          version: "v1",
          mode: "OFFLINE",
          body: copyPlainGoogleAdsPublish(applied.record as unknown as Record<string, unknown>),
          text: "",
          metadata,
          createdAt,
        });
        let providerResponse: Record<string, unknown> | null = copyPlainGoogleAdsPublish({ ...applied.record, status: "OFFLINE" });
        if (client) {
          const executed = client.execute({
            authenticationContext: draft.authenticationContext,
            preparedRequest,
            executionMetadata: metadata,
            runtimeMetadata: isRecord(draft.runtimeMetadata) ? draft.runtimeMetadata : {},
            configuration: isRecord(draft.configuration) ? draft.configuration : { version: "v1", mode: "OFFLINE" },
          });
          if (executed.status !== "OK") {
            const issues = executed.issues && executed.issues.length > 0
              ? [...executed.issues]
              : [{ field: "provider", message: "Provider Failure: the provider did not complete the operation." }];
            return refused(issues, createdAt, id, metadata, Math.max(0, now() - start));
          }
          const raw = responseOf(executed.parsedResponse?.body) ?? responseOf(executed.execution?.body);
          if (raw === null) {
            return refused([{ field: "response", message: "Malformed Provider Response: a provider response object is required." }], createdAt, id, metadata, Math.max(0, now() - start));
          }
          providerResponse = raw.status === undefined ? { ...raw, status: "OFFLINE" } : raw;
        }
        const executionTime = Math.max(0, now() - start);
        const result = createGoogleAdsPublishResult({
          id,
          operation,
          status: "OK",
          planId: plan.id,
          providerId: provider.id,
          campaignId,
          sessionId: textOf(session.sessionId),
          response: providerResponse ?? {},
          metadata,
          createdAt,
          executionTime,
        });
        const resultIssues = validator.validateResult(result);
        if (resultIssues.length > 0) return refused(resultIssues, createdAt, id, metadata, executionTime);
        const snapshot = createGoogleAdsPublishSnapshot({
          publishId: id,
          planId: plan.id,
          providerId: provider.id,
          campaignId,
          operation,
          status: "OK",
          createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, createdAt, id, metadata, executionTime);
        if (operation === "CREATE") created.add(campaignId);
        snapshots.set(id, snapshot);
        return {
          status: "OK",
          issues: [],
          result,
          errors: createGoogleAdsPublishErrorMapper().map([], id, createdAt),
          statistics: computeGoogleAdsPublishStatistics({ operationCount: 1, successCount: 1, errorCount: 0, executionTime }),
          snapshot,
          metadata: result.metadata,
          executionTime,
        };
      } catch (error) {
        return refused(
          [{ field: "publish", message: error instanceof Error ? error.message : "Unknown Error: the publisher could not apply the operation." }],
          new Date().toISOString(),
          "publish-0",
          {},
        );
      }
    },
    getSnapshot: (publishId) => snapshots.get(publishId) ?? null,
  };
}
