/**
 * Opportunity Engine: validator contract.
 *
 * Interface only. Each method reports problems and never throws or changes its
 * input. No rules ship in this step.
 */

export interface OpportunityIssue {
  field: string;
  message: string;
}

export interface OpportunityValidator {
  validateSignal(input: unknown): OpportunityIssue[];
  validateAnalysis(input: unknown): OpportunityIssue[];
  validateResult(input: unknown): OpportunityIssue[];
}
