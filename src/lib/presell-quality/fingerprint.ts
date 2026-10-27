import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { PresellEvaluationInput } from "@/lib/presell-quality/input";

export function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256File(file: string): string | null {
  if (!existsSync(file)) return null;
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

export function evaluationFingerprint(input: PresellEvaluationInput): string {
  return sha256Text(
    JSON.stringify({
      campaignId: input.campaignId,
      generationId: input.generationId,
      productContractVersion: input.productContractVersion,
      rendererVersion: input.rendererVersion,
      rubricVersion: input.rubricVersion,
      promptVersion: input.promptVersion,
      renderedCopy: input.renderedCopy,
      approvedFacts: input.approvedFacts,
      approvedAssets: input.approvedAssets,
      desktop: input.screenshots.desktop?.sha256 ?? null,
      mobile: input.screenshots.mobile?.sha256 ?? null,
      pageVersionToken: input.pageVersionToken ?? null,
    }),
  );
}

export function screenshotHashesOf(input: PresellEvaluationInput): string[] {
  return [input.screenshots.desktop?.sha256, input.screenshots.mobile?.sha256].filter((item): item is string => Boolean(item));
}
