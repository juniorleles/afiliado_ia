/**
 * GENERIC LP ENGINE REPLAY
 * Runs one operator product through the existing generic pipeline stages.
 * Product name, source URL, and output directory come from the command line.
 * No paid content-model call unless ALLOW_CONTENT_MODEL_CALL=1.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ImportBlockedError, ImportFetchError, importProductFromUrl } from "../src/lib/import-product.ts";
import { applyGenericFaqRecovery } from "../src/lib/faq-field-promotion.ts";
import {
  buildGenerationFactManifest,
  isCopyEligibleConfidence,
  productNameAuthority,
  type FactField,
  type ProductFacts,
} from "../src/lib/product-facts.ts";
import { verifyProductIdentity } from "../src/lib/source-resolution/identity.ts";
import type { FetchImpl } from "../src/lib/source-resolution/types.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { closedClaimFirewall, projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import { blockingSlotOmissions, createEvidenceSlotPlan, slotBudgetInfeasibilities } from "../src/lib/ai/evidence-slot-plan.ts";
import { resolveGenerationRoute } from "../src/lib/ai/generation-router.ts";
import { collectSlotProjectionViolations, slotVisibleTopics } from "../src/lib/ai/slot-projection-isolation.ts";
import { deterministicFaqQuestion, validateFaqQuestion } from "../src/lib/ai/faq-question-semantics.ts";
import { generateVariants } from "../src/lib/ai/generate-variants.ts";
import { evaluateSlotGeneration, type SlotFill } from "../src/lib/ai/slot-generation.ts";
import { validateModelWordingConstraint } from "../src/lib/ai/model-wording-constraint.ts";
import { validateModelSlotAuthority } from "../src/lib/ai/model-slot-authority.ts";
import { pageFaqAuthorityBindings } from "../src/lib/ai/structured-generation.ts";
import { validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import { lintCampaign } from "../src/lib/policy-linter.ts";
import { VALIDATION_SAFE_AFFILIATE } from "../src/lib/validation/constants.ts";

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function arg(name: string): string {
  const row = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (row) return row.slice(name.length + 3);
  return process.env[`REPLAY_${name.toUpperCase()}`] ?? "";
}

const FIELDS: FactField[] = [
  "productName",
  "description",
  "features",
  "ingredientsOrComponents",
  "usageInformation",
  "cautions",
  "pricingInformation",
  "guaranteeInformation",
  "manufacturer",
];

type FetchRecord = { requestUrl: string; finalUrl: string; status: number; redirected: boolean };

function observingFetch(log: FetchRecord[]): FetchImpl {
  return async (input, init) => {
    const requestUrl = String(input);
    const response = await fetch(input, init);
    log.push({ requestUrl, finalUrl: response.url || requestUrl, status: response.status, redirected: Boolean(response.redirected) });
    return response;
  };
}

function fieldValue(facts: ProductFacts, field: FactField): string | string[] | undefined {
  if (field === "productName") return facts.productName;
  if (field === "features" || field === "ingredientsOrComponents" || field === "usageInformation" || field === "cautions") {
    return facts[field];
  }
  return facts[field] as string | undefined;
}

function hasContent(value: string | string[] | undefined): boolean {
  if (Array.isArray(value)) return value.some((item) => item.trim());
  return Boolean(value?.trim());
}

function pageHaystack(facts: ProductFacts): string {
  return [
    facts.description || "",
    ...facts.features,
    ...facts.ingredientsOrComponents,
    ...facts.usageInformation,
    ...facts.cautions,
    facts.guaranteeInformation || "",
    facts.manufacturer || "",
    ...facts.sourceSnippets.map((item) => item.text),
  ].join("\n");
}

function extractedName(facts: ProductFacts, operatorName: string): string | null {
  const snippet = facts.sourceSnippets.find((item) => item.field === "productName" && item.text.trim());
  if (snippet && snippet.text.trim() !== operatorName) return snippet.text.trim();
  if (facts.productName && facts.productName !== operatorName) return facts.productName;
  return null;
}

async function main() {
  loadLocalEnv();
  const productName = arg("product");
  const sourceUrl = arg("url");
  const outDir = path.join(process.cwd(), arg("out"));
  if (!productName || !sourceUrl || !arg("out")) throw new Error("usage: --product= --url= --out=");
  mkdirSync(outDir, { recursive: true });
  const write = (name: string, value: unknown) => writeFileSync(path.join(outDir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");

  const report: Record<string, unknown> = {
    replayVersion: "generic-lp-engine-replay-v1",
    product: productName,
    originalOperatorUrl: sourceUrl,
    startedAt: new Date().toISOString(),
    contentModelCallsAllowed: process.env.ALLOW_CONTENT_MODEL_CALL === "1",
    contentModelCalls: 0,
    openAiImageCalls: 0,
  };

  // STAGE 1 — SOURCE RESOLUTION
  const fetchLog: FetchRecord[] = [];
  let facts: ProductFacts;
  const factsFile = arg("facts");
  try {
    facts = factsFile
      ? (JSON.parse(readFileSync(path.join(process.cwd(), factsFile), "utf8")) as { facts: ProductFacts }).facts
      : await importProductFromUrl(sourceUrl, { operatorProductName: productName }, { fetchImpl: observingFetch(fetchLog), importId: `replay-${Date.now()}` });
    if (factsFile) report.factsFile = factsFile;
  } catch (err) {
    const blocked = err instanceof ImportBlockedError;
    const primary = fetchLog.find((item) => !/robots\.txt/i.test(item.requestUrl));
    write("source-resolution.json", {
      originalOperatorUrl: sourceUrl,
      finalUrl: primary?.finalUrl ?? null,
      httpStatus: primary?.status ?? null,
      redirectChain: fetchLog,
      resolution: blocked ? (err as ImportBlockedError).reason : err instanceof ImportFetchError ? "FETCH_ERROR" : "ERROR",
      bypassAttempted: false,
    });
    report.stoppedAt = "SOURCE_RESOLUTION";
    report.failureClass = "SOURCE_ACCESS_FAILURE";
    report.failureDetail = err instanceof Error ? err.message : String(err);
    write("replay-report.json", report);
    console.log(`STOP=SOURCE_RESOLUTION detail=${report.failureDetail}`);
    return;
  }

  const primary = fetchLog.find((item) => item.requestUrl === sourceUrl) || fetchLog.find((item) => !/robots\.txt/i.test(item.requestUrl));
  write("source-resolution.json", {
    originalOperatorUrl: sourceUrl,
    finalUrl: facts.sourceUrl || primary?.finalUrl || sourceUrl,
    httpStatus: primary?.status ?? null,
    redirectChain: fetchLog,
    resolution: factsFile
      ? `FACTS_FILE:${factsFile}`
      : facts.webDiscovery?.triggered
        ? `WEB_DISCOVERY:${facts.webDiscovery.outcome || facts.webDiscovery.primaryBlock}`
        : "PRIMARY_OK",
    sourceQuality: facts.importQuality,
    bypassAttempted: false,
    robotsRespected: true,
  });

  // STAGE 2 — IDENTITY
  const identity = facts.webDiscovery?.triggered
    ? {
        status: facts.webDiscovery.acceptedCount > 0 ? "ACCEPTED" : facts.webDiscovery.uncertainCount > 0 ? "IDENTITY_UNCERTAIN" : "REJECTED",
        path: "WEB_DISCOVERY",
        reasons: facts.webDiscovery.sources.flatMap((source) => source.identityReasons).slice(0, 12),
      }
    : (() => {
        const verified = verifyProductIdentity({
          productName,
          extractedName: extractedName(facts, productName),
          pageText: pageHaystack(facts),
          manufacturer: facts.manufacturer,
          ingredients: facts.ingredientsOrComponents,
        });
        return { status: verified.status, path: "PRIMARY_PAGE_IDENTITY", reasons: verified.reasons };
      })();
  write("identity.json", {
    operatorProductName: productName,
    pinnedProductName: facts.productName,
    extractedName: extractedName(facts, productName),
    productNameProvenance: facts.confidence.productName,
    productNameAuthority: productNameAuthority(facts),
    ...identity,
  });
  report.identity = identity.status;
  if (identity.status !== "ACCEPTED") {
    report.stoppedAt = "IDENTITY";
    report.failureClass = "IDENTITY_FAILURE";
    write("replay-report.json", report);
    console.log(`STOP=IDENTITY status=${identity.status}`);
    return;
  }

  // STAGE 3 — PRODUCTFACTS
  const recovered = applyGenericFaqRecovery(facts);
  const table = FIELDS.map((field) => {
    const provenance = recovered.confidence[field];
    const value = fieldValue(recovered, field);
    return {
      field,
      value: value ?? null,
      provenance,
      copyEligible: isCopyEligibleConfidence(provenance) && hasContent(value) ? "YES" : "NO",
    };
  });
  write("product-facts.json", { facts: recovered, fieldTable: table, faqRecoveryApplied: true });

  // STAGE 4 — COVERAGE
  const plan = createGenerationPlan(recovered);
  const manifest = buildGenerationFactManifest(recovered);
  const projection = projectEvidenceClaims(recovered, plan, manifest);
  const firewall = closedClaimFirewall(projection, plan);
  const copyEligible = manifest.items.filter((item) => item.copyEligible).length;
  write("generation-plan.json", { plan, manifest, projection });
  write("coverage.json", {
    coverage: plan.coverage,
    copyEligibleFacts: copyEligible,
    openTopics: plan.allowedTopics,
    closedTopics: plan.closedTopics,
    projectedClaims: projection.claims.length,
    authorizedClaims: projection.authorized.length,
    excludedClaims: projection.excluded.length,
    closedClaimFirewall: firewall,
  });
  report.coverage = plan.coverage;

  // STAGE 5 — CONTENT ROUTING
  const route = resolveGenerationRoute(plan);
  write("content-route.json", { coverage: plan.coverage, generationRoute: route, thinMode: plan.thinMode ?? null });
  report.generationRoute = route;

  // STAGE 6 — SEMANTIC AUTHORITY (pre-model)
  const slotPlan = createEvidenceSlotPlan(recovered, plan, manifest, projection);
  const projectionViolations = collectSlotProjectionViolations(slotPlan.slots);
  const closedVisible = slotPlan.slots.flatMap((slot) => {
    const visible = slotVisibleTopics(slot);
    return visible.filter((topic) => plan.closedTopics.includes(topic) && topic !== slot.topic).map((topic) => `${slot.slotId}:${topic}`);
  });
  const faqQuestions = slotPlan.slots
    .filter((slot) => slot.type === "FAQ")
    .map((slot) => {
      const question = deterministicFaqQuestion(slot, recovered.productName);
      const validation = question
        ? validateFaqQuestion({
            question,
            topic: slot.topic,
            field: slot.evidence[0]?.field,
            semanticAuthority: slot.semanticAuthority,
            authorizedTopics: [slot.topic],
            slotId: slot.slotId,
            closedTopics: plan.closedTopics,
            supportText: slot.evidence.map((item) => item.value).join("\n"),
            productName: recovered.productName,
          })
        : null;
      return {
        slotId: slot.slotId,
        question: question || "",
        semanticResult: validation?.semanticResult || "MISSING",
        failCodes: validation?.failCodes || ["NO_DETERMINISTIC_QUESTION"],
      };
    });
  const faqFailures = faqQuestions.filter((item) => item.semanticResult !== "PASS");
  const blockingOmissions = blockingSlotOmissions(slotPlan);
  const budgetInfeasibilities = slotBudgetInfeasibilities(slotPlan);
  const semanticPass =
    projectionViolations.length === 0 &&
    closedVisible.length === 0 &&
    faqFailures.length === 0 &&
    blockingOmissions.length === 0 &&
    budgetInfeasibilities.length === 0 &&
    firewall.TOTAL_VISIBLE_CLOSED_CLAIMS === 0;
  const faqSlots = slotPlan.slots.filter((slot) => slot.type === "FAQ");
  const faqOmissions = slotPlan.omitted.filter((slot) => slot.type === "FAQ");
  write("semantic-authority.json", {
    slotCount: slotPlan.slots.length,
    slots: slotPlan.slots.map((slot) => ({ slotId: slot.slotId, type: slot.type, topic: slot.topic, maxWords: slot.maxWords, evidenceFields: slot.evidence.map((item) => item.field) })),
    omittedSlots: slotPlan.omitted,
    blockingOmissions,
    faqPlanned: faqSlots.length + faqOmissions.length,
    faqIncluded: faqSlots.length,
    faqOmitted: faqOmissions.length,
    optionalUnauthorizedSlotSentToModel: slotPlan.omitted.some((omitted) => slotPlan.slots.some((slot) => slot.slotId === omitted.slotId)) ? "YES" : "NO",
    preModelSlotViolations: projectionViolations,
    budgetInfeasibilities,
    closedTopicsVisibleInSlots: closedVisible,
    faqQuestions,
    faqPrevalidationFailures: faqFailures.length,
    result: semanticPass ? "PASS" : "FAIL",
  });
  report.slotOmissions = slotPlan.omitted;
  report.faqPlanned = faqSlots.length + faqOmissions.length;
  report.faqIncluded = faqSlots.length;
  report.faqOmitted = faqOmissions.length;
  report.semanticAuthority = semanticPass ? "PASS" : "FAIL";

  if (!semanticPass) {
    write("grounding.json", { status: "NOT_RUN", reason: "pre-model semantic authority did not pass" });
    write("policy.json", { status: "NOT_RUN", reason: "pre-model semantic authority did not pass" });
    report.stoppedAt = "SEMANTIC_AUTHORITY";
    report.failureClass = "SEMANTIC_AUTHORITY_FAILURE";
    report.contentGate = "BLOCKED";
    report.failureDetail = {
      preModelSlotViolations: projectionViolations,
      closedTopicsVisibleInSlots: closedVisible,
      faqPrevalidationFailures: faqFailures,
      blockingOmissions,
      budgetInfeasibilities,
      closedClaimFirewall: firewall.TOTAL_VISIBLE_CLOSED_CLAIMS,
    };
    write("replay-report.json", report);
    console.log(`STOP=SEMANTIC_AUTHORITY violations=${projectionViolations.length} closed=${closedVisible.length} faqFailures=${faqFailures.length}`);
    return;
  }

  /** Lets a saved generation be revalidated without paying for a second call. */
  const rawPath = path.join(outDir, "generation-raw.json");
  const reuse = process.env.REPLAY_REUSE_GENERATION === "1" && existsSync(rawPath);
  if (route === "MODEL" && process.env.ALLOW_CONTENT_MODEL_CALL !== "1" && !reuse) {
    write("grounding.json", { status: "NOT_RUN", reason: "stopped before the paid content-model call" });
    write("policy.json", { status: "NOT_RUN", reason: "stopped before the paid content-model call" });
    report.stoppedAt = "CONTENT_MODEL_BOUNDARY";
    report.failureClass = "NONE";
    report.contentGate = "NOT_RUN";
    write("replay-report.json", report);
    console.log("STOP=CONTENT_MODEL_BOUNDARY route=MODEL noPaidCall=YES");
    return;
  }

  // STAGE 7 — CONTENT GENERATION (one model call)
  const originalFetch = globalThis.fetch;
  let modelHttpCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("api.anthropic.com")) {
      if (reuse) throw new Error("REPLAY_REUSE_GENERATION=1; model request refused");
      if (modelHttpCalls >= 1) throw new Error("MAX_CONTENT_MODEL_CALLS=1 reached; second model request refused");
      modelHttpCalls += 1;
    }
    return originalFetch(input, init);
  };
  type ReplayVariant = Awaited<ReturnType<typeof generateVariants>>[number];
  let variants: ReplayVariant[];
  try {
    if (reuse) {
      const saved = JSON.parse(readFileSync(rawPath, "utf8")) as { route: string; ctaLabel: string; fills: SlotFill[] };
      variants = [{ generationRoute: saved.route, ctaLabel: saved.ctaLabel, slotFills: saved.fills } as unknown as ReplayVariant];
    } else {
      variants = await generateVariants({
        productName: recovered.productName,
        sourceUrl: recovered.sourceUrl,
        facts: recovered,
        targetApproach: "REVIEW",
        modelInputTrace: { directory: outDir, required: true },
      });
    }
  } catch (err) {
    globalThis.fetch = originalFetch;
    report.contentModelCalls = modelHttpCalls;
    report.stoppedAt = "CONTENT_GENERATION";
    report.failureClass = "TECHNICAL_PROVIDER_FAILURE";
    report.failureDetail = err instanceof Error ? err.message : String(err);
    write("grounding.json", { status: "NOT_RUN", reason: "content generation failed" });
    write("policy.json", { status: "NOT_RUN", reason: "content generation failed" });
    write("replay-report.json", report);
    console.log(`STOP=CONTENT_GENERATION calls=${modelHttpCalls}`);
    return;
  } finally {
    globalThis.fetch = originalFetch;
  }
  report.contentModelCalls = modelHttpCalls;

  const variant = variants[0];
  if (!variant) throw new Error("no variant returned");
  const fills = variant.slotFills || [];
  write("generation-raw.json", { route: variant.generationRoute, ctaLabel: variant.ctaLabel, fills });

  const evaluation = evaluateSlotGeneration(
    { variants: [{ cta: { label: variant.ctaLabel }, slots: fills }] },
    recovered,
    recovered.productName,
    VALIDATION_SAFE_AFFILIATE,
    slotPlan,
  );
  const byFill = new Map(fills.map((fill) => [fill.slotId, fill]));
  const boundWording = (rows: SlotFill["propositions"]) => (rows || []).map((item) => item.wording.trim()).filter(Boolean).join(" ");
  const slotWording = (slot: (typeof slotPlan.slots)[number], fill: SlotFill | undefined) => {
    if (!fill) return "";
    if (slot.type === "FAQ") {
      const answer = (fill.answer || "").trim() || boundWording(fill.answerPropositions);
      return `${fill.question || ""} ${answer}`.trim();
    }
    return boundWording(fill.propositions) || (fill.content || "").trim();
  };
  const wordingViolations = slotPlan.slots.flatMap((slot) => {
    const generated = slotWording(slot, byFill.get(slot.slotId));
    if (!generated) return [];
    return validateModelWordingConstraint({ generated, slot }).violations;
  });
  const authorityViolations = slotPlan.slots.flatMap((slot) => {
    const copy = slotWording(slot, byFill.get(slot.slotId));
    if (!copy) return [];
    return validateModelSlotAuthority({ copy, slot, plan, productName: recovered.productName }).map((item) => ({
      slotId: slot.slotId,
      code: item.code,
      text: item.text,
      reason: item.reason,
    }));
  });
  const unauthorizedSlotFills = fills.filter((fill) => !slotPlan.slots.some((slot) => slot.slotId === fill.slotId));

  // STAGE 8 — GROUNDING
  const pageGrounding = evaluation.page
    ? validateGrounding(`${evaluation.inspectionCopy.headline}\n${evaluation.inspectionCopy.body}`, recovered, {
        faqAuthorities: pageFaqAuthorityBindings(evaluation.page, { closedTopics: plan.closedTopics }),
      })
    : { unsupportedClaims: [] as { claim: string; reason: string }[] };
  write("grounding.json", {
    status: evaluation.grounding.status,
    unsupportedClaims: evaluation.grounding.unsupportedClaims,
    pageLevelUnsupportedClaims: pageGrounding.unsupportedClaims,
    modelWordingViolations: wordingViolations,
    modelAuthorityViolations: authorityViolations,
    structuralViolations: evaluation.structuralViolations,
    unauthorizedSlotFills: unauthorizedSlotFills.map((fill) => fill.slotId),
  });
  report.grounding = evaluation.grounding.status;
  report.unsupportedClaims = evaluation.grounding.unsupportedClaims.length + pageGrounding.unsupportedClaims.length;

  // STAGE 9 — POLICY
  const findings = lintCampaign({
    id: 0,
    name: recovered.productName,
    slug: "generic-lp-engine-replay",
    headline: evaluation.inspectionCopy.headline,
    body: evaluation.inspectionCopy.body,
    ctaLabel: evaluation.inspectionCopy.ctaLabel,
    affiliateUrl: VALIDATION_SAFE_AFFILIATE,
    headScript: null,
    adHeadline: null,
    publicationStatus: "draft",
    publishedAt: null,
    createdAt: "",
    updatedAt: "",
    pageTemplate: null,
    pageComposition: null,
    productImageSrc: null,
    productImageProvenance: null,
    subheadline: null,
    sourceFactsJson: null,
  }).findings;
  const nonPass = findings.filter((item) => item.status !== "pass");
  write("policy.json", {
    policyGate: evaluation.policyGate,
    findings: nonPass.map((item) => ({ ruleId: item.ruleId, status: item.status, message: item.message })),
  });
  report.policy = evaluation.policyGate;

  // STAGE 10 — CONTENT GATE
  const faqItems = slotPlan.slots
    .filter((slot) => slot.type === "FAQ")
    .map((slot) => {
      const fill = byFill.get(slot.slotId);
      const trace = evaluation.slotTraces.find((item) => item.slotId === slot.slotId);
      return {
        slotId: slot.slotId,
        question: fill?.question || "",
        answer: (fill?.answer || "").trim() || boundWording(fill?.answerPropositions),
        questionSemantics: trace?.questionSemantic?.semanticResult || "MISSING",
        answerGrounding: trace?.answerGrounding || "MISSING",
      };
    });
  const gatePassed =
    evaluation.finalGate === "READY" &&
    evaluation.policyGate === "READY" &&
    nonPass.length === 0 &&
    evaluation.grounding.status === "GROUNDED" &&
    evaluation.grounding.unsupportedClaims.length === 0 &&
    pageGrounding.unsupportedClaims.length === 0 &&
    evaluation.structuralViolations.length === 0 &&
    wordingViolations.length === 0 &&
    authorityViolations.length === 0 &&
    unauthorizedSlotFills.length === 0 &&
    modelHttpCalls === (reuse ? 0 : 1);
  write("content-gate.json", {
    contentGate: evaluation.finalGate,
    gatePassed,
    modelCalls: modelHttpCalls,
    faqCount: faqItems.length,
    faqItems,
    ctaLabel: variant.ctaLabel,
    copy: {
      headline: evaluation.inspectionCopy.headline,
      body: evaluation.inspectionCopy.body,
    },
  });
  report.contentGate = evaluation.finalGate;
  report.faqRealized = faqItems.length;
  report.stoppedAt = gatePassed ? "CONTENT_GATE_READY" : "CONTENT_GATE";
  report.failureClass = gatePassed
    ? "NONE"
    : evaluation.grounding.status !== "GROUNDED" || evaluation.grounding.unsupportedClaims.length > 0 || pageGrounding.unsupportedClaims.length > 0
      ? "GROUNDING_FAILURE"
      : evaluation.policyGate !== "READY" || nonPass.length > 0
        ? "POLICY_FAILURE"
        : wordingViolations.length > 0 || authorityViolations.length > 0 || unauthorizedSlotFills.length > 0
          ? "MODEL_AUTHORITY_FAILURE"
          : evaluation.structuralViolations.length > 0
            ? "STRUCTURE_FAILURE"
            : "OTHER";
  write("replay-report.json", report);
  console.log(
    `STOP=${report.stoppedAt} gate=${evaluation.finalGate} grounding=${evaluation.grounding.status} policy=${evaluation.policyGate} calls=${modelHttpCalls} faq=${faqItems.length}`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
