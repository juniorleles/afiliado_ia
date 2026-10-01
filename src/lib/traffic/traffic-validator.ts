/**
 * Traffic Intelligence Engine: validator contract.
 *
 * Interface only. Each method reports problems and never throws or changes its
 * input. No rules ship in this step. The rules a later step must hold:
 *
 *  - a signal has a supported category, a finite priority, an enabled flag,
 *    and flat metadata;
 *  - an analysis has a supported status, ISO timestamps, a completedAt that is
 *    null until the analysis is COMPLETED or FAILED, and a positive version;
 *  - a result has flat metadata, warnings that are text, and signals that are
 *    themselves valid.
 *
 * Policy is carried as a signal category only. Judging a policy is not this
 * validator's job.
 */

export interface TrafficIssue {
  field: string;
  message: string;
}

export interface TrafficValidator {
  validateSignal(input: unknown): TrafficIssue[];
  validateAnalysis(input: unknown): TrafficIssue[];
  validateResult(input: unknown): TrafficIssue[];
}
