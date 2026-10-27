import type { EvidenceRegistry, EvidenceRegistryEntry } from "@/lib/presell-enrichment/types";
import type { CoverageEvidenceRecord, GroundingStatus, SourceClass } from "@/lib/research-coverage/types";

export function groundingStatusOf(entry: EvidenceRegistryEntry, sourceClass: SourceClass): GroundingStatus {
  if (entry.verification === "PROHIBITED") return "PROHIBITED";
  if (entry.verification === "CONFLICTING") return "CONFLICTING";
  if (entry.verification === "UNVERIFIED") return "UNVERIFIED";
  if (entry.verification === "VERIFIED_PRODUCT_FACT" && sourceClass === "INDEPENDENT_REFERENCE") {
    return "INDEPENDENTLY_SUPPORTED";
  }
  return "SOURCE_STATED";
}

function classForUrl(url: string, map: Map<string, SourceClass>): SourceClass {
  if (map.has(url)) return map.get(url)!;
  try {
    const host = new URL(url).hostname.toLowerCase();
    for (const [key, value] of map) {
      try {
        if (new URL(key).hostname.toLowerCase() === host) return value;
      } catch {
        /* ignore malformed map keys */
      }
    }
  } catch {
    /* ignore malformed evidence URLs */
  }
  return "UNKNOWN";
}

export function coverageEvidenceFromRegistry(input: {
  registry: EvidenceRegistry;
  productId: string;
  sourceClassByUrl: Map<string, SourceClass>;
}): CoverageEvidenceRecord[] {
  const repeats = new Map<string, number>();
  for (const entry of input.registry.entries) {
    const key = `${entry.field}|${entry.originalText.toLowerCase()}`;
    repeats.set(key, (repeats.get(key) ?? 0) + 1);
  }

  return input.registry.entries.map((entry) => {
    const sourceClass = classForUrl(entry.url, input.sourceClassByUrl);
    const key = `${entry.field}|${entry.originalText.toLowerCase()}`;
    const notes = [...entry.notes];
    if ((repeats.get(key) ?? 0) > 1 && sourceClass === "AFFILIATE_RESOURCE") {
      notes.push("The same statement on multiple affiliate pages is not independent confirmation.");
    }
    return {
      evidenceId: entry.id,
      productId: input.productId,
      sourceUrl: entry.url,
      sourceClass,
      excerpt: entry.originalText,
      collectedAt: entry.collectedAt,
      informationType: entry.field,
      confidence: entry.verification,
      useRestriction: entry.restriction,
      groundingStatus: groundingStatusOf(entry, sourceClass),
      notes,
    };
  });
}

export function usableNewEvidence(input: {
  beforeIds: Set<string>;
  after: CoverageEvidenceRecord[];
}): CoverageEvidenceRecord[] {
  return input.after.filter((item) => {
    const key = `${item.informationType}|${item.excerpt.toLowerCase()}`;
    if (input.beforeIds.has(key)) return false;
    if (item.groundingStatus === "PROHIBITED" || item.groundingStatus === "UNVERIFIED" || item.groundingStatus === "CONFLICTING") {
      return false;
    }
    return item.useRestriction === "PUBLISHABLE" || item.useRestriction === "ATTRIBUTED_ONLY";
  });
}
