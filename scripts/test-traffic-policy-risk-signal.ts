import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createOpportunityExecutionContext } from "../src/lib/opportunity/opportunity-resolver-context.ts";
import { createOpportunityResolver } from "../src/lib/opportunity/opportunity-resolver.ts";
import { createOpportunityExplanationEngine } from "../src/lib/opportunity/opportunity-explanation-engine.ts";
import { createSignalPipeline } from "../src/lib/opportunity/opportunity-signal-pipeline.ts";
import type { OpportunitySignalModule, SignalOutput } from "../src/lib/opportunity/opportunity-signal-contract.ts";
import { createEvidenceContext } from "../src/lib/opportunity/providers/evidence-provider-context.ts";
import {
  POLICY_RESULT_KEYS,
  POLICY_RISK_DIMENSIONS,
  POLICY_RISK_SCOPE_NOTE,
  POLICY_RULE_KEYS,
  POLICY_RULE_KINDS,
  POLICY_SAFEGUARDS,
  POLICY_SAFEGUARD_DIMENSION,
  POLICY_SOURCE_KINDS,
  POLICY_VERDICTS,
  SAFEGUARD_STATUSES,
  normalizePolicyText,
  policyRiskToSignalOutput,
} from "../src/lib/traffic/policy-risk-result.ts";
import type { PolicyRiskInputs } from "../src/lib/traffic/policy-risk-result.ts";
import { DEFAULT_POLICY_RULES, DEFAULT_SAFEGUARD_SOURCES } from "../src/lib/traffic/policy-rule-definitions.ts";
import { PolicyRuleError, comparePolicyVersions, createPolicyRuleRegistry } from "../src/lib/traffic/policy-rule-registry.ts";
import type { PolicyRule } from "../src/lib/traffic/policy-rule-registry.ts";
import {
  validatePolicyRiskContext,
  validatePolicyRiskInputs,
  validatePolicyRiskResult,
  validatePolicyRule,
  validatePolicyRules,
  validateSafeguardSources,
} from "../src/lib/traffic/policy-risk-validator.ts";
import { analyzePolicyRisk } from "../src/lib/traffic/policy-risk-analyzer.ts";
import { POLICY_RISK_SIGNAL_ID, createDefaultPolicyRuleRegistry, createPolicyRiskSignal, registerPolicyRiskSignal } from "../src/lib/traffic/policy-risk-signal.ts";
import type { PolicyRiskSignalOptions } from "../src/lib/traffic/policy-risk-signal.ts";
import { registerChannelSuitabilitySignal, createChannelSuitabilitySignal } from "../src/lib/traffic/channel-suitability-signal.ts";
import { createTrafficSignalContext } from "../src/lib/traffic/traffic-signal-context.ts";
import type { TrafficSignalContext } from "../src/lib/traffic/traffic-signal-context.ts";
import type { TrafficSignalModule } from "../src/lib/traffic/traffic-signal-contract.ts";
import { TrafficFrameworkError, createTrafficModuleRegistry } from "../src/lib/traffic/traffic-signal-registry.ts";
import { createTrafficSignalPipeline } from "../src/lib/traffic/traffic-signal-pipeline.ts";
import { validateTrafficSignalModule, validateTrafficSignalOutput } from "../src/lib/traffic/traffic-signal-validator.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const zero = () => 0;
const has = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));
const stable = (value: unknown) => JSON.stringify(value, (k, v) => (k === "executionTime" ? 0 : v));
const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((value, i) => value === b[i]);
const sameOutput = (a: { status: unknown; confidence: unknown; metadata: unknown; warnings: unknown; errors: unknown }, b: { status: unknown; confidence: unknown; metadata: unknown; warnings: unknown; errors: unknown }) =>
  stable({ status: a.status, confidence: a.confidence, metadata: a.metadata, warnings: a.warnings, errors: a.errors }) === stable({ status: b.status, confidence: b.confidence, metadata: b.metadata, warnings: b.warnings, errors: b.errors });
const tick = () => {
  let t = 0;
  return () => (t += 1);
};

const candidate = { id: "cand-1", source: "feed", url: "https://example.test/gizmo", title: "Fictional item", status: "NEW" as const, createdAt: "2026-01-01T00:00:00.000Z" };
const candidateBefore = JSON.stringify(candidate);

// ---------- Opportunity fixtures, from the real Resolver and Explanation Engine ----------
const CATEGORIES = ["EVIDENCE", "LANDING_PAGE", "COMPETITION", "COMMERCIAL_INTENT", "MARKET", "BRAND"] as const;
function fakeOpportunity(id: string, category: OpportunitySignalModule["category"], metadata: SignalOutput["metadata"]): OpportunitySignalModule {
  return {
    id,
    name: `Signal ${id}`,
    version: "1.0.0",
    category,
    enabled: true,
    priority: 100,
    dependencies: { requires: [], optional: [], conflicts: [] },
    supportsCandidate: () => true,
    validate: () => [],
    analyze: () => ({ status: "COMPLETED", confidence: 0.8, metadata: { ...metadata }, warnings: [], errors: [] }),
  };
}
function resolverClocks() {
  let t = 0;
  let s = 0;
  let n = 0;
  return { now: () => (t += 1), timestamp: () => new Date(Date.UTC(2026, 0, 1, 0, 0, (s += 1))).toISOString(), idFactory: () => `analysis-${(n += 1)}` };
}
const OWNER: Record<string, string> = {
  PRICING: "evid",
  RETURNS: "evid",
  MANUFACTURER: "evid",
  SHIPPING: "evid",
  GUARANTEE: "evid",
  PRESENTATION_READINESS: "lp",
  INFORMATION_DENSITY: "lp",
  PRICING_COVERAGE: "lp",
  CUSTOM_DIMENSION: "evid",
};
const GOOD: Record<string, string> = { PRICING: "STRONG", RETURNS: "STRONG", MANUFACTURER: "STRONG", PRESENTATION_READINESS: "STRONG", INFORMATION_DENSITY: "STRONG" };

interface Scenario {
  states?: Record<string, string | null>;
  explain?: boolean;
  configuration?: Record<string, unknown>;
  mutate?: (analysis: Record<string, unknown>) => void;
}
async function scenario(options: Scenario = {}) {
  const states = { ...GOOD, ...(options.states ?? {}) };
  const bySignal: Record<string, Record<string, string>> = { evid: {}, lp: {} };
  for (const [dimension, state] of Object.entries(states)) if (state !== null) bySignal[OWNER[dimension]][`dimension.${dimension}`] = state;
  const signals = createSignalPipeline({ now: zero });
  Object.entries(bySignal).forEach(([id, metadata], i) => signals.register(fakeOpportunity(id, CATEGORIES[i % CATEGORIES.length], metadata)));
  const opportunityContext = createOpportunityExecutionContext({
    candidate,
    evidenceContext: createEvidenceContext({ candidate, metadata: {}, extensions: {}, resolvedProductData: {} }),
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: {},
  } as never);
  const run = await createOpportunityResolver({ signals, ...resolverClocks() } as never).run(opportunityContext);
  const analysis = JSON.parse(JSON.stringify(run.analysis)) as Record<string, unknown>;
  options.mutate?.(analysis);
  const explanation = options.explain === false ? null : createOpportunityExplanationEngine({ now: tick() }).explain(run.analysis).explanation;
  const context = createTrafficSignalContext({
    candidate,
    opportunityAnalysis: analysis as never,
    opportunityExplanation: explanation as never,
    executionMetadata: { run: "t1", attempt: 2 },
    runtimeMetadata: { host: "h1" },
    configuration: (options.configuration ?? {}) as never,
  });
  return { context, analysis, explanation };
}

// ---------- content fixtures (fictional) ----------
const SECRET = "ZETA-PHRASE-77";
const evidenceItem = (id: string, text: string, over: Record<string, unknown> = {}) => ({ id, text, sourceUrl: "https://seller.example/item", pageCategory: "PRODUCT", field: null, ...over });
const section = (id: string, kind: string, texts: string[], over: Record<string, unknown> = {}) => ({ id, kind, visible: true, texts, ...over });
const content = (over: Partial<PolicyRiskInputs> = {}): PolicyRiskInputs => ({ evidenceContext: null, landingPage: null, manualOverrides: null, ...over }) as PolicyRiskInputs;
const CLEAN = (): PolicyRiskInputs =>
  content({
    evidenceContext: { items: [evidenceItem("e1", "A desk lamp with a metal arm.")] },
    landingPage: { sections: [section("hero", "hero", ["A durable blue desk lamp with an adjustable arm."]), section("price", "pricing", ["Available in one size."]), section("by", "manufacturer", ["Made by a fictional maker."]), section("terms", "guarantee", ["Return terms are listed here."])] },
    manualOverrides: [],
  });
const RISKY = (over: { hero?: string[]; extraSections?: unknown[]; evidence?: unknown[]; overrides?: unknown[] } = {}): PolicyRiskInputs =>
  content({
    evidenceContext: { items: (over.evidence ?? [evidenceItem("e2", "Limited stock! Hurry. Make money, six figures.", { sourceUrl: "https://seller.example/reviews", pageCategory: "REVIEWS" })]) as never },
    landingPage: { sections: [section("hero", "hero", over.hero ?? ["This lamp cures eye strain.", "Lose weight fast.", `Guaranteed ${SECRET}`]), section("price", "pricing", ["Available in one size."]), ...((over.extraSections ?? []) as never[])] },
    manualOverrides: (over.overrides ?? []) as never,
  });

const policySignalWith = (options: PolicyRiskSignalOptions = {}) => createPolicyRiskSignal({ now: zero, ...options });
const withContent = (value: PolicyRiskInputs | null, options: PolicyRiskSignalOptions = {}) => policySignalWith({ content: () => value, ...options });
const run = (signal: TrafficSignalModule, context: TrafficSignalContext) => signal.analyze(context, {} as never);
const metaOf = (output: { metadata: Record<string, unknown> }) => output.metadata;
const listOf = (output: { metadata: Record<string, unknown> }, key: string) => String(output.metadata[key] ?? "").split(",").filter((part) => part !== "");
const ruleOf = (id: string, over: Record<string, unknown> = {}) => ({ ...(DEFAULT_POLICY_RULES.find((r) => r.id === id) as PolicyRule), ...over });
const zetaRule = (over: Record<string, unknown> = {}): PolicyRule => ({ id: "zeta-urgency", version: "1.0.0", name: "Zeta urgency", description: "A fictional rule for tests.", dimension: "URGENCY_LANGUAGE", kind: "RISK", enabled: true, indicators: ["zeta flash"], sectionKinds: [], requires: [], provides: [], metadata: {}, ...over }) as PolicyRule;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));
}
const stripCode = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/`(?:\\.|[^`\\])*`/g, '""').replace(/"(?:\\.|[^"\\\n])*"/g, '""').replace(/'(?:\\.|[^'\\\n])*'/g, '""').replace(/\/\/.*$/gm, "");

async function main() {
  const base = await scenario();

  // ---------- vocabulary ----------
  check("thirteen risk dimensions, in the specified order", same(POLICY_RISK_DIMENSIONS, ["MEDICAL_CLAIMS", "WEIGHT_LOSS_CLAIMS", "BEFORE_AFTER_REFERENCES", "FINANCIAL_CLAIMS", "INCOME_CLAIMS", "GUARANTEE_LANGUAGE", "URGENCY_LANGUAGE", "SCARCITY_LANGUAGE", "TESTIMONIALS", "COMPLIANCE_DISCLAIMERS", "RESTRICTED_CATEGORIES", "DESTINATION_QUALITY", "TRANSPARENCY_SIGNALS"]));
  check("four verdicts and four safeguard statuses, none of them an approval", same(POLICY_VERDICTS, ["RISK_IDENTIFIED", "SAFEGUARD_MISSING", "NONE_IDENTIFIED", "NOT_ASSESSED"]) && same(SAFEGUARD_STATUSES, ["PRESENT", "PARTIAL", "ABSENT", "UNKNOWN"]) && !POLICY_VERDICTS.some((v) => /APPROV|SAFE$|COMPLIANT|PASS/.test(v)));
  check("every safeguard belongs to one dimension", POLICY_SAFEGUARDS.length === 7 && POLICY_SAFEGUARDS.every((s) => POLICY_RISK_DIMENSIONS.includes(POLICY_SAFEGUARD_DIMENSION[s])));
  check("the result carries exactly the specified fields", same([...POLICY_RESULT_KEYS].sort(), ["confidence", "executionTime", "identifiedRisks", "metadata", "missingSafeguards", "status", "warnings"]));
  check("rule kinds, source kinds, and rule keys", same(POLICY_RULE_KINDS, ["RISK", "SAFEGUARD_INDICATOR", "SAFEGUARD_CHECK"]) && same(POLICY_SOURCE_KINDS, ["EVIDENCE", "LANDING_PAGE", "OVERRIDE"]) && !POLICY_RULE_KEYS.some((k) => /score|severity|weight|decision|approve|block/i.test(k)));
  check("the scope note says it is no approval, score, or recommendation, and not a compliance statement", /not an approval, a score, or a recommendation/.test(POLICY_RISK_SCOPE_NOTE) && /not a statement that the content is compliant/.test(POLICY_RISK_SCOPE_NOTE));
  check("text normalisation lowercases, straightens quotes, and collapses whitespace", normalizePolicyText("  Don\u2019t  WAIT\n now ") === "don't wait now");

  // ---------- default rules ----------
  check("thirteen built-in rules that pass the rule validator, with unique ids", DEFAULT_POLICY_RULES.length === 13 && new Set(DEFAULT_POLICY_RULES.map((r) => r.id)).size === 13 && validatePolicyRules(DEFAULT_POLICY_RULES).length === 0);
  check("every dimension has a built-in rule", POLICY_RISK_DIMENSIONS.every((d) => DEFAULT_POLICY_RULES.some((r) => r.dimension === d)));
  check("the built-in rules are frozen, versioned 1.0.0, and marked as needing review", DEFAULT_POLICY_RULES.every((r) => Object.isFrozen(r) && Object.isFrozen(r.indicators) && r.version === "1.0.0" && r.metadata.status === "needs review"));
  check("the built-in rules cite no real platform, advertiser program, or regulator", !/google|adwords|microsoft|facebook|tiktok|pinterest|youtube|\bftc\b|\bfda\b|\bmeta\b/i.test(JSON.stringify(DEFAULT_POLICY_RULES)));
  check("the built-in safeguard sources pass their validator and are frozen", validateSafeguardSources(DEFAULT_SAFEGUARD_SOURCES).length === 0 && Object.isFrozen(DEFAULT_SAFEGUARD_SOURCES) && Object.isFrozen(DEFAULT_SAFEGUARD_SOURCES.DISCLAIMER.sectionKinds));
  check("a default registry holds the thirteen rules, all enabled", (() => { const r = createDefaultPolicyRuleRegistry(); return r.count() === 13 && r.list().every((e) => e.enabled); })());

  // ---------- rule validation ----------
  check("Invalid Rule: a non-object is rejected", [null, undefined, "x", 5, []].every((v) => has(validatePolicyRule(v), /a rule must be an object/)));
  check("a valid rule passes", validatePolicyRule(zetaRule()).length === 0);
  check("Invalid Rule: id, version, name, description, dimension, kind, and enabled are checked", has(validatePolicyRule(zetaRule({ id: "Bad Id" })), /id must be/) && has(validatePolicyRule(zetaRule({ id: "" })), /id must be/) && ["1", "1.0", "v1.0.0", 1].every((version) => has(validatePolicyRule(zetaRule({ version })), /semantic version/)) && has(validatePolicyRule(zetaRule({ name: " " })), /name must be/) && has(validatePolicyRule(zetaRule({ description: 5 })), /description must be/) && has(validatePolicyRule(zetaRule({ dimension: "NOPE" })), /dimension is not supported/) && has(validatePolicyRule(zetaRule({ kind: "NOPE" })), /kind is not supported/) && has(validatePolicyRule(zetaRule({ enabled: "yes" })), /enabled must be/));
  check("Invalid Rule: indicators must be non-empty, short, and not repeated", has(validatePolicyRule(zetaRule({ indicators: "x" })), /list of text/) && has(validatePolicyRule(zetaRule({ indicators: ["  "] })), /1 to 80 characters/) && has(validatePolicyRule(zetaRule({ indicators: ["x".repeat(81)] })), /1 to 80 characters/) && has(validatePolicyRule(zetaRule({ indicators: ["Zeta", "zeta  "] })), /is repeated/));
  check("Invalid Rule: section kinds and safeguards are checked", has(validatePolicyRule(zetaRule({ sectionKinds: ["bad kind"] })), /section kind/) && has(validatePolicyRule(zetaRule({ sectionKinds: ["a", "A"] })), /must not repeat/) && has(validatePolicyRule(zetaRule({ requires: ["NOPE"] })), /supported safeguards/) && has(validatePolicyRule(zetaRule({ requires: ["DISCLAIMER", "DISCLAIMER"] })), /must not repeat/));
  check("Invalid Rule: a rule is metadata only, so a score, severity, or decision field is rejected", ["score", "severity", "weight", "decision", "blocks"].every((field) => has(validatePolicyRule(zetaRule({ [field]: 1 })), new RegExp(`unexpected field "${field}"`))));
  check("Invalid Metadata: nested, array, and undefined rule metadata is rejected", [{ a: { b: 1 } }, { a: [1] }, { a: undefined }, [], null].every((metadata) => has(validatePolicyRule(zetaRule({ metadata })), /Invalid metadata/)));
  check("Invalid Rule: a RISK rule needs an indicator or a section kind, and provides nothing", has(validatePolicyRule(zetaRule({ indicators: [] })), /at least one indicator or section kind/) && validatePolicyRule(zetaRule({ indicators: [], sectionKinds: ["gallery"] })).length === 0 && has(validatePolicyRule(zetaRule({ provides: ["DISCLAIMER"] })), /provides no safeguard/));
  const indicatorRule = (over: Record<string, unknown> = {}) => zetaRule({ id: "zeta-disclaimer", dimension: "COMPLIANCE_DISCLAIMERS", kind: "SAFEGUARD_INDICATOR", indicators: ["fine print"], provides: ["DISCLAIMER"], ...over });
  check("Invalid Rule: a SAFEGUARD_INDICATOR rule needs indicators and a safeguard of its own dimension", validatePolicyRule(indicatorRule()).length === 0 && has(validatePolicyRule(indicatorRule({ indicators: [] })), /at least one indicator/) && has(validatePolicyRule(indicatorRule({ provides: [] })), /must provide a safeguard/) && has(validatePolicyRule(indicatorRule({ provides: ["RETURN_TERMS"] })), /own dimension/) && has(validatePolicyRule(indicatorRule({ sectionKinds: ["x"] })), /reads text only/) && has(validatePolicyRule(indicatorRule({ requires: ["DISCLAIMER"] })), /requires no safeguard/));
  const checkRule = (over: Record<string, unknown> = {}) => zetaRule({ id: "zeta-check", dimension: "TRANSPARENCY_SIGNALS", kind: "SAFEGUARD_CHECK", indicators: [], requires: ["PRICING_DISCLOSURE"], ...over });
  check("Invalid Rule: a SAFEGUARD_CHECK rule requires safeguards of its own dimension and carries no indicators", validatePolicyRule(checkRule()).length === 0 && has(validatePolicyRule(checkRule({ requires: [] })), /must require a safeguard/) && has(validatePolicyRule(checkRule({ requires: ["DISCLAIMER"] })), /own dimension/) && has(validatePolicyRule(checkRule({ indicators: ["x"] })), /carries no indicators/));
  check("Duplicate Rule: a repeated id in a list is rejected", has(validatePolicyRules([zetaRule(), zetaRule()]), /Duplicate rule "zeta-urgency"/) && has(validatePolicyRules("x"), /must be a list/) && validatePolicyRules([zetaRule(), indicatorRule()]).length === 0);
  check("safeguard sources: missing, malformed, and unknown entries are rejected", has(validateSafeguardSources(null), /must be an object/) && has(validateSafeguardSources({ ...DEFAULT_SAFEGUARD_SOURCES, DISCLAIMER: undefined }), /"DISCLAIMER" needs its sources/) && has(validateSafeguardSources({ ...DEFAULT_SAFEGUARD_SOURCES, DISCLAIMER: { opportunityDimensions: "x", sectionKinds: [] } }), /opportunityDimensions/) && has(validateSafeguardSources({ ...DEFAULT_SAFEGUARD_SOURCES, DISCLAIMER: { opportunityDimensions: [], sectionKinds: ["a", "a"] } }), /must not repeat/) && has(validateSafeguardSources({ ...DEFAULT_SAFEGUARD_SOURCES, EXTRA: { opportunityDimensions: [], sectionKinds: [] } }), /not a supported safeguard/));

  // ---------- the rule registry ----------
  const registry = createPolicyRuleRegistry();
  const original = zetaRule();
  const entry = registry.register(original);
  check("Register Rule: returns a frozen entry, enabled by the rule's own flag", entry.id === "zeta-urgency" && entry.enabled === true && entry.version === "1.0.0" && Object.isFrozen(entry) && Object.isFrozen(entry.rule) && registry.count() === 1);
  (original as { indicators: string[] }).indicators.push("tampered");
  check("Register Rule: the registry holds a copy, so later changes to the caller's object do not reach it", registry.get("zeta-urgency")!.rule.indicators.join() === "zeta flash");
  let duplicate = false;
  try {
    registry.register(zetaRule());
  } catch (error) {
    duplicate = error instanceof PolicyRuleError && /Duplicate rule/.test(error.issues.map((i) => i.message).join());
  }
  check("Duplicate Rule: a second registration is rejected and the first is kept", duplicate && registry.count() === 1);
  let invalid = false;
  try {
    registry.register(zetaRule({ id: "Bad", version: "x" }));
  } catch (error) {
    invalid = error instanceof PolicyRuleError && error.issues.length === 2 && error.name === "PolicyRuleError";
  }
  check("Invalid Rule: an invalid rule is not registered, and the error carries every issue", invalid && registry.count() === 1 && registry.get("Bad") === null);
  check("Validate Rule: reports a rule's problems and a duplicate id, and changes nothing", registry.validate(zetaRule()).length === 1 && has(registry.validate(zetaRule()), /Duplicate rule/) && registry.validate(zetaRule({ id: "other-rule" })).length === 0 && has(registry.validate(null), /must be an object/) && registry.count() === 1);
  check("Disable Rule and Enable Rule change only the enabled state", registry.disable("zeta-urgency").enabled === false && registry.get("zeta-urgency")!.enabled === false && registry.get("zeta-urgency")!.rule.version === "1.0.0" && registry.enable("zeta-urgency").enabled === true);
  check("enabling or disabling an unknown rule is rejected", (() => { try { registry.enable("nope"); return false; } catch (e) { return e instanceof PolicyRuleError && /Unknown rule/.test(e.message); } })() && (() => { try { registry.disable("nope"); return false; } catch (e) { return e instanceof PolicyRuleError; } })());
  registry.disable("zeta-urgency");
  const revised = registry.revise(zetaRule({ version: "1.1.0", indicators: ["zeta flash", "omega"] }));
  check("Version Rule: a greater version replaces the rule and keeps the enabled state", revised.version === "1.1.0" && revised.enabled === false && registry.versionOf("zeta-urgency") === "1.1.0" && registry.get("zeta-urgency")!.rule.indicators.length === 2);
  check("Version Rule: the history lists every version, oldest first", registry.history("zeta-urgency").join() === "1.0.0,1.1.0" && registry.history("nope").length === 0 && registry.versionOf("nope") === null);
  const refuse = (rule: unknown, text: RegExp) => { try { registry.revise(rule); return false; } catch (e) { return e instanceof PolicyRuleError && text.test(e.issues.map((i) => i.message).join() + e.message); } };
  check("Version Rule: the same or a lower version, an unknown id, and an invalid rule are rejected", refuse(zetaRule({ version: "1.1.0" }), /not greater/) && refuse(zetaRule({ version: "1.0.5" }), /not greater/) && refuse(zetaRule({ id: "nope", version: "9.0.0" }), /Unknown rule/) && refuse(zetaRule({ version: "bad" }), /semantic version/) && registry.versionOf("zeta-urgency") === "1.1.0");
  check("versions compare numerically, not as text", comparePolicyVersions("1.10.0", "1.9.0") > 0 && comparePolicyVersions("2.0.0", "10.0.0") < 0 && comparePolicyVersions("1.2.3", "1.2.3") === 0);
  registry.register(zetaRule({ id: "alpha-urgency", name: "Alpha" }));
  check("List Rules is sorted by id, and a registry can start from a list", registry.list().map((e) => e.id).join() === "alpha-urgency,zeta-urgency" && createPolicyRuleRegistry([zetaRule(), zetaRule({ id: "alpha-urgency" })]).count() === 2);
  check("a registry started from a list with a duplicate or invalid rule is rejected", (() => { try { createPolicyRuleRegistry([zetaRule(), zetaRule()]); return false; } catch (e) { return e instanceof PolicyRuleError; } })() && (() => { try { createPolicyRuleRegistry([{}]); return false; } catch (e) { return e instanceof PolicyRuleError; } })());

  // ---------- the signal ----------
  const signal = policySignalWith();
  check("signal identity and contract", signal.id === POLICY_RISK_SIGNAL_ID && signal.id === "policy-risk" && signal.version === "1.0.0" && signal.category === "POLICY" && signal.enabled === true && signal.priority === 80 && validateTrafficSignalModule(signal).length === 0);
  check("the signal depends on no other signal", signal.dependencies.requires.length === 0 && signal.dependencies.optional.length === 0 && signal.dependencies.conflicts.length === 0);
  check("enabled and priority can be set", policySignalWith({ enabled: false, priority: 5 }).enabled === false && policySignalWith({ priority: 5 }).priority === 5);

  // ---------- registration in the Traffic Signal Framework ----------
  const host = createTrafficModuleRegistry();
  const hostEntry = registerPolicyRiskSignal(host, { now: zero });
  check("registration returns the entry, enabled, in the registry", hostEntry.id === "policy-risk" && hostEntry.enabled && host.count() === 1 && host.get("policy-risk")?.module.category === "POLICY");
  check("registering it twice is rejected as a duplicate signal id", (() => { try { registerPolicyRiskSignal(host, { now: zero }); return false; } catch (e) { return e instanceof TrafficFrameworkError && /already registered/.test(e.message + e.issues.map((i) => i.message).join()); } })() && host.count() === 1);
  const hostPipeline = createTrafficSignalPipeline({ now: zero });
  registerPolicyRiskSignal(hostPipeline, { now: zero });
  check("registration works on a pipeline, and its dependencies are valid", hostPipeline.validateDependencies().length === 0 && hostPipeline.resolveExecutionOrder().order.join() === "policy-risk");

  // ---------- without content ----------
  const bare = run(policySignalWith(), base.context);
  check("without content the signal still COMPLETES, with valid output", bare.status === "COMPLETED" && bare.errors.length === 0 && validateTrafficSignalOutput(bare).length === 0);
  check("without content, claim and category dimensions are NOT_ASSESSED and a warning says why", metaOf(bare)["dimension.MEDICAL_CLAIMS"] === "NOT_ASSESSED" && metaOf(bare)["dimension.RESTRICTED_CATEGORIES"] === "NOT_ASSESSED" && metaOf(bare)["dimension.COMPLIANCE_DISCLAIMERS"] === "NOT_ASSESSED" && bare.warnings.some((w) => /No content was supplied/.test(w)) && metaOf(bare).contentSupplied === false);
  check("without content, transparency and destination quality are read from the Opportunity dimensions", metaOf(bare)["dimension.TRANSPARENCY_SIGNALS"] === "NONE_IDENTIFIED" && metaOf(bare)["dimension.DESTINATION_QUALITY"] === "NONE_IDENTIFIED" && metaOf(bare)["safeguard.PRICING_DISCLOSURE"] === "PRESENT" && metaOf(bare)["safeguard.PAGE_READINESS"] === "PRESENT");
  check("confidence is the share of applicable dimensions that could be assessed", bare.confidence === 2 / 13 && metaOf(bare).assessedCount === 2 && metaOf(bare).applicableCount === 13);
  check("no risks and no missing safeguards are invented", metaOf(bare).riskCount === 0 && metaOf(bare).riskIds === "" && metaOf(bare).missingSafeguardCount === 0);

  // ---------- clean content ----------
  const clean = run(withContent(CLEAN()), base.context);
  check("clean content: every dimension has nothing identified, and confidence is 1", POLICY_RISK_DIMENSIONS.every((d) => metaOf(clean)[`dimension.${d}`] === "NONE_IDENTIFIED") && clean.confidence === 1);
  check("clean content: no risks, no missing safeguards, and no warnings", metaOf(clean).riskCount === 0 && metaOf(clean).missingSafeguardCount === 0 && clean.warnings.length === 0 && clean.status === "COMPLETED");
  check("clean content: NONE_IDENTIFIED is not an approval, and the metadata carries the scope note", metaOf(clean).scopeNote === POLICY_RISK_SCOPE_NOTE && !Object.keys(metaOf(clean)).some((k) => /approv|compliant|safe\b/i.test(k)));
  check("the counts and references are in the metadata", metaOf(clean).evidenceItemCount === 1 && metaOf(clean).pageSectionCount === 4 && metaOf(clean).overrideCount === 0 && metaOf(clean).ruleCount === 13 && metaOf(clean).enabledRuleCount === 13 && metaOf(clean).candidateId === "cand-1" && metaOf(clean).opportunityAnalysisId === (base.analysis as { analysisId: string }).analysisId && metaOf(clean)["rule.medical-claims"] === "1.0.0");
  check("execution metadata is passed through under its own key", metaOf(clean)["execution.run"] === "t1" && metaOf(clean)["execution.attempt"] === 2);

  // ---------- risky content ----------
  const riskyOut = run(withContent(RISKY()), base.context);
  const riskyResult = analyzePolicyRisk({ opportunityAnalysis: base.context.opportunityAnalysis!, opportunityExplanation: base.context.opportunityExplanation, executionMetadata: {}, rules: createDefaultPolicyRuleRegistry().list(), safeguardSources: DEFAULT_SAFEGUARD_SOURCES, content: RISKY() }, zero);
  check("risky content is identified by rule and source, sorted by id", same(riskyResult.identifiedRisks.map((r) => r.id), ["guarantee-language:landing_page:hero", "income-claims:evidence:e2", "medical-claims:landing_page:hero", "scarcity-language:evidence:e2", "urgency-language:evidence:e2", "weight-loss-claims:landing_page:hero"]));
  check("a risk carries its rule, version, dimension, matched phrases, and what it calls for", (() => { const r = riskyResult.identifiedRisks.find((x) => x.id === "medical-claims:landing_page:hero")!; return r.ruleId === "medical-claims" && r.ruleVersion === "1.0.0" && r.dimension === "MEDICAL_CLAIMS" && r.matched.join() === "cures" && r.basis === "INDICATOR" && r.requires.join() === "DISCLAIMER"; })());
  check("provenance survives: an evidence risk keeps its source URL and page category", (() => { const r = riskyResult.identifiedRisks.find((x) => x.id === "income-claims:evidence:e2")!; return r.source.kind === "EVIDENCE" && r.source.sourceUrl === "https://seller.example/reviews" && r.source.pageCategory === "REVIEWS" && r.matched.join() === "make money,six figures"; })());
  check("provenance survives into the signal metadata", metaOf(riskyOut)["risk.income-claims:evidence:e2.sourceUrl"] === "https://seller.example/reviews" && metaOf(riskyOut)["risk.income-claims:evidence:e2.pageCategory"] === "REVIEWS" && metaOf(riskyOut)["risk.medical-claims:landing_page:hero"] === "MEDICAL_CLAIMS|medical-claims@1.0.0|section:hero|cures" && metaOf(riskyOut).riskCount === 6 && metaOf(riskyOut).riskIds === riskyResult.identifiedRisks.map((r) => r.id).join());
  check("a landing page risk has no source URL, so none is invented", riskyResult.identifiedRisks.find((x) => x.id === "medical-claims:landing_page:hero")!.source.sourceUrl === null && !("risk.medical-claims:landing_page:hero.sourceUrl" in metaOf(riskyOut)));
  check("the supplied text is never copied into the result", !JSON.stringify(riskyResult).includes(SECRET) && !JSON.stringify(riskyOut).toLowerCase().includes(SECRET.toLowerCase()) && !JSON.stringify(riskyResult).includes("eye strain"));
  check("each risky dimension is RISK_IDENTIFIED and the others are not", ["MEDICAL_CLAIMS", "WEIGHT_LOSS_CLAIMS", "INCOME_CLAIMS", "GUARANTEE_LANGUAGE", "URGENCY_LANGUAGE", "SCARCITY_LANGUAGE"].every((d) => metaOf(riskyOut)[`dimension.${d}`] === "RISK_IDENTIFIED" && metaOf(riskyOut)[`riskCount.${d}`] === 1) && ["BEFORE_AFTER_REFERENCES", "FINANCIAL_CLAIMS", "TESTIMONIALS", "RESTRICTED_CATEGORIES", "DESTINATION_QUALITY", "TRANSPARENCY_SIGNALS"].every((d) => metaOf(riskyOut)[`dimension.${d}`] === "NONE_IDENTIFIED"));
  check("risks that call for a disclaimer, when the page has none, list it as a missing safeguard", riskyResult.missingSafeguards.length === 1 && riskyResult.missingSafeguards[0].safeguard === "DISCLAIMER" && riskyResult.missingSafeguards[0].dimension === "COMPLIANCE_DISCLAIMERS" && riskyResult.missingSafeguards[0].basis === "STRUCTURE" && same(riskyResult.missingSafeguards[0].requiredBy, ["income-claims:evidence:e2", "medical-claims:landing_page:hero", "weight-loss-claims:landing_page:hero"]) && metaOf(riskyOut)["dimension.COMPLIANCE_DISCLAIMERS"] === "SAFEGUARD_MISSING" && metaOf(riskyOut)["missingSafeguard.DISCLAIMER"] === "COMPLIANCE_DISCLAIMERS|STRUCTURE|income-claims:evidence:e2+medical-claims:landing_page:hero+weight-loss-claims:landing_page:hero");
  check("a risk is not a failure: the status is still COMPLETED, nothing is blocked, and confidence reflects coverage", riskyOut.status === "COMPLETED" && riskyOut.errors.length === 0 && riskyOut.confidence === 1);
  check("a safeguard shown by an Opportunity dimension is not missing: return terms are present", metaOf(riskyOut)["safeguard.RETURN_TERMS"] === "PRESENT" && !listOf(riskyOut, "missingSafeguards").includes("RETURN_TERMS"));

  // ---------- disclaimers ----------
  const disclaimedByPhrase = run(withContent(RISKY({ hero: ["This lamp cures eye strain.", "Results may vary."] })), base.context);
  check("a disclaimer phrase on the page provides the disclaimer", metaOf(disclaimedByPhrase)["safeguard.DISCLAIMER"] === "PRESENT" && metaOf(disclaimedByPhrase).missingSafeguardCount === 0 && metaOf(disclaimedByPhrase)["dimension.COMPLIANCE_DISCLAIMERS"] === "NONE_IDENTIFIED" && metaOf(disclaimedByPhrase)["dimension.MEDICAL_CLAIMS"] === "RISK_IDENTIFIED");
  const disclaimedBySection = run(withContent(RISKY({ extraSections: [section("fp", "disclaimer", ["Fine print."])] })), base.context);
  check("a visible disclaimer section provides the disclaimer", metaOf(disclaimedBySection)["safeguard.DISCLAIMER"] === "PRESENT" && metaOf(disclaimedBySection).missingSafeguardCount === 0);
  const hiddenDisclaimer = run(withContent(RISKY({ extraSections: [section("fp", "disclaimer", ["Fine print."], { visible: false })] })), base.context);
  check("a hidden disclaimer section is not on the page and provides nothing", metaOf(hiddenDisclaimer)["safeguard.DISCLAIMER"] === "ABSENT" && metaOf(hiddenDisclaimer).missingSafeguardCount === 1);
  const evidenceOnlyDisclaimer = run(withContent(RISKY({ evidence: [evidenceItem("e9", "Results may vary. Hurry.")] })), base.context);
  check("a disclaimer phrase in source evidence does not show one is on the page", metaOf(evidenceOnlyDisclaimer)["safeguard.DISCLAIMER"] === "ABSENT" && metaOf(evidenceOnlyDisclaimer)["dimension.COMPLIANCE_DISCLAIMERS"] === "SAFEGUARD_MISSING");
  const noPage = run(withContent(content({ evidenceContext: { items: [evidenceItem("e1", "This lamp cures eye strain.")] } })), base.context);
  check("with no Landing Page Structure, an absent disclaimer cannot be established, so it is unknown and not missing", metaOf(noPage)["safeguard.DISCLAIMER"] === "UNKNOWN" && metaOf(noPage).missingSafeguardCount === 0 && metaOf(noPage)["dimension.MEDICAL_CLAIMS"] === "RISK_IDENTIFIED" && metaOf(noPage)["dimension.COMPLIANCE_DISCLAIMERS"] === "NOT_ASSESSED" && noPage.warnings.some((w) => /No Landing Page Structure/.test(w)) && noPage.warnings.some((w) => /could not be established, so not treated as missing: DISCLAIMER/.test(w)));

  // ---------- the Landing Page Structure ----------
  const hidden = run(withContent(RISKY({ extraSections: [section("x", "testimonials", ["Lose weight, said a customer"], { visible: false })] })), base.context);
  check("a hidden section is not read: no risk comes from it and it is not counted", !listOf(hidden, "riskIds").some((id) => /testimonials|:landing_page:x/.test(id)) && metaOf(hidden).pageSectionCount === 2);
  const testimonialSection = run(withContent(content({ landingPage: { sections: [section("hero", "hero", ["A lamp."]), section("t1", "testimonials", ["Great lamp"])] } })), base.context);
  check("a visible section of a risky kind is itself a risk, with no text match needed", metaOf(testimonialSection)["dimension.TESTIMONIALS"] === "RISK_IDENTIFIED" && metaOf(testimonialSection).riskIds === "testimonials:landing_page:t1" && metaOf(testimonialSection)["risk.testimonials:landing_page:t1"] === "TESTIMONIALS|testimonials@1.0.0|section:t1|section:testimonials");
  const testimonialBoth = analyzePolicyRisk({ opportunityAnalysis: base.context.opportunityAnalysis!, opportunityExplanation: base.context.opportunityExplanation, executionMetadata: {}, rules: createDefaultPolicyRuleRegistry().list(), safeguardSources: DEFAULT_SAFEGUARD_SOURCES, content: content({ landingPage: { sections: [section("t1", "testimonials", ["Real customers love it"])] } }) }, zero);
  check("a section that is both a risky kind and uses risky words is one risk, with both bases", testimonialBoth.identifiedRisks.length === 1 && testimonialBoth.identifiedRisks[0].basis === "BOTH" && testimonialBoth.identifiedRisks[0].matched.join() === "real customers,section:testimonials");
  const beforeAfterSection = run(withContent(content({ landingPage: { sections: [section("b1", "before-after", ["Two photos"])] } })), base.context);
  check("a before-and-after section is identified by kind", metaOf(beforeAfterSection)["dimension.BEFORE_AFTER_REFERENCES"] === "RISK_IDENTIFIED");
  const lpOnly = run(withContent(content({ landingPage: { sections: [section("hero", "hero", ["A lamp."])] } })), base.context);
  check("with no Evidence Context, a warning says so", lpOnly.warnings.some((w) => /No Evidence Context/.test(w)) && metaOf(lpOnly).evidenceItemCount === 0);

  // ---------- matching ----------
  const phrases = (texts: string[]) => run(withContent(content({ landingPage: { sections: [section("hero", "hero", texts)] } })), base.context);
  check("matching is case-insensitive, whole-word, and ignores line breaks and repeated spaces", metaOf(phrases(["CURE it"]))["dimension.MEDICAL_CLAIMS"] === "RISK_IDENTIFIED" && metaOf(phrases(["Weight\n   loss starts here"]))["dimension.WEIGHT_LOSS_CLAIMS"] === "RISK_IDENTIFIED" && metaOf(phrases(["A secure and accurate lamp"]))["dimension.MEDICAL_CLAIMS"] === "NONE_IDENTIFIED" && metaOf(phrases(["Hurry!"]))["dimension.URGENCY_LANGUAGE"] === "RISK_IDENTIFIED" && metaOf(phrases(["Hurrying along"]))["dimension.URGENCY_LANGUAGE"] === "NONE_IDENTIFIED");
  check("curly apostrophes match straight ones in a phrase", metaOf(phrases(["Don\u2019t wait"]))["dimension.URGENCY_LANGUAGE"] === "RISK_IDENTIFIED");
  check("matching is lexical: a negated phrase still matches, which is why a result says potential risk", metaOf(phrases(["This does not cure anything"]))["dimension.MEDICAL_CLAIMS"] === "RISK_IDENTIFIED");
  check("restricted categories, financial claims, and before-and-after wording are identified", metaOf(phrases(["prescription strength"]))["dimension.RESTRICTED_CATEGORIES"] === "RISK_IDENTIFIED" && metaOf(phrases(["passive income"]))["dimension.FINANCIAL_CLAIMS"] === "RISK_IDENTIFIED" && metaOf(phrases(["Before and after"]))["dimension.BEFORE_AFTER_REFERENCES"] === "RISK_IDENTIFIED" && metaOf(phrases(["verified buyer"]))["dimension.TESTIMONIALS"] === "RISK_IDENTIFIED");
  check("a risk with no required safeguard (urgency, scarcity, restricted) lists none as missing", metaOf(phrases(["Hurry, limited stock, tobacco"])).missingSafeguardCount === 0);

  // ---------- manual overrides: effective values only ----------
  const overridden = run(withContent(RISKY({ evidence: [evidenceItem("e3", "This lamp cures everything", { field: "headline" })], overrides: [{ field: "headline", value: "A tidy lamp" }] })), base.context);
  check("an effective override supersedes the item that states the same field", !listOf(overridden, "riskIds").some((id) => /evidence:e3/.test(id)) && metaOf(overridden).supersededCount === 1 && overridden.warnings.some((w) => /superseded by an effective manual override/.test(w)));
  const notOverridden = run(withContent(RISKY({ evidence: [evidenceItem("e3", "This lamp cures everything", { field: "headline" })] })), base.context);
  check("without the override the same item is read", listOf(notOverridden, "riskIds").includes("medical-claims:evidence:e3"));
  const overrideRisk = run(withContent(RISKY({ overrides: [{ field: "tagline", value: "Lose weight fast" }] })), base.context);
  check("an override's effective value is read, with its own source kind and location", listOf(overrideRisk, "riskIds").includes("weight-loss-claims:override:tagline") && metaOf(overrideRisk)["risk.weight-loss-claims:override:tagline"] === "WEIGHT_LOSS_CLAIMS|weight-loss-claims@1.0.0|override:tagline|lose weight" && metaOf(overrideRisk).overrideCount === 1);
  const overrideNonText = run(withContent(RISKY({ overrides: [{ field: "count", value: 5 }] })), base.context);
  check("an override whose value is not text is ignored, with a warning", metaOf(overrideNonText).overrideCount === 0 && overrideNonText.warnings.some((w) => /not text and was not read/.test(w)));
  const overrideLp = run(withContent(content({ landingPage: { sections: [section("hero", "hero", ["Lose weight"], { field: "hero" })] }, manualOverrides: [{ field: "hero", value: "A lamp." }] })), base.context);
  check("an override supersedes a landing-page section that states the same field", !listOf(overrideLp, "riskIds").some((id) => /weight/.test(id)) && metaOf(overrideLp).supersededCount === 1);
  check("an override carries no provenance beyond its field", overrideRisk.metadata["risk.weight-loss-claims:override:tagline.sourceUrl"] === undefined);

  // ---------- safeguards from the Opportunity dimensions ----------
  const noReturns = await scenario({ states: { RETURNS: "MISSING" } });
  const noReturnsOut = run(policySignalWith(), noReturns.context);
  check("a safeguard reported missing by the Opportunity Engine is listed, with the basis OPPORTUNITY", noReturnsOut.metadata.missingSafeguards === "RETURN_TERMS" && metaOf(noReturnsOut)["missingSafeguard.RETURN_TERMS"] === "TRANSPARENCY_SIGNALS|OPPORTUNITY|transparency-signals" && metaOf(noReturnsOut)["dimension.TRANSPARENCY_SIGNALS"] === "SAFEGUARD_MISSING");
  const lpNoTerms = run(withContent(content({ landingPage: { sections: [section("hero", "hero", ["A lamp."])] } })), noReturns.context);
  check("reported missing and absent from the page structure: the basis is BOTH", metaOf(lpNoTerms)["missingSafeguard.RETURN_TERMS"] === "TRANSPARENCY_SIGNALS|BOTH|transparency-signals");
  const lpWithTerms = run(withContent(content({ landingPage: { sections: [section("terms", "guarantee", ["Return terms."])] } })), noReturns.context);
  check("a visible section that carries the safeguard shows it present, even when the dimension is reported missing", metaOf(lpWithTerms)["safeguard.RETURN_TERMS"] === "PRESENT" && metaOf(lpWithTerms).missingSafeguardCount === 0);
  const lpStructureOnly = run(withContent(content({ landingPage: { sections: [section("hero", "hero", ["A lamp."])] } })), base.context);
  check("a safeguard shown strong by the Opportunity Engine is present even when the page structure has no section for it", metaOf(lpStructureOnly)["safeguard.PRICING_DISCLOSURE"] === "PRESENT" && metaOf(lpStructureOnly).missingSafeguardCount === 0);
  const noManufacturer = await scenario({ states: { MANUFACTURER: null } });
  const noManufacturerOut = run(policySignalWith(), noManufacturer.context);
  check("a safeguard nothing reported on is UNKNOWN, never missing, and the dimension is NOT_ASSESSED", metaOf(noManufacturerOut)["safeguard.MANUFACTURER_IDENTITY"] === "UNKNOWN" && metaOf(noManufacturerOut).missingSafeguardCount === 0 && metaOf(noManufacturerOut)["dimension.TRANSPARENCY_SIGNALS"] === "NOT_ASSESSED" && noManufacturerOut.warnings.some((w) => /could not be established, so not treated as missing: MANUFACTURER_IDENTITY/.test(w)));
  const weakPricing = await scenario({ states: { PRICING: "WEAK" } });
  const weakPricingOut = run(policySignalWith(), weakPricing.context);
  check("a safeguard reported weak is partly evidenced: it is not missing, and a warning says so", metaOf(weakPricingOut)["safeguard.PRICING_DISCLOSURE"] === "PARTIAL" && metaOf(weakPricingOut).missingSafeguardCount === 0 && metaOf(weakPricingOut)["dimension.TRANSPARENCY_SIGNALS"] === "NONE_IDENTIFIED" && weakPricingOut.warnings.some((w) => /partly evidenced, so treated as present: PRICING_DISCLOSURE/.test(w)));
  const noPageReady = await scenario({ states: { PRESENTATION_READINESS: "MISSING" } });
  const noPageReadyOut = run(policySignalWith(), noPageReady.context);
  check("destination quality reports a missing page-readiness safeguard", metaOf(noPageReadyOut)["dimension.DESTINATION_QUALITY"] === "SAFEGUARD_MISSING" && metaOf(noPageReadyOut)["missingSafeguard.PAGE_READINESS"] === "DESTINATION_QUALITY|OPPORTUNITY|destination-quality");
  const failedEvidence = await scenario({ mutate: (analysis) => { (analysis.signalResults as Array<{ signalId: string; status: string }>).find((r) => r.signalId === "evid")!.status = "FAILED"; } });
  const failedOut = run(policySignalWith(), failedEvidence.context);
  check("dimensions of a signal that did not complete are not read", metaOf(failedOut)["safeguard.PRICING_DISCLOSURE"] === "UNKNOWN" && metaOf(failedOut)["safeguard.PAGE_READINESS"] === "PRESENT" && metaOf(failedOut)["dimension.TRANSPARENCY_SIGNALS"] === "NOT_ASSESSED");
  const noExplanation = await scenario({ explain: false });
  const noExOut = run(withContent(CLEAN()), noExplanation.context);
  check("without an explanation, safeguards come from the page structure only, with a warning", noExOut.status === "COMPLETED" && noExOut.warnings.some((w) => /No Opportunity explanation/.test(w)) && metaOf(noExOut).explanationSupplied === false && metaOf(noExOut)["safeguard.RETURN_TERMS"] === "PRESENT" && metaOf(noExOut)["safeguard.PAGE_READINESS"] === "UNKNOWN" && metaOf(noExOut)["dimension.DESTINATION_QUALITY"] === "NOT_ASSESSED");
  const partialAnalysis = await scenario({ mutate: (analysis) => { analysis.status = "PARTIAL"; } });
  const partialOut = run(policySignalWith(), partialAnalysis.context);
  check("a PARTIAL Opportunity analysis can be read, and says so", partialOut.status === "COMPLETED" && partialOut.warnings.some((w) => /PARTIAL/.test(w)) && metaOf(partialOut).opportunityStatus === "PARTIAL");

  // ---------- enabling, disabling, and custom rules ----------
  const live = createDefaultPolicyRuleRegistry();
  const liveSignal = withContent(RISKY(), { registry: live });
  const liveBefore = run(liveSignal, base.context);
  live.disable("medical-claims");
  const liveDisabled = run(liveSignal, base.context);
  check("Disable Rule: a disabled rule identifies nothing, its dimension is NOT_ASSESSED, and a warning says so", !listOf(liveDisabled, "riskIds").includes("medical-claims:landing_page:hero") && metaOf(liveDisabled)["dimension.MEDICAL_CLAIMS"] === "NOT_ASSESSED" && liveDisabled.warnings.some((w) => /No enabled rule covers "MEDICAL_CLAIMS"/.test(w)) && !("rule.medical-claims" in metaOf(liveDisabled)) && metaOf(liveDisabled).enabledRuleCount === 12);
  check("Disable Rule: the dimension no longer counts as applicable, so confidence is the share of the rest", metaOf(liveDisabled).applicableCount === 12 && liveDisabled.confidence === 1);
  live.enable("medical-claims");
  check("Enable Rule: the same signal applies the rule again, with no re-registration", stable(run(liveSignal, base.context)) === stable(liveBefore));
  const custom = createPolicyRuleRegistry([zetaRule()]);
  const zetaContent = content({ landingPage: { sections: [section("hero", "hero", ["A zeta flash sale"])] } });
  const customOut = run(withContent(zetaContent, { registry: custom }), base.context);
  check("a fictional rule works through the same engine, with no change to the code", customOut.status === "COMPLETED" && metaOf(customOut).riskIds === "zeta-urgency:landing_page:hero" && metaOf(customOut)["risk.zeta-urgency:landing_page:hero"] === "URGENCY_LANGUAGE|zeta-urgency@1.0.0|section:hero|zeta flash" && metaOf(customOut).applicableCount === 1 && metaOf(customOut).assessedCount === 1 && customOut.confidence === 1);
  custom.revise(zetaRule({ version: "1.1.0", indicators: ["zeta flash", "omega"] }));
  const revisedOut = run(withContent(zetaContent, { registry: custom }), base.context);
  check("Version Rule: a revised rule is reported with its new version", metaOf(revisedOut)["risk.zeta-urgency:landing_page:hero"] === "URGENCY_LANGUAGE|zeta-urgency@1.1.0|section:hero|zeta flash" && metaOf(revisedOut)["rule.zeta-urgency"] === "1.1.0");
  const emptyRegistry = run(withContent(CLEAN(), { registry: createPolicyRuleRegistry() }), base.context);
  check("with no rules at all nothing is assessed: no risks, no confidence, and every dimension is explained", emptyRegistry.status === "COMPLETED" && emptyRegistry.confidence === null && metaOf(emptyRegistry).riskCount === 0 && emptyRegistry.warnings.filter((w) => /No enabled rule covers/.test(w)).length === 13);
  const customScenario = await scenario({ states: { PRICING: "MISSING", CUSTOM_DIMENSION: "STRONG" } });
  const transparencyOnly = () => createPolicyRuleRegistry([DEFAULT_POLICY_RULES.find((r) => r.id === "transparency-signals")]);
  const defaultSources = run(policySignalWith({ registry: transparencyOnly() }), customScenario.context);
  const customSourcesOut = run(policySignalWith({ registry: transparencyOnly(), safeguardSources: { ...DEFAULT_SAFEGUARD_SOURCES, PRICING_DISCLOSURE: { opportunityDimensions: ["CUSTOM_DIMENSION"], sectionKinds: [] } } }), customScenario.context);
  check("the safeguard sources are data: another dimension name can show a safeguard", metaOf(defaultSources)["safeguard.PRICING_DISCLOSURE"] === "ABSENT" && customSourcesOut.status === "COMPLETED" && metaOf(customSourcesOut)["safeguard.PRICING_DISCLOSURE"] === "PRESENT" && metaOf(customSourcesOut)["dimension.TRANSPARENCY_SIGNALS"] === "NONE_IDENTIFIED");
  check("a rule that is only a check, with a disabled twin, still works", (() => { const r = createDefaultPolicyRuleRegistry(); for (const e of r.list()) if (e.id !== "destination-quality") r.disable(e.id); const out = run(withContent(null, { registry: r }), base.context); return out.confidence === 1 && metaOf(out).applicableCount === 1 && metaOf(out)["dimension.DESTINATION_QUALITY"] === "NONE_IDENTIFIED"; })());

  // ---------- rejections ----------
  const noAnalysis = createTrafficSignalContext({ candidate });
  check("Missing Context: the signal does not support an analysis it does not have", signal.supportsAnalysis(noAnalysis) === false);
  check("Missing Context: the validator rejects a missing context and a missing analysis", has(validatePolicyRiskContext(null), /Missing context/) && has(validatePolicyRiskContext(undefined), /Missing context/) && has(validatePolicyRiskContext("x"), /Missing context/) && has(validatePolicyRiskContext({ ...base.context, opportunityAnalysis: null }), /Missing context: an Opportunity analysis/) && has(signal.validate(noAnalysis), /Missing context/));
  const forced = run(signal, noAnalysis);
  check("Missing Context: analyze FAILS with the reason, no risks, and no metadata", forced.status === "FAILED" && forced.errors.some((e) => /Missing context/.test(e)) && forced.confidence === null && Object.keys(forced.metadata).length === 0);
  const skipped = await (async () => { const p = createTrafficSignalPipeline({ now: zero }); registerPolicyRiskSignal(p, { now: zero }); return p.run(noAnalysis); })();
  check("Missing Context: in a pipeline the signal is SKIPPED", skipped.results.length === 1 && skipped.results[0].status === "SKIPPED");
  check("Missing Context: an empty object is rejected too", validatePolicyRiskContext({}).length > 0);
  check("Invalid Context: an analysis that failed or was refused cannot be read", ["FAILED", "REFUSED"].every((status) => has(validatePolicyRiskContext({ ...base.context, opportunityAnalysis: { ...base.context.opportunityAnalysis, status } }), /only a COMPLETED or PARTIAL analysis can be read/)));
  const failedAnalysis = await scenario({ mutate: (analysis) => { analysis.status = "FAILED"; } });
  check("Invalid Context: analyze FAILS for an analysis that did not complete", run(signal, failedAnalysis.context).status === "FAILED" && run(signal, failedAnalysis.context).errors.some((e) => /FAILED/.test(e)));
  check("Invalid Context: an analysis without its result list and an explanation without its lists are rejected", has(validatePolicyRiskContext({ ...base.context, opportunityAnalysis: { ...base.context.opportunityAnalysis, signalResults: "x" } }), /signalResults/) && has(validatePolicyRiskContext({ ...base.context, opportunityExplanation: { ...base.context.opportunityExplanation, strengths: undefined } }), /strengths/));
  check("Invalid Context: a conflicting candidate reference is rejected by the context", validatePolicyRiskContext({ ...base.context, candidate: { ...candidate, id: "cand-2" } }).length > 0);
  check("Invalid Metadata: nested configuration in a context is rejected", has(validatePolicyRiskContext({ ...base.context, configuration: { a: [1] } }), /Invalid metadata/));

  const fakeEntry = { id: "medical-claims", rule: DEFAULT_POLICY_RULES[0], enabled: true, version: "1.0.0" };
  const dupRegistry = { ...createDefaultPolicyRuleRegistry(), list: () => [fakeEntry, fakeEntry] } as never;
  const dupOut = run(policySignalWith({ registry: dupRegistry }), base.context);
  check("Duplicate Rule: the signal FAILS if its registry lists a rule twice", dupOut.status === "FAILED" && dupOut.errors.some((e) => /Duplicate rule "medical-claims"/.test(e)) && has(policySignalWith({ registry: dupRegistry }).validate(base.context), /Duplicate rule/));
  const badRegistry = { ...createDefaultPolicyRuleRegistry(), list: () => [{ ...fakeEntry, rule: { ...DEFAULT_POLICY_RULES[0], version: "x", score: 3 } }] } as never;
  const badRuleOut = run(policySignalWith({ registry: badRegistry }), base.context);
  check("Invalid Rule: the signal FAILS if its registry holds an invalid rule", badRuleOut.status === "FAILED" && badRuleOut.errors.some((e) => /semantic version/.test(e)) && badRuleOut.errors.some((e) => /unexpected field "score"/.test(e)));
  const badSources = run(policySignalWith({ safeguardSources: { ...DEFAULT_SAFEGUARD_SOURCES, DISCLAIMER: undefined } as never }), base.context);
  check("the signal FAILS for invalid safeguard sources", badSources.status === "FAILED" && badSources.errors.some((e) => /DISCLAIMER/.test(e)));

  const goodInputs = (over: Record<string, unknown>) => validatePolicyRiskInputs({ evidenceContext: null, landingPage: null, manualOverrides: null, ...over });
  check("content: none is valid, and a complete one is valid", validatePolicyRiskInputs(null).length === 0 && validatePolicyRiskInputs(CLEAN()).length === 0 && validatePolicyRiskInputs(RISKY()).length === 0);
  check("Invalid Metadata: content that is not plain data is rejected", has(validatePolicyRiskInputs("x"), /must be plain data/) && has(validatePolicyRiskInputs({ evidenceContext: null, landingPage: null, manualOverrides: null, extra: () => 0 }), /must be plain data/) && has(validatePolicyRiskInputs({ evidenceContext: null, landingPage: null, manualOverrides: undefined }), /./));
  check("content: every member must be present, with null for none", has(validatePolicyRiskInputs({}), /"evidenceContext" is missing/) && has(validatePolicyRiskInputs({}), /"landingPage" is missing/) && has(validatePolicyRiskInputs({}), /"manualOverrides" is missing/));
  check("content: evidence items need an id, text, and explicit provenance", has(goodInputs({ evidenceContext: { items: [{ id: "", text: "x", sourceUrl: null, pageCategory: null }] } }), /id must be non-empty/) && has(goodInputs({ evidenceContext: { items: [{ id: "a", text: 5, sourceUrl: null, pageCategory: null }] } }), /text must be text/) && has(goodInputs({ evidenceContext: { items: [{ id: "a", text: "x", pageCategory: null }] } }), /sourceUrl must be text or null, so that provenance is kept/) && has(goodInputs({ evidenceContext: { items: [{ id: "a", text: "x", sourceUrl: null }] } }), /pageCategory must be text or null/) && has(goodInputs({ evidenceContext: { items: [{ id: "a", text: "x", sourceUrl: null, pageCategory: null, field: 5 }] } }), /field must be/) && has(goodInputs({ evidenceContext: [] }), /must carry a list of items/));
  check("content: duplicate item and section ids are rejected", has(goodInputs({ evidenceContext: { items: [evidenceItem("a", "x"), evidenceItem("a", "y")] } }), /duplicate item id "a"/) && has(goodInputs({ landingPage: { sections: [section("a", "hero", []), section("a", "faq", [])] } }), /duplicate section id "a"/));
  check("content: sections need an id, a kind, visibility, and texts", has(goodInputs({ landingPage: { sections: [section("a", "bad kind", [])] } }), /kind must be/) && has(goodInputs({ landingPage: { sections: [section("a", "hero", [], { visible: "yes" })] } }), /visible must be/) && has(goodInputs({ landingPage: { sections: [section("a", "hero", ["x", 5] as never)] } }), /texts must be a list of text/) && has(goodInputs({ landingPage: [] }), /must carry a list of sections/));
  check("content: overrides carry effective values only, never ids, timestamps, or previous values", has(goodInputs({ manualOverrides: [{ field: "a", value: "x", id: 7 }] }), /unexpected field "id"/) && has(goodInputs({ manualOverrides: [{ field: "a", value: "x", previousValue: "y" }] }), /unexpected field "previousValue"/) && has(goodInputs({ manualOverrides: [{ field: "a", value: "x", updatedAt: "t" }] }), /unexpected field "updatedAt"/) && has(goodInputs({ manualOverrides: [{ field: "a" }] }), /value is missing/) && has(goodInputs({ manualOverrides: [{ field: "a", value: "x" }, { field: "a", value: "y" }] }), /duplicate override for "a"/) && has(goodInputs({ manualOverrides: "x" }), /list of effective values/));
  const badProvider = run(policySignalWith({ content: () => ({ evidenceContext: { items: [{ id: "", text: "x", sourceUrl: null, pageCategory: null }] }, landingPage: null, manualOverrides: null }) }), base.context);
  check("Invalid content from the provider makes the signal FAIL with the reasons", badProvider.status === "FAILED" && badProvider.errors.some((e) => /Invalid content/.test(e)));
  const throwingProvider = run(policySignalWith({ content: () => { throw new Error("provider exploded"); } }), base.context);
  check("a provider that throws makes the signal FAIL, never a guess", throwingProvider.status === "FAILED" && throwingProvider.errors.some((e) => /provider exploded/.test(e)));
  check("a provider that returns null means no content", run(withContent(null), base.context).metadata.contentSupplied === false);

  // ---------- result validation: no score, approval, or recommendation ----------
  check("a real result passes its validator", validatePolicyRiskResult(riskyResult).length === 0 && validatePolicyRiskResult(analyzePolicyRisk({ opportunityAnalysis: base.context.opportunityAnalysis!, opportunityExplanation: null, executionMetadata: {}, rules: [], safeguardSources: DEFAULT_SAFEGUARD_SOURCES, content: null }, zero)).length === 0);
  check("the result keys are exactly the specified ones", same(Object.keys(riskyResult).sort(), [...POLICY_RESULT_KEYS].sort()));
  check("a result with a score, approval, severity, recommendation, or block is rejected", ["score", "approved", "approval", "severity", "riskLevel", "recommendation", "blocked", "decision"].every((field) => has(validatePolicyRiskResult({ ...riskyResult, [field]: 1 }), new RegExp(`unexpected field "${field}"`))));
  check("a risk with a score or severity is rejected", ["score", "severity", "decision", "weight"].every((field) => has(validatePolicyRiskResult({ ...riskyResult, identifiedRisks: [{ ...riskyResult.identifiedRisks[0], [field]: 1 }] }), new RegExp(`unexpected field "${field}"`))));
  check("a result missing a field is rejected", POLICY_RESULT_KEYS.every((key) => { const { [key]: _removed, ...rest } = riskyResult as unknown as Record<string, unknown>; return has(validatePolicyRiskResult(rest), new RegExp(`"${key}" is missing`)); }));
  check("Duplicate Risk: a risk listed twice is rejected", has(validatePolicyRiskResult({ ...riskyResult, identifiedRisks: [riskyResult.identifiedRisks[0], riskyResult.identifiedRisks[0]] }), /Duplicate risk "guarantee-language:landing_page:hero"/));
  check("Duplicate Risk: a missing safeguard listed twice is rejected", has(validatePolicyRiskResult({ ...riskyResult, missingSafeguards: [riskyResult.missingSafeguards[0], riskyResult.missingSafeguards[0]] }), /Duplicate risk entry for safeguard "DISCLAIMER"/));
  check("an unsorted list is rejected, so that order implies no ranking", has(validatePolicyRiskResult({ ...riskyResult, identifiedRisks: [...riskyResult.identifiedRisks].reverse() }), /must be sorted by id/) && has(validatePolicyRiskResult({ ...riskyResult, missingSafeguards: [{ ...riskyResult.missingSafeguards[0], requiredBy: ["b", "a"] }] }), /requiredBy must be sorted/));
  check("risk fields are checked: provenance, kinds, and versions", has(validatePolicyRiskResult({ ...riskyResult, identifiedRisks: [{ ...riskyResult.identifiedRisks[0], source: null }] }), /provenance is kept/) && has(validatePolicyRiskResult({ ...riskyResult, identifiedRisks: [{ ...riskyResult.identifiedRisks[0], source: { ...riskyResult.identifiedRisks[0].source, sourceUrl: undefined } }] }), /sourceUrl must be text or null/) && has(validatePolicyRiskResult({ ...riskyResult, identifiedRisks: [{ ...riskyResult.identifiedRisks[0], ruleVersion: "x" }] }), /ruleVersion/) && has(validatePolicyRiskResult({ ...riskyResult, identifiedRisks: [{ ...riskyResult.identifiedRisks[0], dimension: "NOPE" }] }), /dimension is not supported/) && has(validatePolicyRiskResult({ ...riskyResult, identifiedRisks: [{ ...riskyResult.identifiedRisks[0], basis: "X" }] }), /basis is not supported/));
  check("missing safeguards must name their own dimension and what called for them", has(validatePolicyRiskResult({ ...riskyResult, missingSafeguards: [{ ...riskyResult.missingSafeguards[0], dimension: "MEDICAL_CLAIMS" }] }), /safeguard's own dimension/) && has(validatePolicyRiskResult({ ...riskyResult, missingSafeguards: [{ ...riskyResult.missingSafeguards[0], requiredBy: [] }] }), /requiredBy must be a non-empty list/));
  check("result values are checked", has(validatePolicyRiskResult({ ...riskyResult, status: "DONE" }), /status is not supported/) && has(validatePolicyRiskResult({ ...riskyResult, confidence: 2 }), /confidence must be/) && has(validatePolicyRiskResult({ ...riskyResult, confidence: Number.NaN }), /confidence must be/) && validatePolicyRiskResult({ ...riskyResult, confidence: null }).length === 0 && has(validatePolicyRiskResult({ ...riskyResult, executionTime: -1 }), /executionTime/) && has(validatePolicyRiskResult({ ...riskyResult, warnings: [1] }), /warnings/) && has(validatePolicyRiskResult(null), /object is required/));
  check("Invalid Metadata: a result with nested metadata is rejected", has(validatePolicyRiskResult({ ...riskyResult, metadata: { a: { b: 1 } } }), /Invalid metadata/));
  const output = policyRiskToSignalOutput(riskyResult);
  check("the signal output is exactly status, confidence, metadata, warnings, and errors, with flat metadata", same(Object.keys(output).sort(), ["confidence", "errors", "metadata", "status", "warnings"]) && output.errors.length === 0 && validateTrafficSignalOutput(output).length === 0 && stable(output.metadata) === stable(riskyResult.metadata));
  check("no metadata key names a score, severity, approval, block, recommendation, weight, or rank", Object.keys(metaOf(riskyOut)).every((k) => !/score|severity|approv|block|recommend|weight|\brank/i.test(k.replace(/WEIGHT_LOSS_CLAIMS|weight-loss-claims/g, ""))));
  check("the lists are sorted by id, whatever the order of the rules", same(riskyResult.identifiedRisks.map((r) => r.id), [...riskyResult.identifiedRisks.map((r) => r.id)].sort()) && stable(analyzePolicyRisk({ opportunityAnalysis: base.context.opportunityAnalysis!, opportunityExplanation: base.context.opportunityExplanation, executionMetadata: {}, rules: [...createDefaultPolicyRuleRegistry().list()].reverse(), safeguardSources: DEFAULT_SAFEGUARD_SOURCES, content: RISKY() }, zero)) === stable(riskyResult));

  // ---------- determinism, time, independence ----------
  check("the same context and content give the same output", stable(run(withContent(RISKY()), base.context)) === stable(riskyOut) && stable(run(withContent(RISKY()), base.context)) === stable(run(withContent(RISKY()), base.context)));
  const clockInputs = { opportunityAnalysis: base.context.opportunityAnalysis!, opportunityExplanation: null, executionMetadata: {}, rules: [], safeguardSources: DEFAULT_SAFEGUARD_SOURCES, content: null };
  check("executionTime comes from the injected clock, and a bad clock reports zero", analyzePolicyRisk(clockInputs, tick()).executionTime === 1 && analyzePolicyRisk(clockInputs, () => Number.NaN).executionTime === 0 && (() => { let t = 10; return analyzePolicyRisk(clockInputs, () => (t -= 1)).executionTime === 0; })() && analyzePolicyRisk(clockInputs).executionTime >= 0 && createPolicyRiskSignal().analyze(base.context, {} as never).status === "COMPLETED");
  const withUpstream = signal.analyze(base.context, { "other-signal": { signalId: "other-signal", status: "COMPLETED", confidence: 1, metadata: { x: 1 }, warnings: [], errors: [], executionTime: 0 } } as never);
  check("independent execution: the output does not depend on any other signal", stable(withUpstream) === stable(bare));

  // ---------- run beside other signals ----------
  const calls: string[] = [];
  const sibling = (id: string, over: Partial<TrafficSignalModule> = {}): TrafficSignalModule => ({
    id,
    name: `Sibling ${id}`,
    version: "1.0.0",
    category: "FUTURE",
    enabled: true,
    priority: 100,
    dependencies: { requires: [], optional: [], conflicts: [] },
    supportsAnalysis: () => true,
    validate: () => [],
    analyze: () => {
      calls.push(id);
      return { status: "COMPLETED", confidence: null, metadata: { sibling: id }, warnings: [], errors: [] };
    },
    ...over,
  });
  let providerCalls = 0;
  const counted = withContent(RISKY(), {});
  const together = createTrafficSignalPipeline({ now: zero });
  together.register(sibling("zeta-sibling"));
  registerPolicyRiskSignal(together, { now: zero, content: () => { providerCalls += 1; return RISKY(); } });
  registerChannelSuitabilitySignal(together, { now: zero });
  together.register(sibling("broken-sibling", { analyze: () => { throw new Error("sibling exploded"); }, priority: 85 }));
  const togetherRun = await together.run(base.context);
  const own = togetherRun.results.find((r) => r.signalId === "policy-risk")!;
  const channel = togetherRun.results.find((r) => r.signalId === "channel-suitability")!;
  check("it runs sequentially beside the Channel Suitability Signal and others, in priority order", togetherRun.order.join() === "zeta-sibling,channel-suitability,broken-sibling,policy-risk" && togetherRun.results.length === 4);
  check("Channel Suitability regression: both signals COMPLETE and neither changes the other's output", own.status === "COMPLETED" && channel.status === "COMPLETED" && sameOutput(channel, run(createChannelSuitabilitySignal({ now: zero }), base.context)) && sameOutput(own, riskyOut));
  check("a sibling that throws does not change this signal's output", togetherRun.results.find((r) => r.signalId === "broken-sibling")!.status === "FAILED" && own.status === "COMPLETED");
  check("this signal does not run the other signals", calls.join() === "zeta-sibling");
  check("the content provider is read once by validate and once by analyze in a run", providerCalls === 2 && (() => { let n = 0; run(policySignalWith({ content: () => { n += 1; return null; } }), base.context); return n === 1; })());
  const alone = await (async () => { const p = createTrafficSignalPipeline({ now: zero }); registerPolicyRiskSignal(p, { now: zero, content: () => RISKY() }); return p.run(base.context); })();
  check("it runs alone with the same output", alone.results.length === 1 && stable(alone.results[0].metadata) === stable(own.metadata) && alone.results[0].confidence === own.confidence && counted.id === "policy-risk");
  const disabledPipeline = createTrafficSignalPipeline({ now: zero });
  registerPolicyRiskSignal(disabledPipeline, { enabled: false, now: zero });
  check("disabled, the pipeline does not run it", (await disabledPipeline.run(base.context)).results.length === 0);
  const unreadable = createTrafficSignalPipeline({ now: zero });
  registerPolicyRiskSignal(unreadable, { now: zero });
  const unreadableRun = await unreadable.run(failedAnalysis.context);
  check("an unreadable context makes the pipeline report FAILED for this signal, with the reasons", unreadableRun.results[0].status === "FAILED" && unreadableRun.results[0].errors.some((e) => /only a COMPLETED or PARTIAL analysis/.test(e)));

  // ---------- nothing is mutated ----------
  const contentObject = RISKY({ overrides: [{ field: "tagline", value: "A lamp" }] });
  const contentBefore = JSON.stringify(contentObject);
  const before = { context: JSON.stringify(base.context), analysis: JSON.stringify(base.context.opportunityAnalysis), explanation: JSON.stringify(base.context.opportunityExplanation), candidate: JSON.stringify(base.context.candidate), registry: JSON.stringify(createDefaultPolicyRuleRegistry().list()) };
  const reg = createDefaultPolicyRuleRegistry();
  const regBefore = JSON.stringify(reg.list());
  const first = run(withContent(contentObject, { registry: reg }), base.context);
  (first.metadata as Record<string, unknown>).tampered = true;
  (first.warnings as string[]).push("tampered");
  check("no Opportunity mutation: the analysis and the explanation are unchanged", JSON.stringify(base.context.opportunityAnalysis) === before.analysis && JSON.stringify(base.context.opportunityExplanation) === before.explanation && JSON.stringify(base.context) === before.context);
  check("no Discovery mutation: the candidate is unchanged", JSON.stringify(base.context.candidate) === before.candidate && JSON.stringify(candidate) === candidateBefore);
  check("no mutation of the supplied content or the rules", JSON.stringify(contentObject) === contentBefore && JSON.stringify(reg.list()) === regBefore && regBefore === before.registry);
  check("the context stays deep frozen", Object.isFrozen(base.context) && Object.isFrozen(base.context.opportunityAnalysis) && Object.isFrozen(base.context.opportunityExplanation));
  check("changing a returned result does not change a later one", !("tampered" in run(withContent(contentObject, { registry: reg }), base.context).metadata) && run(withContent(contentObject, { registry: reg }), base.context).warnings.length === first.warnings.length - 1);
  check("the rules' entries are frozen, so a caller cannot edit a registered rule", reg.list().every((e) => Object.isFrozen(e) && Object.isFrozen(e.rule)) && (() => { try { (reg.get("medical-claims")!.rule.indicators as string[]).push("x"); return false; } catch { return true; } })());

  // ---------- boundaries ----------
  const trafficDir = join(process.cwd(), "src", "lib", "traffic");
  const policyFiles = readdirSync(trafficDir).filter((name) => name.startsWith("policy-") && name.endsWith(".ts"));
  check("the signal is six modules", policyFiles.length === 6 && ["policy-risk-analyzer.ts", "policy-risk-result.ts", "policy-risk-signal.ts", "policy-risk-validator.ts", "policy-rule-definitions.ts", "policy-rule-registry.ts"].every((name) => policyFiles.includes(name)));
  const sources = [...policyFiles, "traffic-dimension-reader.ts"].map((name) => ({ name, text: readFileSync(join(trafficDir, name), "utf8") }));
  const statements = (text: string) => text.match(/^import[\s\S]*?from\s+"[^"]+";/gm) ?? [];
  const importPath = (statement: string) => /from\s+"([^"]+)"/.exec(statement)![1];
  const allImports = sources.flatMap((s) => statements(s.text).map((statement) => ({ file: s.name, statement, path: importPath(statement) })));
  check("every import is local to the traffic module or a type-only import of an Opportunity or Discovery shape", allImports.every((i) => i.path.startsWith("./") || (/^\.\.\/(opportunity|discovery)\//.test(i.path) && /^import type /.test(i.statement))) && allImports.some((i) => i.path.startsWith("../opportunity/")));
  check("no import from ProductFacts, the LP Builder, the importer, grounding, publication, tracking, analytics, a database, or the network", allImports.every((i) => !/product-facts|lp-|landing|importer|grounding|publication|tracking|analytics|sqlite|\/db|node:|http|openai|anthropic/i.test(i.path.replace(/^\.\.\/opportunity\//, "").replace(/opportunity-explanation-result|opportunity-resolver-analysis/, ""))));
  const code = sources.map((s) => ({ name: s.name, text: stripCode(s.text) }));
  check("no score, severity, approval, block, recommendation, ranking, keyword, CPC, budget, or campaign logic in the code", code.every((c) => !/\b(score|severity|rank|ranking|approve|approved|approval|block|blocked|blocking|recommend\w*|keyword|cpc|budget|campaign|adwords)\b/i.test(c.text)));
  check("no HTTP, network, AI, database, file, or environment access in the code", code.every((c) => !/\b(fetch|XMLHttpRequest|WebSocket|require|readFile|writeFile|process\.env|Math\.random|new Date|Date\.now)\b/.test(c.text) && !/openai|anthropic|sqlite|google-ads/i.test(c.text)));
  check("no platform is named anywhere in the modules, comments included", sources.every((s) => !/google|adwords|microsoft ads|meta ads|tiktok ads/i.test(s.text)));
  check("no product, slug, or source-path-specific logic", code.every((c) => !/gizmo|example\.test|https?:\/\/|\/products\/|slug/i.test(c.text)));
  check("the code never writes to its inputs", code.every((c) => !/\b(opportunityAnalysis|opportunityExplanation|candidate|executionMetadata|inputs)(\.[A-Za-z]+)*\s*(=[^=]|\.push\(|\.splice\(|\.sort\()/.test(c.text)));
  const sourceTree = walk(join(process.cwd(), "src")).filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"));
  const outsiders = sourceTree.filter((file) => !file.includes(join("src", "lib", "traffic")) && /policy-risk|policy-rule|traffic-dimension-reader/.test(readFileSync(file, "utf8")));
  check("nothing outside the traffic module uses the signal: Opportunity, Discovery, and the LP Builder are untouched", outsiders.length === 0);
  const channelText = readdirSync(trafficDir).filter((n) => n.startsWith("channel-")).map((n) => readFileSync(join(trafficDir, n), "utf8")).join("\n");
  check("the Channel Suitability Signal does not depend on the Policy Risk Signal, and the signals share only the dimension reader", !/policy-risk|policy-rule/.test(channelText) && /traffic-dimension-reader/.test(channelText));
  const others = readdirSync(trafficDir).filter((n) => !n.startsWith("policy-") && !n.startsWith("channel-") && n !== "traffic-dimension-reader.ts");
  check("the signal adds files only; no framework or architecture module imports it", others.every((n) => !/policy-risk|policy-rule/.test(readFileSync(join(trafficDir, n), "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
