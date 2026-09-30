"use server";

import { requireAdmin } from "@/lib/admin-auth";
import { rateLimit } from "@/lib/rate-limit";

import {
  generateVariants,
  lintVariant,
  type LintedVariant,
  type GenerateVariantsInput,
} from "@/lib/ai/generate-variants";
import {
  executeGenerateImport,
  normalizeImportInput,
  type ImportProductInput,
  type ImportResult,
} from "@/lib/execute-generate-import";
import { cancelImportJob, getImportProgress } from "@/lib/source-resolution/progress";
import { readOperatorStatus, type OperatorStatus } from "@/lib/ai/resilience";
import type { ProductFacts } from "@/lib/product-facts";
import type { MarketResearchReport } from "@/lib/market-research/types";
import type { StrategyFamily, StrategyRecommendation } from "@/lib/strategy/types";
import { generateRecommendedLp, researchAndRecommend } from "@/lib/strategy/execute-recommended";

export type GenerateResult =
  | { ok: true; variants: LintedVariant[] }
  | { ok: false; error: string };

export async function generateVariantsAction(
  input: GenerateVariantsInput & { affiliateUrl: string },
): Promise<GenerateResult> {
  await requireAdmin();
  const limited = rateLimit("ai-generate", 8, 60_000);
  if (!limited.ok) return { ok: false, error: "Too many generation requests." };
  try {
    const variants = await generateVariants(input);
    const linted = variants.map((variant) =>
      lintVariant(variant, input.productName, input.affiliateUrl, input.facts),
    );
    return { ok: true, variants: linted };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erro desconhecido ao gerar variantes.",
    };
  }
}

export async function importProductAction(
  input: ImportProductInput | string,
  operatorProductName = "",
): Promise<ImportResult> {
  await requireAdmin();
  const limited = rateLimit("product-import", 10, 60_000);
  if (!limited.ok) return { ok: false, error: "Too many import requests." };
  const parsed = normalizeImportInput(input, operatorProductName);
  return executeGenerateImport(parsed);
}

export async function getAiProviderStatusAction(): Promise<OperatorStatus> {
  await requireAdmin();
  return readOperatorStatus();
}

export async function getImportProgressAction(importId: string): Promise<{ stage: string; cancelled: boolean } | null> {
  await requireAdmin();
  const progress = getImportProgress(importId);
  return progress ? { stage: progress.stage, cancelled: progress.cancelled } : null;
}

export async function cancelImportAction(importId: string): Promise<{ ok: true }> {
  await requireAdmin();
  cancelImportJob(importId);
  return { ok: true };
}

export type RecommendResult =
  | { ok: true; research: MarketResearchReport; recommendation: StrategyRecommendation }
  | { ok: false; error: string };

export async function researchAndRecommendAction(facts: ProductFacts): Promise<RecommendResult> {
  await requireAdmin();
  const limited = rateLimit("market-research", 8, 60_000);
  if (!limited.ok) return { ok: false, error: "Too many research requests." };
  try {
    return { ok: true, ...(await researchAndRecommend(facts)) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Market research failed." };
  }
}

export type RecommendedLpActionResult =
  | {
      ok: true;
      candidateId: string;
      previewUrl: string;
      previewPath: string;
      strategy: StrategyFamily;
      usedFallback: boolean;
      blocked: boolean;
      gateInspection: {
        preComposition: string;
        finalComposition: string;
        failures: Array<{ proposition: string; reason: string; section: string | null; slotId: string | null }>;
      } | null;
      variant: LintedVariant;
      research: MarketResearchReport;
      recommendation: StrategyRecommendation;
    }
  | { ok: false; error: string };

export async function generateRecommendedLpAction(input: {
  facts: ProductFacts;
  affiliateUrl: string;
  research: MarketResearchReport;
  recommendation: StrategyRecommendation;
  overrideStrategy?: StrategyFamily;
}): Promise<RecommendedLpActionResult> {
  await requireAdmin();
  const limited = rateLimit("ai-generate", 8, 60_000);
  if (!limited.ok) return { ok: false, error: "Too many generation requests." };
  try {
    const result = await generateRecommendedLp(input);
    return {
      ok: true,
      candidateId: result.candidate.id,
      previewUrl: result.previewUrl,
      previewPath: result.previewPath,
      strategy: result.variant.approach,
      usedFallback: result.usedFallback,
      blocked: result.blocked,
      gateInspection: result.candidate.contentQa.gateTrace
        ? {
            preComposition: result.candidate.contentQa.gateTrace.preComposition.status,
            finalComposition: result.candidate.contentQa.gateTrace.finalComposition.status,
            failures: result.candidate.contentQa.gateTrace.preComposition.failures.map((failure) => ({
              proposition: failure.proposition,
              reason: failure.reason,
              section: failure.section,
              slotId: failure.slotId,
            })),
          }
        : null,
      variant: result.variant,
      research: result.research,
      recommendation: result.recommendation,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Recommended LP generation failed." };
  }
}
