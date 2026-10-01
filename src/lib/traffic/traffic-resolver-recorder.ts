/**
 * Traffic Resolver: execution recorder.
 *
 * The signal pipeline returns one result per enabled signal. The recorder
 * keeps those results, in the order they were heard, so the Resolver can put
 * them in the snapshot and so a later check can see that each signal ran
 * exactly once. The recorder never runs a signal.
 *
 * Wire it once: pass the recorder to the pipeline. The pipeline empties it
 * just before the signals run and takes what it holds just after. One recorder
 * belongs to one running pipeline at a time.
 *
 * It copies what it hears, never changes it, and never interprets a result.
 */
import type { TrafficSignalResult, TrafficSignalResultStatus } from "./traffic-signal-contract";
import { cloneFrozenTraffic } from "./traffic-resolver-context";

export interface RecordedTrafficExecution {
  readonly signalId: string;
  readonly status: TrafficSignalResultStatus;
  readonly executionTime: number;
}

export interface TrafficExecutionRecorder {
  /** Keep one result as it was returned. Does not run the signal. */
  record(result: TrafficSignalResult): void;
  /** Returns what was heard since the last drain, in the order it was heard, and forgets it. */
  drain(): RecordedTrafficExecution[];
}

export function createTrafficExecutionRecorder(): TrafficExecutionRecorder {
  let heard: RecordedTrafficExecution[] = [];
  return {
    record(result) {
      heard.push(
        cloneFrozenTraffic({
          signalId: result.signalId,
          status: result.status,
          executionTime: result.executionTime,
        }),
      );
    },
    drain() {
      const taken = heard;
      heard = [];
      return taken;
    },
  };
}
