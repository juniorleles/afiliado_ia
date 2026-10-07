/**
 * Host record domain: campaign issue registry.
 *
 * The registry is the single list of issues one local validation run may
 * hold. It supports registering an issue, validating one without registering
 * it, and listing them. Duplicate issue ids are rejected. It never reaches an
 * outside system and never submits a record for review.
 */
import type { GoogleAdsPolicyIssue } from "./google-ads-policy-snapshot";
import { copyPlainGoogleAdsPolicy, freezeDeepGoogleAdsPolicy, GOOGLE_ADS_POLICY_AREAS, GOOGLE_ADS_POLICY_ISSUE_KINDS } from "./google-ads-policy-snapshot";
import { createGoogleAdsCampaignPolicyValidator } from "./google-ads-policy-validator";

export interface GoogleAdsCampaignIssueRegistry {
  register(issue: GoogleAdsPolicyIssue): GoogleAdsPolicyIssue;
  get(id: string): GoogleAdsPolicyIssue | null;
  list(): GoogleAdsPolicyIssue[];
  listByKind(kind: GoogleAdsPolicyIssue["kind"]): GoogleAdsPolicyIssue[];
  validate(issue: unknown): { field: string; message: string }[];
}

export function createGoogleAdsCampaignIssueRegistry(): GoogleAdsCampaignIssueRegistry {
  const issues = new Map<string, GoogleAdsPolicyIssue>();
  const validator = createGoogleAdsCampaignPolicyValidator();
  return {
    register(issue) {
      const problems = validator.validateIssue(issue);
      if (problems.length > 0) throw new Error(problems[0]?.message ?? "Corrupted Campaign Model");
      if (issues.has(issue.id)) throw new Error(`Duplicate Assets: issue "${issue.id}" is already listed.`);
      const frozen = freezeDeepGoogleAdsPolicy(copyPlainGoogleAdsPolicy(issue));
      issues.set(issue.id, frozen);
      return frozen;
    },
    get: (id) => issues.get(id) ?? null,
    list: () => [...issues.values()],
    listByKind: (kind) => [...issues.values()].filter((item) => item.kind === kind),
    validate: (issue) => validator.validateIssue(issue),
  };
}

export { GOOGLE_ADS_POLICY_AREAS, GOOGLE_ADS_POLICY_ISSUE_KINDS };
