import type { ConversionBrief } from "@/lib/conversion-strategy/types";
import { validateConversionBrief } from "@/lib/conversion-strategy/validate";
import type { ProductContract } from "@/lib/product-contract/types";

/**
 * Editorial intelligence adapter.
 *
 * The default path is deterministic and offline. A future paid-model adapter may return
 * suggested reorderings or audience wording. Anything it returns is rejected unless it
 * passes schema, reference and policy checks. Tests never call a paid API.
 */

export type EditorialIntelPatch = {
  audienceHypothesisText?: string;
  differentiatorOrder?: string[];
};

export type EditorialAdapter = (brief: ConversionBrief, contract: ProductContract) => EditorialIntelPatch | null;

export function offlineEditorialAdapter(): EditorialAdapter {
  return () => null;
}

export function applyEditorialIntelligence(
  brief: ConversionBrief,
  contract: ProductContract,
  adapter: EditorialAdapter = offlineEditorialAdapter(),
): ConversionBrief {
  const patch = adapter(brief, contract);
  if (!patch) return brief;
  const next: ConversionBrief = {
    ...brief,
    audienceHypothesis: patch.audienceHypothesisText
      ? { ...brief.audienceHypothesis, text: patch.audienceHypothesisText, class: "HYPOTHESIS", restriction: "INTERNAL_ONLY" }
      : brief.audienceHypothesis,
    keyDifferentiators: patch.differentiatorOrder
      ? reorder(brief.keyDifferentiators, patch.differentiatorOrder)
      : brief.keyDifferentiators,
  };
  const check = validateConversionBrief(next, contract);
  return check.ok ? next : brief;
}

function reorder<T extends { id: string }>(items: T[], order: string[]): T[] {
  const map = new Map(items.map((item) => [item.id, item]));
  const next = order.map((id) => map.get(id)).filter((item): item is T => Boolean(item));
  for (const item of items) if (!next.includes(item)) next.push(item);
  return next;
}
