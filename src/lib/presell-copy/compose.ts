import type { ConversionBrief } from "@/lib/conversion-strategy/types";
import type { ProductContract } from "@/lib/product-contract/types";
import type { GroundedText, SalesCopy } from "@/lib/page-blueprint/types";
import { statementAllowed } from "@/lib/product-contract/claims";

const PRODUCER = "DETERMINISTIC_OFFLINE" as const;

function keyOf(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function grounded(text: string, evidenceRefs: string[], contractPaths: string[]): GroundedText {
  return { text, evidenceRefs: [...new Set(evidenceRefs)], contractPaths, producer: PRODUCER };
}

/**
 * Deterministic editorial pass. It only restates sentences already on the contract.
 * It never fills gaps with generic persuasion.
 */
export function applyEvidenceAwareCopy(copy: SalesCopy, contract: ProductContract, _brief: ConversionBrief): SalesCopy {
  let introduction = copy.introduction;
  const name = contract.identity.productName;
  if (!introduction.text || keyOf(introduction.text) === keyOf(name)) {
    const overview = contract.description?.text ?? contract.valueProposition?.headline?.text;
    if (
      overview &&
      keyOf(overview) !== keyOf(name) &&
      keyOf(overview) !== keyOf(copy.headline.text) &&
      statementAllowed(overview, "PROMOTIONAL")
    ) {
      introduction = grounded(
        overview,
        contract.description?.evidenceRefs ?? contract.valueProposition?.headline?.evidenceRefs ?? [],
        contract.description ? ["description"] : ["valueProposition.headline"],
      );
    }
  }
  return { ...copy, introduction };
}
