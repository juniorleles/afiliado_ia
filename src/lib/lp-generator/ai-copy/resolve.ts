import type { ConversionBrief } from "@/lib/conversion-strategy/types";
import type { ProductContract } from "@/lib/product-contract/types";
import type { SalesCopy } from "@/lib/page-blueprint/types";
import { commercialHeadline, commercialSubheadline, isIncompleteFragment, type StructuredResearch } from "@/lib/lp-generator/structure";
import { applyAiCommercialDraft } from "@/lib/lp-generator/ai-copy/apply";
import { buildCommercialCopyPrompt } from "@/lib/lp-generator/ai-copy/prompt";
import { COPY_TIMEOUT_MS } from "@/lib/lp-generator/ai-copy/config";
import { calculateOpenAiCostUsd, usageReliable } from "@/lib/lp-generator/ai-copy/budget";
import { createConfiguredCopyCaller, diagnoseAiProvider, parseProviderJson } from "@/lib/lp-generator/ai-copy/provider";
import { AI_COMMERCIAL_COPY_SCHEMA, parseAiCommercialCopy } from "@/lib/lp-generator/ai-copy/schema";
import type { AiCopyCaller, AiCopyRun } from "@/lib/lp-generator/ai-copy/types";

export function applyDeterministicCommercialCopy(copy: SalesCopy, contract: ProductContract, research: StructuredResearch): SalesCopy {
  const name = contract.identity.productName;
  const kind = contract.identity.productKind ?? research.category;
  const intro = contract.description?.text ?? name;
  return {
    ...copy,
    producer: "DETERMINISTIC_OFFLINE",
    headline: { ...copy.headline, text: commercialHeadline(name), contractPaths: ["identity.productName"] },
    subheadline: kind
      ? { text: commercialSubheadline(kind) ?? kind, evidenceRefs: [], contractPaths: ["identity.productKind"], producer: "DETERMINISTIC_OFFLINE" }
      : copy.subheadline,
    introduction: { ...copy.introduction, text: intro, contractPaths: contract.description ? ["description"] : ["identity.productName"] },
    sections: copy.sections.map((section) => ({
      ...section,
      items: section.items.filter((item) => !isIncompleteFragment(item.text.text)),
      body: section.body.filter((item) => !isIncompleteFragment(item.text)),
    })),
  };
}

export async function resolveCommercialCopy(input: {
  copy: SalesCopy;
  contract: ProductContract;
  brief: ConversionBrief;
  research: StructuredResearch;
  language: string;
  market: string;
  allowPaidAi?: boolean;
  caller?: AiCopyCaller;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}): Promise<{ copy: SalesCopy; run: AiCopyRun }> {
  const diagnosis = diagnoseAiProvider(input.env);
  const fallback = applyDeterministicCommercialCopy(input.copy, input.contract, input.research);
  const canCall = Boolean(input.caller) || (Boolean(input.allowPaidAi) && diagnosis.configured && diagnosis.authorized);
  if (!canCall) {
    return {
      copy: fallback,
      run: {
        provider: diagnosis.provider,
        model: diagnosis.model,
        status: diagnosis.status,
        fallbackUsed: true,
        latencyMs: null,
        costEstimate: null,
        usage: null,
        requestId: null,
        costUsd: null,
        costStatus: "NOT_CHARGED",
        producer: "DETERMINISTIC_OFFLINE",
        draft: null,
        error: diagnosis.note,
      },
    };
  }

  const caller = input.caller ?? createConfiguredCopyCaller(input.env);
  const timeoutMs = input.timeoutMs ?? COPY_TIMEOUT_MS;
  const prompt = buildCommercialCopyPrompt({
    contract: input.contract,
    brief: input.brief,
    research: input.research,
    language: input.language,
    market: input.market,
  });
  try {
    const result = await caller({ system: prompt.system, user: prompt.user, schema: AI_COMMERCIAL_COPY_SCHEMA, timeoutMs });
    const usage = result.usage ?? null;
    const reliable = usageReliable(
      usage
        ? {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            cachedInputTokens: usage.cachedInputTokens ?? 0,
            reasoningTokens: usage.reasoningTokens ?? 0,
            totalTokens: usage.totalTokens ?? usage.inputTokens + usage.outputTokens,
          }
        : null,
    );
    const costUsd = reliable && usage ? calculateOpenAiCostUsd({
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedInputTokens: usage.cachedInputTokens ?? 0,
      reasoningTokens: usage.reasoningTokens ?? 0,
      totalTokens: usage.totalTokens ?? usage.inputTokens + usage.outputTokens,
    }) : null;
    const costStatus = result.usage ? (reliable ? "CALCULATED" : "COST_UNVERIFIED") : "COST_UNVERIFIED";
    const parsed = parseAiCommercialCopy(parseProviderJson(result.text));
    if (!parsed.ok) {
      return {
        copy: fallback,
        run: {
          provider: diagnosis.provider,
          model: diagnosis.model,
          status: "FAILED",
          fallbackUsed: true,
          latencyMs: result.latencyMs,
          costEstimate: result.costEstimate ?? null,
          usage,
          requestId: result.requestId ?? null,
          costUsd,
          costStatus,
          producer: "DETERMINISTIC_OFFLINE",
          draft: null,
          error: parsed.error,
        },
      };
    }
    const applied = applyAiCommercialDraft(fallback, parsed.draft, input.contract, input.brief);
    if (!applied) {
      return {
        copy: fallback,
        run: {
          provider: diagnosis.provider,
          model: diagnosis.model,
          status: "FAILED",
          fallbackUsed: true,
          latencyMs: result.latencyMs,
          costEstimate: result.costEstimate ?? null,
          usage,
          requestId: result.requestId ?? null,
          costUsd,
          costStatus,
          producer: "DETERMINISTIC_OFFLINE",
          draft: parsed.draft,
          error: "AI draft failed grounding or schema application.",
        },
      };
    }
    return {
      copy: applied,
      run: {
        provider: diagnosis.provider,
        model: diagnosis.model,
        status: "USED",
        fallbackUsed: false,
        latencyMs: result.latencyMs,
        costEstimate: result.costEstimate ?? null,
        usage,
        requestId: result.requestId ?? null,
        costUsd,
        costStatus,
        producer: "AI_COMMERCIAL",
        draft: parsed.draft,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI copy failed";
    const timeout = /timeout|abort/i.test(message);
    return {
      copy: fallback,
      run: {
        provider: diagnosis.provider,
        model: diagnosis.model,
        status: timeout ? "TIMEOUT" : "FAILED",
        fallbackUsed: true,
        latencyMs: null,
        costEstimate: null,
        usage: null,
        requestId: null,
        costUsd: null,
        costStatus: "COST_UNVERIFIED",
        producer: "DETERMINISTIC_OFFLINE",
        draft: null,
        error: message.slice(0, 180),
      },
    };
  }
}
