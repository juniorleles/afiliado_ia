import type { MissingEvidenceItem } from "@/lib/conversion-strategy/types";
import type { EnrichmentPriority, PriorityOutcome } from "@/lib/product-enrichment/types";

const ORDER: EnrichmentPriority[] = [
  "identity",
  "value_and_differentiators",
  "features_and_specs",
  "offer",
  "guarantee_and_terms",
  "faq",
  "authorized_visuals",
];

export function priorityForPath(path: string): EnrichmentPriority {
  if (/^identity/.test(path)) return "identity";
  if (/valueProposition|description/.test(path)) return "value_and_differentiators";
  if (/features|specifications|components|usage/.test(path)) return "features_and_specs";
  if (/offer|cta/.test(path)) return "offer";
  if (/guarantee|operational|cautions/.test(path)) return "guarantee_and_terms";
  if (/faq/.test(path)) return "faq";
  if (/images/.test(path)) return "authorized_visuals";
  return "features_and_specs";
}

export function planPriorities(missingBefore: MissingEvidenceItem[], missingAfter: MissingEvidenceItem[]): PriorityOutcome[] {
  const before = group(missingBefore);
  const after = group(missingAfter);
  return ORDER.map((priority) => {
    const missing = before[priority] ?? [];
    const remaining = after[priority] ?? [];
    return {
      priority,
      missingBefore: missing,
      filled: missing.filter((path) => !remaining.includes(path)),
      stillMissing: remaining,
    };
  });
}

function group(items: MissingEvidenceItem[]): Record<EnrichmentPriority, string[]> {
  const out = Object.fromEntries(ORDER.map((key) => [key, [] as string[]])) as Record<EnrichmentPriority, string[]>;
  for (const item of items) out[priorityForPath(item.path)].push(item.path);
  return out;
}
