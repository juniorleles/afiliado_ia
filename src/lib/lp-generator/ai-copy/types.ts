import type { CopyProducer } from "@/lib/page-blueprint/types";

export const AI_COMMERCIAL_COPY_VERSION = 1 as const;

export type AiExecutionStatus =
  | "READY"
  | "USED"
  | "BLOCKED_CONFIGURATION"
  | "BLOCKED_AUTHORIZATION"
  | "FAILED"
  | "TIMEOUT"
  | "NOT_REQUESTED";

export type AiProviderDiagnosis = {
  provider: "anthropic" | "openai" | "none";
  model: string | null;
  configured: boolean;
  authorized: boolean;
  status: AiExecutionStatus;
  note: string;
};

export type AiCommercialCopyDraft = {
  version: typeof AI_COMMERCIAL_COPY_VERSION;
  headline: string;
  subheadline?: string;
  introduction: string;
  sectionHeadlines: Record<string, string>;
  features: string[];
  benefitExplanations: string[];
  faq: Array<{ question: string; answer: string }>;
  ctaMicrocopy?: string;
  transitions?: string[];
};

export type AiCopyRun = {
  provider: AiProviderDiagnosis["provider"];
  model: string | null;
  status: AiExecutionStatus;
  fallbackUsed: boolean;
  latencyMs: number | null;
  costEstimate: string | null;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens?: number;
    reasoningTokens?: number;
    totalTokens?: number;
  } | null;
  requestId?: string | null;
  costUsd?: number | null;
  costStatus?: "CALCULATED" | "COST_UNVERIFIED" | "NOT_CHARGED" | null;
  producer: CopyProducer;
  draft: AiCommercialCopyDraft | null;
  error?: string;
};

export type AiCopyCaller = (input: {
  system: string;
  user: string;
  schema: object;
  timeoutMs: number;
}) => Promise<{
  text: string;
  latencyMs: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens?: number;
    reasoningTokens?: number;
    totalTokens?: number;
  };
  requestId?: string | null;
  httpStatus?: number | null;
  costEstimate?: string | null;
}>;
