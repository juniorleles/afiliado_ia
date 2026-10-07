/**
 * Policy Risk Signal: rule registry.
 *
 * Rules are metadata only: an id, a version, a dimension, and the generic
 * indicators or page-section kinds that make a potential risk visible, plus
 * the safeguards a risk calls for. No real platform policy is encoded here or
 * anywhere in this module, and a rule never evaluates, approves, or blocks.
 *
 * The registry supports registering, enabling, disabling, validating, and
 * versioning rules. Registration copies the rule, so later changes to the
 * caller's object never reach the registry, and everything it returns is
 * frozen. It reads and writes nothing outside its own memory.
 */
import { validatePolicyRule } from "./policy-risk-validator";
import type { PolicyRiskDimension, PolicyRuleKind, PolicySafeguard } from "./policy-risk-result";
import { freezeDeepTraffic } from "./traffic-signal-context";
import type { TrafficIssue } from "./traffic-validator";
import type { TrafficMetadata } from "./traffic-types";

export interface PolicyRule {
  /** Lowercase letters, digits, and hyphens, starting with a letter. */
  readonly id: string;
  /** Semantic version, for example 1.0.0. */
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly dimension: PolicyRiskDimension;
  readonly kind: PolicyRuleKind;
  /** The initial state in a registry. */
  readonly enabled: boolean;
  /** Whole words or phrases, compared case-insensitively. */
  readonly indicators: readonly string[];
  /** Page-section kinds (see the Landing Page Structure) whose presence is itself the indicator. */
  readonly sectionKinds: readonly string[];
  /** For RISK: safeguards a hit calls for. For SAFEGUARD_CHECK: safeguards always expected. */
  readonly requires: readonly PolicySafeguard[];
  /** For SAFEGUARD_INDICATOR: safeguards a hit shows to be present. */
  readonly provides: readonly PolicySafeguard[];
  /** Flat notes. */
  readonly metadata: Readonly<TrafficMetadata>;
}

export interface PolicyRuleEntry {
  readonly id: string;
  readonly rule: PolicyRule;
  readonly enabled: boolean;
  readonly version: string;
}

export class PolicyRuleError extends Error {
  readonly issues: readonly TrafficIssue[];
  constructor(message: string, issues: readonly TrafficIssue[]) {
    super(message);
    this.name = "PolicyRuleError";
    this.issues = issues;
  }
}

export interface PolicyRuleRegistry {
  /** Adds a rule. Throws PolicyRuleError for an invalid rule or a duplicate id. */
  register(rule: unknown): PolicyRuleEntry;
  enable(id: string): PolicyRuleEntry;
  disable(id: string): PolicyRuleEntry;
  /** What registering this rule would be told: its own problems, and a duplicate id. Changes nothing. */
  validate(rule: unknown): TrafficIssue[];
  /** Replaces a registered rule by a rule of the same id with a strictly greater version. Keeps the enabled state. */
  revise(rule: unknown): PolicyRuleEntry;
  versionOf(id: string): string | null;
  /** Every version the id has had, oldest first. */
  history(id: string): string[];
  get(id: string): PolicyRuleEntry | null;
  /** Sorted by id. */
  list(): PolicyRuleEntry[];
  count(): number;
}

const parts = (version: string) => version.split(".").map((part) => Number(part));
/** Positive when a is greater than b. */
export function comparePolicyVersions(a: string, b: string): number {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

function copyRule(rule: PolicyRule): PolicyRule {
  return freezeDeepTraffic(JSON.parse(JSON.stringify(rule)) as PolicyRule);
}

export function createPolicyRuleRegistry(initial: readonly unknown[] = []): PolicyRuleRegistry {
  const rules = new Map<string, { rule: PolicyRule; enabled: boolean; history: string[] }>();

  const entryOf = (id: string): PolicyRuleEntry => {
    const found = rules.get(id) as { rule: PolicyRule; enabled: boolean; history: string[] };
    return freezeDeepTraffic({ id, rule: found.rule, enabled: found.enabled, version: found.rule.version });
  };
  const mustExist = (id: string) => {
    if (!rules.has(id)) throw new PolicyRuleError("Unknown rule.", [{ field: "id", message: `Unknown rule "${id}".` }]);
  };
  const setEnabled = (id: string, enabled: boolean) => {
    mustExist(id);
    (rules.get(id) as { enabled: boolean }).enabled = enabled;
    return entryOf(id);
  };

  const registry: PolicyRuleRegistry = {
    validate(rule) {
      const issues = validatePolicyRule(rule);
      const id = (rule as { id?: unknown } | null)?.id;
      if (issues.length === 0 && typeof id === "string" && rules.has(id)) issues.push({ field: "id", message: `Duplicate rule "${id}": a rule with this id is already registered.` });
      return issues;
    },
    register(rule) {
      const issues = registry.validate(rule);
      if (issues.length > 0) throw new PolicyRuleError("Rule is invalid.", issues);
      const copy = copyRule(rule as PolicyRule);
      rules.set(copy.id, { rule: copy, enabled: copy.enabled, history: [copy.version] });
      return entryOf(copy.id);
    },
    enable: (id) => setEnabled(id, true),
    disable: (id) => setEnabled(id, false),
    revise(rule) {
      const issues = validatePolicyRule(rule);
      if (issues.length > 0) throw new PolicyRuleError("Rule is invalid.", issues);
      const next = copyRule(rule as PolicyRule);
      mustExist(next.id);
      const current = rules.get(next.id) as { rule: PolicyRule; enabled: boolean; history: string[] };
      if (comparePolicyVersions(next.version, current.rule.version) <= 0) {
        throw new PolicyRuleError("Rule version must increase.", [{ field: "version", message: `Version ${next.version} is not greater than the registered version ${current.rule.version}.` }]);
      }
      current.rule = next;
      current.history.push(next.version);
      return entryOf(next.id);
    },
    versionOf: (id) => rules.get(id)?.rule.version ?? null,
    history: (id) => [...(rules.get(id)?.history ?? [])],
    get: (id) => (rules.has(id) ? entryOf(id) : null),
    list: () => [...rules.keys()].sort().map(entryOf),
    count: () => rules.size,
  };
  for (const rule of initial) registry.register(rule);
  return registry;
}
