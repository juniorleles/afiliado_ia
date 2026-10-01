/**
 * Decision Intelligence Engine: validator contract.
 *
 * Interface only. Each method reports problems and never throws or changes its
 * input. No rules ship in this step. The rules a later step must hold:
 *
 *  - Missing Rule: a well-formed rule id is required, and enable/disable of an
 *    unknown id is rejected;
 *  - Duplicate Rule: a second registration of the same id is rejected;
 *  - Invalid Metadata: metadata must be a flat record of text, numbers,
 *    booleans, or null;
 *  - Missing Analysis: an analysis record is required, with a supported status,
 *    ISO timestamps, a completedAt that is null until COMPLETED or FAILED, and
 *    a positive version.
 *
 * This validator does not judge an opportunity, a traffic result, or a page.
 */

export interface DecisionIssue {
  field: string;
  message: string;
}

export interface DecisionValidator {
  validateRule(input: unknown): DecisionIssue[];
  validateAnalysis(input: unknown): DecisionIssue[];
  validateResult(input: unknown): DecisionIssue[];
  validateRequest(input: unknown): DecisionIssue[];
  validateContext(input: unknown): DecisionIssue[];
  validateMetadata(input: unknown): DecisionIssue[];
}
