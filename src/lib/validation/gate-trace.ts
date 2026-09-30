import { createHash } from "node:crypto";
import type { EvidenceTrace } from "@/lib/ai/structured-generation";
import type { GenerationPlanViolation } from "@/lib/ai/generation-plan";
import type { GroundingResult } from "@/lib/ai/grounding-validator";
import { buildGenerationFactManifest, getConsumerCopyEligibleFacts, type ProductFacts } from "@/lib/product-facts";
import { classifyHeading } from "@/lib/presell-page";
import {
  GATE_TRACE_VERSION,
  type GateTrace,
  type GroundingStageSnapshot,
  type PersistedGroundingFailure,
} from "@/lib/validation/types";

export function groundingRepresentationHash(representation: string): string {
  return createHash("sha256").update(representation).digest("hex");
}

function sectionForProposition(representation: string, proposition: string): string | null {
  const needle = proposition.replace(/\s+/g, " ").trim().toLowerCase();
  if (!needle) return null;
  const parts = representation.split(/^## /m);
  const preamble = parts[0] ?? "";
  if (preamble.toLowerCase().includes(needle)) return "intro";
  for (const part of parts.slice(1)) {
    const breakAt = part.indexOf("\n");
    const heading = (breakAt === -1 ? part : part.slice(0, breakAt)).trim();
    const body = breakAt === -1 ? "" : part.slice(breakAt + 1);
    if (`${heading}\n${body}`.toLowerCase().includes(needle)) {
      const classified = classifyHeading(heading);
      return classified === "skip" ? heading : classified;
    }
  }
  return null;
}

function evidenceForReason(reason: string, facts: ProductFacts): string[] {
  const eligible = getConsumerCopyEligibleFacts(facts);
  if (/dosage|usage/i.test(reason)) return eligible.usageInformation;
  if (/semantic merge|operational/i.test(reason)) return [...eligible.returnsInformation, ...eligible.shippingInformation];
  if (/price/i.test(reason)) return eligible.pricingInformation ? [eligible.pricingInformation] : [];
  if (/guarantee/i.test(reason)) return eligible.guaranteeInformation ? [eligible.guaranteeInformation] : [];
  if (/ingredient|composition/i.test(reason)) return eligible.ingredientsOrComponents;
  if (/presupposition/i.test(reason)) return [];
  return [
    eligible.description,
    ...eligible.features,
    ...eligible.usageInformation,
    ...eligible.ingredientsOrComponents,
    eligible.pricingInformation || "",
    eligible.guaranteeInformation || "",
    ...eligible.returnsInformation,
    ...eligible.shippingInformation,
  ].filter((item) => item.trim());
}

function slotForProposition(
  proposition: string,
  reason: string,
  traces: readonly EvidenceTrace[] | undefined,
  facts: ProductFacts,
): { slotId: string | null; evidence: string[] | null } {
  if (!traces?.length) return { slotId: null, evidence: null };
  const needle = proposition.replace(/\s+/g, " ").trim().toLowerCase();
  const trace = traces.find((item) =>
    (item.unsupportedClaims || []).some(
      (claim) => claim.claim.replace(/\s+/g, " ").trim().toLowerCase() === needle && claim.reason === reason,
    ),
  );
  if (!trace) return { slotId: null, evidence: null };
  const manifest = buildGenerationFactManifest(facts);
  const byId = new Map(manifest.items.map((item) => [item.id, item.value]));
  const evidence = trace.declaredEvidence.map((id) => byId.get(id)).filter((value): value is string => Boolean(value));
  return { slotId: trace.blockId || null, evidence: evidence.length ? evidence : null };
}

export function snapshotGroundingStage(input: {
  stage: GroundingStageSnapshot["stage"];
  representation: string;
  grounding: GroundingResult;
  facts: ProductFacts;
  evidenceTrace?: readonly EvidenceTrace[];
  evaluatedAt: string;
}): GroundingStageSnapshot {
  const failures: PersistedGroundingFailure[] = input.grounding.unsupportedClaims.map((claim) => {
    const slot = slotForProposition(claim.claim, claim.reason, input.evidenceTrace, input.facts);
    return {
      proposition: claim.claim,
      reason: claim.reason,
      severity: claim.severity,
      claimClass: claim.claimClass ?? null,
      section: sectionForProposition(input.representation, claim.claim),
      slotId: slot.slotId,
      authorizedEvidence: slot.evidence ?? evidenceForReason(claim.reason, input.facts),
    };
  });
  return {
    stage: input.stage,
    status: input.grounding.status,
    evaluatedHash: groundingRepresentationHash(input.representation),
    representation: input.representation,
    failures,
    evaluatedAt: input.evaluatedAt,
  };
}

export function buildGateTrace(input: {
  evaluatedAt: string;
  preComposition: GroundingStageSnapshot;
  finalComposition: GroundingStageSnapshot;
  policyGate: GateTrace["policy"]["gate"];
  publicationGate: GateTrace["policy"]["publicationGate"];
  blockingRules: string[];
  warnings: string[];
  authorityViolations?: GenerationPlanViolation[];
}): GateTrace {
  return {
    version: GATE_TRACE_VERSION,
    evaluatedAt: input.evaluatedAt,
    preComposition: input.preComposition,
    finalComposition: input.finalComposition,
    policy: {
      stage: "POLICY_LINTER",
      gate: input.policyGate,
      publicationGate: input.publicationGate,
      blockingRules: input.blockingRules,
      warnings: input.warnings,
    },
    authorityViolations: (input.authorityViolations ?? []).map((item) => ({
      topic: item.topic,
      text: item.text,
      reason: item.reason,
      requiredField: item.requiredField,
    })),
  };
}
