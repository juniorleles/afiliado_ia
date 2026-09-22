import type { LayoutSnapshot } from "@/lib/visual-qa/types";
import { compositionFamily } from "@/lib/validation/diversity";
import type { LightweightPerformance, ValidationCandidate } from "@/lib/validation/types";
import { PRODENTIM_PERF_BASELINE } from "@/lib/validation/types";

export type ResourceTiming = {
  name: string;
  encodedBodySize: number;
  transferSize: number;
  initiatorType: string;
};

export function aggregateResources(resources: ResourceTiming[]): {
  transferBytes: number;
  imageBytes: number;
  jsBytes: number;
} {
  let transferBytes = 0;
  let imageBytes = 0;
  let jsBytes = 0;
  for (const item of resources) {
    const size = item.transferSize || item.encodedBodySize || 0;
    transferBytes += size;
    if (item.initiatorType === "img" || /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(item.name)) {
      imageBytes += size;
    }
    if (item.initiatorType === "script" || /\.js(\?|$)/i.test(item.name)) {
      jsBytes += size;
    }
  }
  return { transferBytes, imageBytes, jsBytes };
}

export function lightweightPerformanceFrom(input: {
  resources: ResourceTiming[];
  snapshots: LayoutSnapshot[];
}): LightweightPerformance {
  const bytes = aggregateResources(input.resources);
  const overflow = input.snapshots.some((snap) => snap.overflowX);
  const flags: string[] = [];
  if (bytes.transferBytes > PRODENTIM_PERF_BASELINE.transferBytes * 3) {
    flags.push(
      `transfer ${bytes.transferBytes}B exceeds 3x ProDentim baseline ${PRODENTIM_PERF_BASELINE.transferBytes}B`,
    );
  }
  if (overflow) flags.push("overflow-x detected");
  return {
    transferBytes: bytes.transferBytes,
    imageBytes: bytes.imageBytes,
    jsBytes: bytes.jsBytes,
    lcpMs: null,
    cls: null,
    overflow,
    regressionFlags: flags,
    lighthouseUsed: false,
    lighthousePerformance: null,
  };
}

export function selectLighthouseTargets(candidates: ValidationCandidate[]): string[] {
  const withComposition = candidates.filter((c) => c.fingerprint);
  const byFamily = new Map<string, ValidationCandidate>();
  for (const candidate of withComposition) {
    const family = compositionFamily(candidate);
    if (!byFamily.has(family)) byFamily.set(family, candidate);
  }
  const heaviest = [...candidates].sort(
    (a, b) => (b.performance?.transferBytes || 0) - (a.performance?.transferBytes || 0),
  )[0];
  const visualWorst = [...candidates].sort((a, b) => b.visualQa.highCount - a.visualQa.highCount)[0];
  const ids = new Set<string>();
  for (const item of byFamily.values()) ids.add(item.id);
  if (heaviest) ids.add(heaviest.id);
  if (visualWorst) ids.add(visualWorst.id);
  return [...ids];
}

export function applyLighthouseScores(
  current: LightweightPerformance,
  scores: { performance: number; lcpMs: number | null; cls: number | null },
): LightweightPerformance {
  const flags = [...current.regressionFlags];
  if (scores.performance + 8 < PRODENTIM_PERF_BASELINE.mobileLighthouse) {
    flags.push(`lighthouse ${scores.performance} vs ProDentim baseline ${PRODENTIM_PERF_BASELINE.mobileLighthouse}`);
  }
  if (scores.lcpMs && scores.lcpMs > PRODENTIM_PERF_BASELINE.lcpMs * 2) {
    flags.push(`LCP ${scores.lcpMs}ms vs baseline ${PRODENTIM_PERF_BASELINE.lcpMs}ms`);
  }
  if (scores.cls && scores.cls > 0.1) {
    flags.push(`CLS ${scores.cls} above 0.1`);
  }
  return {
    ...current,
    lcpMs: scores.lcpMs,
    cls: scores.cls,
    lighthouseUsed: true,
    lighthousePerformance: scores.performance,
    regressionFlags: Array.from(new Set(flags)),
  };
}
