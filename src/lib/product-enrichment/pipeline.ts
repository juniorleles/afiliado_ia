import { buildConversionBrief } from "@/lib/conversion-strategy/build";
import { validateConversionBrief } from "@/lib/conversion-strategy/validate";
import { buildEditorialDocument, editorialLead } from "@/lib/product-showcase/editorial";
import { buildAdaptivePlan } from "@/lib/product-showcase/adaptive-plan";
import { buildProductContract, type ContractInput } from "@/lib/product-contract/build";
import { validateProductContract } from "@/lib/product-contract/validate";
import { completenessOf } from "@/lib/product-enrichment/completeness";
import { extractSources } from "@/lib/product-enrichment/extract";
import { mergeExtracted } from "@/lib/product-enrichment/merge";
import { planPriorities } from "@/lib/product-enrichment/prioritize";
import type { EnrichmentResult, EnrichmentSource } from "@/lib/product-enrichment/types";
import { ENRICHMENT_VERSION } from "@/lib/product-enrichment/types";

function rebuildInput(base: ContractInput, facts: ContractInput["facts"]): ContractInput {
  const plan = buildAdaptivePlan({ facts });
  const editorial = buildEditorialDocument({ facts, plan, affiliateDisclosure: base.legal.affiliateDisclosure });
  const { lead, summary } = editorialLead(editorial.blocks.find((block) => block.id === "introduction"));
  return {
    ...base,
    facts,
    valueProposition: { headline: lead, supporting: summary },
  };
}

export function enrichProduct(input: {
  scenarioKey: string;
  contractInput: ContractInput;
  sources: EnrichmentSource[];
}): EnrichmentResult {
  const facts = input.contractInput.facts;
  if (!facts) throw new Error("enrichment requires ProductFacts");
  const beforeInput = { ...input.contractInput, facts };
  const beforeBuild = buildProductContract(beforeInput);
  const beforeContract = beforeBuild.contract;
  const beforeBrief = buildConversionBrief(beforeContract);

  const batch = extractSources(input.sources);
  const merged = mergeExtracted(beforeInput.facts, batch);
  const afterInput = rebuildInput(beforeInput, merged.facts);
  const afterBuild = buildProductContract(afterInput);
  const afterContract = afterBuild.contract;
  const afterBrief = buildConversionBrief(afterContract);

  const beforeCheck = validateProductContract(beforeContract);
  const afterCheck = validateProductContract(afterContract);
  if (!beforeCheck.ok) throw new Error(`baseline contract invalid: ${beforeCheck.violations.map((v) => v.message).join("; ")}`);
  if (!afterCheck.ok) throw new Error(`enriched contract invalid: ${afterCheck.violations.map((v) => v.message).join("; ")}`);
  const briefCheck = validateConversionBrief(afterBrief, afterContract);
  if (!briefCheck.ok) throw new Error(`enriched brief invalid: ${briefCheck.violations.map((v) => v.message).join("; ")}`);

  return {
    version: ENRICHMENT_VERSION,
    scenarioKey: input.scenarioKey,
    beforeFacts: beforeInput.facts,
    afterFacts: merged.facts,
    beforeContract,
    afterContract,
    beforeBrief,
    afterBrief,
    provenance: merged.provenance,
    conflicts: merged.conflicts,
    withheld: merged.withheld,
    visualCandidates: merged.visualCandidates,
    stillMissing: afterBrief.missingEvidence,
    addedFields: merged.addedFields,
    completenessBefore: completenessOf(beforeContract, beforeBrief),
    completenessAfter: completenessOf(afterContract, afterBrief),
    priorities: planPriorities(beforeBrief.missingEvidence, afterBrief.missingEvidence),
  };
}
