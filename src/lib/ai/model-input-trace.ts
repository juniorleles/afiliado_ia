/**
 * MODEL_INPUT_TRACE_V1
 *
 * Observability only. Captures the provider-bound request that is about
 * to be sent. It does not rebuild that request and it does not change it.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AuthorizedProposition } from "@/lib/ai/authorized-propositions";
import type { ModelSlotAuthority } from "@/lib/ai/model-slot-authority";

export const MODEL_INPUT_TRACE_VERSION = "MODEL_INPUT_TRACE_V1";
export const MODEL_INPUT_TRACE_ARTIFACT = "model-input-trace.json";

export class ModelInputTraceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelInputTraceError";
  }
}

export type AnthropicMessageBody = {
  model: string;
  max_tokens: number;
  system: string;
  messages: Array<{ role: "user"; content: string }>;
  output_config?: {
    format: {
      type: "json_schema";
      schema: object;
    };
  };
};

export type ModelInputTraceRequest = {
  directory: string;
  /** Controlled runs that require the artifact before the provider call. */
  required?: boolean;
};

export type ModelInputTrace = {
  traceVersion: typeof MODEL_INPUT_TRACE_VERSION;
  capturedFrom: "EXACT_PROVIDER_BOUND_VALUES";
  postHocReconstruction: false;
  exactSent: {
    generationRoute: "MODEL";
    model: string;
    maxTokens: number;
    system: string;
    user: string;
    outputContract: {
      contractId: "PROPOSITION_BOUND_STRUCTURED_OUTPUT_V1";
      schemaId: "slotFillSchema";
      formatType: "json_schema";
      schema: unknown;
    };
  };
  structureReference: {
    kind: "STRUCTURES_INTERPOLATED_INTO_EXACT_SENT";
    closedTopics: string[];
    slots: Array<{
      slotId: string;
      propositionIds: string[];
      claimIds: string[];
      evidenceIds: string[];
      projectedEvidenceText: string[];
      allowedOperations: string[];
    }>;
  };
};

const SECRET_KEY =
  /^(?:anthropic_api_key|x-api-key|api[_-]?key|authorization|proxy-authorization|cookie|set-cookie|secret|token|credential|password|bearer)$/i;

function looksLikeSecret(value: string): boolean {
  return /\bsk-ant-[a-z0-9_-]+\b|\bbearer\s+\S+|\bANTHROPIC_API_KEY\b/i.test(value);
}

/** Drops secret-shaped runtime metadata. The result is not written to the trace. */
export function excludedSecretMetadata(metadata: Record<string, unknown> | undefined): string[] {
  if (!metadata) return [];
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (SECRET_KEY.test(key) || (typeof value === "string" && looksLikeSecret(value))) {
      dropped.push(key);
    }
  }
  return dropped;
}

function copyJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function captureModelInputTrace(input: {
  body: AnthropicMessageBody;
  generationRoute: "MODEL";
  closedTopics: readonly string[];
  authorities: readonly ModelSlotAuthority[];
  propositionGroups: ReadonlyArray<{ slotId: string; propositions: readonly AuthorizedProposition[] }>;
  runtimeMetadata?: Record<string, unknown>;
}): ModelInputTrace {
  // Runtime metadata is never copied onto the trace. This identifies secret-shaped keys so they stay excluded.
  excludedSecretMetadata(input.runtimeMetadata);
  const user = input.body.messages.find((message) => message.role === "user")?.content;
  const schema = input.body.output_config?.format?.schema;
  if (input.generationRoute !== "MODEL" || typeof input.body.system !== "string" || typeof user !== "string" || !schema) {
    throw new ModelInputTraceError("MODEL input trace requires the structured provider body.");
  }
  const propositions = new Map(input.propositionGroups.map((group) => [group.slotId, group.propositions]));
  return {
    traceVersion: MODEL_INPUT_TRACE_VERSION,
    capturedFrom: "EXACT_PROVIDER_BOUND_VALUES",
    postHocReconstruction: false,
    exactSent: {
      generationRoute: input.generationRoute,
      model: input.body.model,
      maxTokens: input.body.max_tokens,
      system: input.body.system,
      user,
      outputContract: {
        contractId: "PROPOSITION_BOUND_STRUCTURED_OUTPUT_V1",
        schemaId: "slotFillSchema",
        formatType: "json_schema",
        schema: copyJson(schema),
      },
    },
    structureReference: {
      kind: "STRUCTURES_INTERPOLATED_INTO_EXACT_SENT",
      closedTopics: [...input.closedTopics],
      slots: input.authorities.map((authority) => ({
        slotId: authority.slotId,
        propositionIds: (propositions.get(authority.slotId) || []).map((item) => item.propositionId),
        claimIds: [...authority.allowedClaimIds],
        evidenceIds: [...authority.allowedEvidenceIds],
        projectedEvidenceText: [...authority.projectedSourceText],
        allowedOperations: [...authority.allowedOperations],
      })),
    },
  };
}

export function persistModelInputTrace(trace: ModelInputTrace, directory: string): string {
  if (trace.traceVersion !== MODEL_INPUT_TRACE_VERSION || trace.postHocReconstruction !== false) {
    throw new ModelInputTraceError("Refusing to persist an unrecognized model input trace.");
  }
  if (!directory.trim()) {
    throw new ModelInputTraceError("MODEL input trace directory is empty.");
  }
  try {
    mkdirSync(directory, { recursive: true });
    const dest = path.join(directory, MODEL_INPUT_TRACE_ARTIFACT);
    writeFileSync(dest, JSON.stringify(trace, null, 2), "utf8");
    return dest;
  } catch (err) {
    const message = err instanceof Error ? err.message : "trace write failed";
    throw new ModelInputTraceError(`MODEL input trace was not persisted: ${message}`);
  }
}

/**
 * Writes a requested trace, then sends the same body.
 * No trace request: send only. Production callers omit the request.
 * An explicit trace request that cannot be written throws before send.
 */
export async function commitTracedProviderCall<T>(input: {
  trace: ModelInputTrace;
  body: AnthropicMessageBody;
  traceRequest?: ModelInputTraceRequest;
  send: (body: AnthropicMessageBody) => Promise<T>;
}): Promise<T> {
  if (input.traceRequest) {
    if (!input.traceRequest.directory.trim()) {
      const scope = input.traceRequest.required ? "Controlled MODEL run" : "MODEL input trace";
      throw new ModelInputTraceError(`${scope} was requested without a directory.`);
    }
    persistModelInputTrace(input.trace, input.traceRequest.directory);
  }
  return input.send(input.body);
}
