import { existsSync, readFileSync } from "node:fs";
import { paidAiAuthorization } from "@/lib/ai/paid-gate";
import { emptyCostMetadata, qualityCostGate } from "@/lib/presell-quality/cost";
import { assessmentFromScores, unevaluatedAssessment } from "@/lib/presell-quality/evaluator";
import { evaluationFingerprint, screenshotHashesOf } from "@/lib/presell-quality/fingerprint";
import type { PresellEvaluationInput } from "@/lib/presell-quality/input";
import { screenshotAssociationError, ModelPayloadError, normalizeModelPayload } from "@/lib/presell-quality/normalize";
import { readPremiumReferenceBytes } from "@/lib/presell-quality/premium-standard";
import {
  assessmentIsCurrent,
  findCachedQualityAssessment,
  writeQualityAssessment,
} from "@/lib/presell-quality/persist";
import { buildMultimodalEvaluatorPrompt } from "@/lib/presell-quality/prompt";
import { envValuePresent, redactSecrets } from "@/lib/lp-generator/ai-copy/config";
import {
  createAnthropicVisionClient,
  estimateAnthropicUsd,
  MULTIMODAL_MODEL_ID,
  MULTIMODAL_PROVIDER_ID,
  multimodalProviderStatus,
  type MultimodalVisionClient,
} from "@/lib/presell-quality/provider";
import {
  createOpenAiVisionClient,
  estimateOpenAiVisionUsd,
  openaiVisionProviderStatus,
  OPENAI_VISION_MODEL,
  OPENAI_VISION_PROVIDER_ID,
} from "@/lib/presell-quality/openai-provider";
import type { PresellQualityAssessment } from "@/lib/presell-quality/types";

export type MultimodalPresellEvaluator = {
  evaluate(input: PresellEvaluationInput): Promise<PresellQualityAssessment>;
};

export type MultimodalEvaluatorDeps = {
  env?: NodeJS.ProcessEnv;
  client?: MultimodalVisionClient;
  persist?: (assessment: PresellQualityAssessment) => PresellQualityAssessment;
  readFile?: (file: string) => Buffer;
  now?: () => string;
  skipCache?: boolean;
};

function failed(input: PresellEvaluationInput, code: string, message: string, extra?: Partial<PresellQualityAssessment>): PresellQualityAssessment {
  const fingerprint = evaluationFingerprint(input);
  const base = unevaluatedAssessment(
    {
      campaignId: input.campaignId,
      generationId: input.generationId,
      desktopScreenshotReference: input.screenshots.desktop?.path,
      mobileScreenshotReference: input.screenshots.mobile?.path,
      evidenceReferences: input.evidenceReferences,
    },
    "MULTIMODAL_AI",
  );
  return {
    ...base,
    evaluatorModel: OPENAI_VISION_MODEL,
    provider: OPENAI_VISION_PROVIDER_ID,
    promptVersion: input.promptVersion,
    rubricVersion: input.rubricVersion,
    inputFingerprint: fingerprint,
    screenshotHashes: screenshotHashesOf(input),
    findings: [
      {
        id: "evaluation-failed",
        dimension: "CRITICAL",
        severity: "BLOCKING",
        message,
        evidence: [code],
      },
    ],
    costMetadata: emptyCostMetadata([message]),
    ...extra,
    assessmentStatus: "EVALUATION_FAILED",
    humanReviewEligibility: "NOT_ELIGIBLE",
    aiQualityApproval: false,
    errorCode: extra?.errorCode ?? code,
  };
}

function readImage(file: string, reader: (file: string) => Buffer): { mediaType: "image/png" | "image/jpeg"; base64: string } {
  const buf = reader(file);
  const mediaType = file.toLowerCase().endsWith(".jpg") || file.toLowerCase().endsWith(".jpeg") ? "image/jpeg" : "image/png";
  return { mediaType, base64: buf.toString("base64") };
}

export function createMultimodalPresellEvaluator(deps: MultimodalEvaluatorDeps = {}): MultimodalPresellEvaluator {
  const env = deps.env ?? process.env;
  const persist = deps.persist ?? writeQualityAssessment;
  const reader = deps.readFile ?? ((file: string) => readFileSync(file));

  return {
    async evaluate(input) {
      const fingerprint = evaluationFingerprint(input);
      const bind = screenshotAssociationError({
        generationId: input.generationId,
        desktop: input.screenshots.desktop,
        mobile: input.screenshots.mobile,
      });
      if (bind) {
        return persist(failed(input, bind.code, bind.message));
      }
      if (input.screenshots.desktop && !existsSync(input.screenshots.desktop.path) && !deps.readFile) {
        return persist(failed(input, "SCREENSHOT_MISSING", "Desktop screenshot file is missing."));
      }
      if (input.screenshots.mobile && !existsSync(input.screenshots.mobile.path) && !deps.readFile) {
        return persist(failed(input, "SCREENSHOT_MISSING", "Mobile screenshot file is missing."));
      }

      if (!deps.skipCache) {
        const cached = findCachedQualityAssessment(input.campaignId, fingerprint);
        if (cached && assessmentIsCurrent(cached, { generationId: input.generationId, inputFingerprint: fingerprint })) {
          return {
            ...cached,
            costMetadata: { ...cached.costMetadata, cached: true, notes: [...cached.costMetadata.notes, "Returned cached assessment for this page version."] },
          };
        }
      }

      const paid = paidAiAuthorization(env);
      const openaiStatus = openaiVisionProviderStatus(env);
      const anthropicStatus = multimodalProviderStatus(env);
      const scoped = env.AIA_PAID_AI_PROVIDER?.trim().toLowerCase();
      const preferOpenAi =
        scoped === "openai" ||
        envValuePresent("OPENAI_API_KEY", env) ||
        !envValuePresent("ANTHROPIC_API_KEY", env);
      const status = preferOpenAi ? openaiStatus : anthropicStatus;
      if (!paid.allowed) {
        return persist(failed(input, "PAID_AI_BLOCKED", qualityCostGate(env).reason, { evaluatorModel: status.model, provider: status.provider === "none" ? OPENAI_VISION_PROVIDER_ID : status.provider }));
      }
      if (!status.keyConfigured) {
        return persist(failed(input, "API_KEY_MISSING", status.reason));
      }
      if (!status.vision) {
        return persist(failed(input, "MODEL_NOT_MULTIMODAL", status.reason));
      }
      if (!status.authorized) {
        return persist(failed(input, "PROVIDER_UNAVAILABLE", status.reason));
      }

      const client =
        deps.client ??
        (preferOpenAi ? createOpenAiVisionClient({ env }) : createAnthropicVisionClient({ env }));
      const officialReference = readPremiumReferenceBytes();
      const prompt = buildMultimodalEvaluatorPrompt(input, { officialReferenceAttached: Boolean(officialReference) });
      let completion: { text: string; inputTokens: number; outputTokens: number };
      try {
        const desktop = readImage(input.screenshots.desktop!.path, reader);
        const mobile = readImage(input.screenshots.mobile!.path, reader);
        completion = await client.complete({
          system: prompt.system,
          userText: prompt.userText,
          images: [
            { ...desktop, label: "desktop-1440x900" },
            { ...mobile, label: "mobile-390x844" },
            ...(officialReference
              ? [{ mediaType: "image/png" as const, base64: officialReference.toString("base64"), label: "official-premium-presell-reference" }]
              : []),
          ],
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const code = /timeout/i.test(message) ? "TIMEOUT" : /HTTP_/i.test(message) ? "HTTP_ERROR" : "PROVIDER_ERROR";
        return persist(failed(input, code, message));
      }

      let payload;
      try {
        payload = normalizeModelPayload(completion.text);
      } catch (err) {
        const code = err instanceof ModelPayloadError ? err.code : "INVALID_JSON";
        const estimated =
          client.provider === "openai"
            ? estimateOpenAiVisionUsd(completion.inputTokens, completion.outputTokens)
            : estimateAnthropicUsd(completion.inputTokens, completion.outputTokens);
        return persist(
          failed(input, code, err instanceof Error ? err.message : "Invalid model payload.", {
            evaluatorModel: client.model,
            provider: client.provider,
            tokenUsage: { inputTokens: completion.inputTokens, outputTokens: completion.outputTokens },
            costMetadata: {
              paidAiEnabled: true,
              estimatedUsd: Number(estimated.toFixed(4)),
              actualUsd: 0,
              evaluationCount: 1,
              cached: false,
              notes: [
                err instanceof Error ? err.message : "Invalid model payload.",
                `Raw payload snippet: ${redactSecrets(completion.text).slice(0, 400)}`,
              ],
            },
          }),
        );
      }

      const assessment = assessmentFromScores(
        {
          campaignId: input.campaignId,
          generationId: input.generationId,
          desktopScreenshotReference: input.screenshots.desktop?.path,
          mobileScreenshotReference: input.screenshots.mobile?.path,
          evidenceReferences: input.evidenceReferences,
          evaluatorType: "MULTIMODAL_AI",
          evaluatorModel: client.model,
        },
        {
          dimensionScores: payload.dimensionScores.map((row) => ({
            dimension: row.dimension,
            score: row.score,
            rationale: row.rationale,
          })),
          criticalFailures: payload.criticalFailures,
          evaluatorType: "MULTIMODAL_AI",
          evaluationCompleted: true,
        },
      );
      const estimated =
        client.provider === "openai"
          ? estimateOpenAiVisionUsd(completion.inputTokens, completion.outputTokens)
          : estimateAnthropicUsd(completion.inputTokens, completion.outputTokens);
      const complete: PresellQualityAssessment = {
        ...assessment,
        findings: payload.findings.length ? payload.findings : assessment.findings,
        recommendedActions: payload.recommendedActions,
        provider: client.provider,
        promptVersion: input.promptVersion,
        rubricVersion: input.rubricVersion,
        inputFingerprint: fingerprint,
        screenshotHashes: screenshotHashesOf(input),
        tokenUsage: { inputTokens: completion.inputTokens, outputTokens: completion.outputTokens },
        errorCode: null,
        evaluatedAt: deps.now?.() ?? assessment.evaluatedAt,
        costMetadata: {
          paidAiEnabled: true,
          estimatedUsd: Number(estimated.toFixed(4)),
          actualUsd: 0,
          evaluationCount: 1,
          cached: false,
          notes: ["Host computed overallScore from weighted dimensions. Model overallScore/status ignored if present."],
        },
      };

      try {
        return persist(complete);
      } catch (err) {
        return failed(input, "PERSISTENCE_FAILED", err instanceof Error ? err.message : "Persistence failed.", {
          ...complete,
          assessmentStatus: "EVALUATION_FAILED",
          humanReviewEligibility: "NOT_ELIGIBLE",
          aiQualityApproval: false,
        });
      }
    },
  };
}

export { assessmentIsCurrent };
