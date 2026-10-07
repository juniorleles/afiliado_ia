/**
 * Traffic Intelligence Engine: signal registry contract.
 *
 * Interface only. The registry is the single list of signal definitions the
 * engine may use. It supports registering a signal, enabling it, disabling it,
 * validating one without registering it, and listing them. No implementation
 * ships in this step.
 */
import type { TrafficIssue } from "./traffic-validator";
import type { TrafficSignal, TrafficSignalCategory } from "./traffic-types";

export interface TrafficSignalFilter {
  category?: TrafficSignalCategory;
  enabled?: boolean;
}

export interface TrafficSignalRegistry {
  /** Adds a signal. Rejects an invalid signal or a duplicate id. */
  register(signal: TrafficSignal): TrafficSignal;
  /** Marks a registered signal enabled. Rejects an unknown id. */
  enable(id: string): TrafficSignal;
  /** Marks a registered signal disabled. Rejects an unknown id. */
  disable(id: string): TrafficSignal;
  get(id: string): TrafficSignal | null;
  /** The registered signals, optionally narrowed by category or enabled flag. */
  list(filter?: TrafficSignalFilter): TrafficSignal[];
  /** Reports problems with a signal without registering it. */
  validate(signal: unknown): TrafficIssue[];
}
