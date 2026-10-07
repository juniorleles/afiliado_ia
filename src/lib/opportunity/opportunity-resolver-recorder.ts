/**
 * Opportunity Resolver: evidence recorder.
 *
 * Signals ask the Evidence Resolver for their evidence while they run, and what
 * the providers return would otherwise be lost. The recorder listens to the
 * Evidence Resolver and keeps what it hears, so the Resolver can put it in the
 * analysis snapshot without collecting anything itself, and so no provider
 * runs twice.
 *
 * Wire it once: pass `recorder.observer` to createEvidenceResolver, and pass
 * the recorder to the pipeline. The pipeline empties it just before the
 * signals run and takes what it holds just after. One recorder belongs to one
 * running pipeline at a time.
 *
 * It copies what it hears, never changes it, and never runs a provider.
 */
import type { EvidenceCollectionResult } from "./providers/evidence-provider-contract";
import { cloneFrozenData } from "./providers/evidence-provider-context";

export interface EvidenceRecorder {
  /** Hand this to createEvidenceResolver({ observer }). */
  readonly observer: (results: readonly EvidenceCollectionResult[]) => void;
  /** Returns what was heard since the last drain, in the order it was heard, and forgets it. */
  drain(): EvidenceCollectionResult[];
}

export function createEvidenceRecorder(): EvidenceRecorder {
  let heard: EvidenceCollectionResult[] = [];
  return {
    observer(results) {
      for (const result of results) heard.push(cloneFrozenData(result));
    },
    drain() {
      const taken = heard;
      heard = [];
      return taken;
    },
  };
}
