import { fingerprintsSimilar, uniqueFingerprintCount } from "@/lib/validation/fingerprint";
import type { StructureFingerprint, StructuralDiversityLevel, ValidationCandidate } from "@/lib/validation/types";

export function compareFingerprintPair(a: StructureFingerprint, b: StructureFingerprint): {
  similar: boolean;
  shared: string[];
} {
  const shared: string[] = [];
  if (a.heroFamily === b.heroFamily) shared.push(`heroFamily=${a.heroFamily}`);
  if (a.sceneSequence === b.sceneSequence) shared.push("sceneSequence");
  if (a.sectionVariants === b.sectionVariants) shared.push("sectionVariants");
  if (a.ctaDistribution === b.ctaDistribution) shared.push("ctaDistribution");
  if (a.imageSlotDistribution === b.imageSlotDistribution) shared.push("imageSlotDistribution");
  if (a.layoutFamilies === b.layoutFamilies) shared.push("layoutFamilies");
  if (a.contentPriorityPattern === b.contentPriorityPattern) shared.push("contentPriorityPattern");
  if (a.visualTheme === b.visualTheme) shared.push(`visualTheme=${a.visualTheme}`);
  return { similar: fingerprintsSimilar(a, b), shared };
}

export function structuralDiversityOf(prints: StructureFingerprint[]): StructuralDiversityLevel | "INSUFFICIENT_SAMPLE" {
  if (prints.length < 2) return "INSUFFICIENT_SAMPLE";
  const unique = uniqueFingerprintCount(prints);
  const ratio = unique / prints.length;
  const similarPairs = countSimilarPairs(prints);
  if (ratio >= 0.7 && similarPairs === 0) return "GOOD";
  if (ratio >= 0.45) return "LIMITED";
  return "POOR";
}

export function countSimilarPairs(prints: StructureFingerprint[]): number {
  let count = 0;
  for (let i = 0; i < prints.length; i += 1) {
    for (let j = i + 1; j < prints.length; j += 1) {
      if (fingerprintsSimilar(prints[i]!, prints[j]!)) count += 1;
    }
  }
  return count;
}

export function compositionFamily(candidate: ValidationCandidate): string {
  if (!candidate.fingerprint) return "UNKNOWN";
  return `${candidate.fingerprint.heroFamily}::${candidate.fingerprint.layoutFamilies}`;
}

export function suspiciousSimilarityFailures(candidates: ValidationCandidate[]) {
  const prints = candidates.map((item) => item.fingerprint).filter((item): item is StructureFingerprint => Boolean(item));
  const level = structuralDiversityOf(prints);
  return { level, similarPairs: countSimilarPairs(prints), unique: uniqueFingerprintCount(prints) };
}
