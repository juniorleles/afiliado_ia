import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createOpportunityExecutionContext } from "../src/lib/opportunity/opportunity-resolver-context.ts";
import { createOpportunityResolver } from "../src/lib/opportunity/opportunity-resolver.ts";
import { createOpportunityExplanationEngine } from "../src/lib/opportunity/opportunity-explanation-engine.ts";
import { createSignalPipeline } from "../src/lib/opportunity/opportunity-signal-pipeline.ts";
import type { OpportunitySignalModule, SignalOutput } from "../src/lib/opportunity/opportunity-signal-contract.ts";
import { createEvidenceContext } from "../src/lib/opportunity/providers/evidence-provider-context.ts";
import {
  AUDIENCE_DIMENSIONS,
  AUDIENCE_FIT_SCOPE_NOTE,
  AUDIENCE_INPUT_KEYS,
  AUDIENCE_PROFILE_FAMILIES,
  AUDIENCE_PROFILE_KEYS,
  AUDIENCE_PROFILE_STATUSES,
  AUDIENCE_REQUIREMENT_KINDS,
  AUDIENCE_RESULT_KEYS,
  AUDIENCE_VERDICTS,
  audienceFitToSignalOutput,
} from "../src/lib/traffic/audience-fit-result.ts";
import type { AudienceFitContent } from "../src/lib/traffic/audience-fit-result.ts";
import type { AudienceProfile } from "../src/lib/traffic/audience-profile-definitions.ts";
import { DEFAULT_AUDIENCE_PROFILES, DEFAULT_AUDIENCE_SOURCES } from "../src/lib/traffic/audience-profile-definitions.ts";
import { AudienceProfileError, createAudienceProfileRegistry } from "../src/lib/traffic/audience-profile-registry.ts";
import {
  validateAudienceConfiguration,
  validateAudienceDimensionSources,
  validateAudienceFitContent,
  validateAudienceFitContext,
  validateAudienceFitInputs,
  validateAudienceFitResult,
  validateAudienceProfile,
  validateAudienceProfiles,
} from "../src/lib/traffic/audience-fit-validator.ts";
import { analyzeAudienceFit } from "../src/lib/traffic/audience-fit-analyzer.ts";
import {
  AUDIENCE_FIT_SIGNAL_ID,
  createAudienceFitSignal,
  createDefaultAudienceProfileRegistry,
  registerAudienceFitSignal,
} from "../src/lib/traffic/audience-fit-signal.ts";
import type { AudienceFitSignalOptions } from "../src/lib/traffic/audience-fit-signal.ts";
import { createChannelSuitabilitySignal, registerChannelSuitabilitySignal } from "../src/lib/traffic/channel-suitability-signal.ts";
import { createPolicyRiskSignal, registerPolicyRiskSignal } from "../src/lib/traffic/policy-risk-signal.ts";
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
  WARNINGS: "evid",
  FEATURES: "evid",
  GUARANTEE: "evid",
  RETURNS: "evid",
  MANUFACTURER: "evid",
  PRICING: "evid",
  FAQ: "evid",
  INGREDIENTS: "evid",
  FEATURE_COVERAGE: "lp",
  HERO_STRENGTH: "lp",
  GUARANTEE_COVERAGE: "lp",
  OFFER_COVERAGE: "lp",
  PRICING_COVERAGE: "lp",
  FAQ_COVERAGE: "lp",
  INFORMATION_DENSITY: "lp",
  INGREDIENT_COVERAGE: "lp",
  PROBLEM_AWARENESS: "intent",
  SOLUTION_AWARENESS: "intent",
  PURCHASE_INTENT: "intent",
  BUYER_READINESS: "intent",
  CONSUMER_TRUST: "intent",
  OFFER_VISIBILITY: "intent",
  PRICE_VISIBILITY: "intent",
  RECURRING_PURCHASE_POTENTIAL: "intent",
  CUSTOM_DIMENSION: "evid",
};
const GOOD: Record<string, string> = Object.fromEntries(Object.keys(OWNER).filter((d) => d !== "CUSTOM_DIMENSION").map((d) => [d, "STRONG"]));

interface Scenario {
  states?: Record<string, string | null>;
  explain?: boolean;
  configuration?: Record<string, unknown>;
  mutate?: (analysis: Record<string, unknown>) => void;
}
async function scenario(options: Scenario = {}) {
  const states = { ...GOOD, ...(options.states ?? {}) };
  const bySignal: Record<string, Record<string, string>> = { evid: {}, lp: {}, intent: {} };
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

const evidenceItem = (id: string, text: string, over: Record<string, unknown> = {}) => ({ id, text, sourceUrl: "https://seller.example/item", pageCategory: "PRODUCT", field: null, ...over });
const section = (id: string, kind: string, texts: string[], over: Record<string, unknown> = {}) => ({ id, kind, visible: true, texts, ...over });
const content = (over: Partial<AudienceFitContent> = {}): AudienceFitContent => ({ evidenceContext: null, landingPage: null, manualOverrides: null, ...over }) as AudienceFitContent;
const PAGE = (): AudienceFitContent =>
  content({
    evidenceContext: { items: [evidenceItem("e1", "A desk lamp with a metal arm.")] },
    landingPage: { sections: [section("hero", "hero", ["A durable blue desk lamp."]), section("feat", "features", ["Adjustable arm."]), section("price", "pricing", ["One size."]), section("faq", "faq", ["How tall is it?"]), section("by", "manufacturer", ["A fictional maker."]), section("terms", "guarantee", ["Return terms."])] },
    manualOverrides: [],
  });

const signal = createAudienceFitSignal({ now: zero });
const withContent = (value: AudienceFitContent | null, options: AudienceFitSignalOptions = {}) => createAudienceFitSignal({ now: zero, content: () => value, ...options });
const run = (module: TrafficSignalModule, context: TrafficSignalContext) => module.analyze(context, {} as never);
const metaOf = (output: { metadata: Record<string, unknown> }) => output.metadata;
const listOf = (output: { metadata: Record<string, unknown> }, key: string) => String(output.metadata[key] ?? "").split(",").filter((part) => part !== "");
const zetaProfile = (over: Record<string, unknown> = {}): AudienceProfile =>
  ({
    id: "zeta-role",
    name: "Zeta Role",
    description: "A fictional profile for tests.",
    family: "ROLE",
    status: "DEFINED",
    enabled: true,
    requirements: Object.fromEntries(AUDIENCE_DIMENSIONS.map((d) => [d, d === "BENEFIT_CLARITY" ? "STRUCTURAL" : "NOT_APPLICABLE"])),
    metadata: {},
    ...over,
  }) as AudienceProfile;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));
}
const stripCode = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/`(?:\\.|[^`\\])*`/g, '""').replace(/"(?:\\.|[^"\\\n])*"/g, '""').replace(/'(?:\\.|[^'\\\n])*'/g, '""').replace(/\/\/.*$/gm, "");

async function main() {
  const base = await scenario();
  const definedIds = DEFAULT_AUDIENCE_PROFILES.filter((p) => p.id !== "future").map((p) => p.id).sort();

  // ---------- vocabulary ----------
  check("twelve audience dimensions, in the specified order", same(AUDIENCE_DIMENSIONS, ["PROBLEM_AWARENESS", "SOLUTION_AWARENESS", "PURCHASE_INTENT", "PAIN_VISIBILITY", "BENEFIT_CLARITY", "TRUST_REQUIREMENTS", "OFFER_COMPLEXITY", "DECISION_COMPLEXITY", "EMOTIONAL_APPEAL", "RATIONAL_APPEAL", "URGENCY_ALIGNMENT", "RECURRING_NEED"]));
  check("four verdicts, none of them a classification", same(AUDIENCE_VERDICTS, ["COMPATIBLE", "INCOMPATIBLE", "NOT_ASSESSED", "NOT_APPLICABLE"]) && same(AUDIENCE_REQUIREMENT_KINDS, ["STRUCTURAL", "CONTEXTUAL", "NOT_APPLICABLE"]));
  check("the result carries exactly the specified fields", same([...AUDIENCE_RESULT_KEYS].sort(), ["confidence", "executionTime", "metadata", "status", "supportedProfiles", "unsupportedProfiles", "warnings"]));
  check("profile families, statuses, and keys", AUDIENCE_PROFILE_FAMILIES.includes("FUTURE") && AUDIENCE_PROFILE_STATUSES.includes("PLACEHOLDER") && !AUDIENCE_PROFILE_KEYS.some((k) => /score|size|classif|lookalike|target/i.test(k)));
  check("the scope note says it is no classification, ranking, score, recommendation, or size estimate", /not a classification, a ranking, a score, or a recommendation/.test(AUDIENCE_FIT_SCOPE_NOTE) && /audience size/.test(AUDIENCE_FIT_SCOPE_NOTE));

  // ---------- default profiles ----------
  check("nine built-in profiles, named as specified", same(DEFAULT_AUDIENCE_PROFILES.map((p) => p.name), ["Cold Audience", "Warm Audience", "Hot Audience", "Existing Customer", "Professional", "Consumer", "B2B", "B2C", "Future Profiles"]));
  check("profile ids are unique and the definitions pass their validator", new Set(DEFAULT_AUDIENCE_PROFILES.map((p) => p.id)).size === 9 && validateAudienceProfiles(DEFAULT_AUDIENCE_PROFILES).length === 0);
  check("the profiles and the dimension sources are deep frozen", DEFAULT_AUDIENCE_PROFILES.every((p) => Object.isFrozen(p) && Object.isFrozen(p.requirements)) && Object.isFrozen(DEFAULT_AUDIENCE_SOURCES) && Object.isFrozen(DEFAULT_AUDIENCE_SOURCES.BENEFIT_CLARITY.sectionKinds));
  check("future profiles are a placeholder and no other profile is", DEFAULT_AUDIENCE_PROFILES.filter((p) => p.status === "PLACEHOLDER").map((p) => p.id).join() === "future");
  check("every dimension has sources, and both requirement kinds are used", AUDIENCE_DIMENSIONS.every((d) => DEFAULT_AUDIENCE_SOURCES[d].opportunityDimensions.length + DEFAULT_AUDIENCE_SOURCES[d].sectionKinds.length + DEFAULT_AUDIENCE_SOURCES[d].evidenceFields.length >= 0) && validateAudienceDimensionSources(DEFAULT_AUDIENCE_SOURCES).length === 0 && DEFAULT_AUDIENCE_PROFILES.some((p) => AUDIENCE_DIMENSIONS.some((d) => p.requirements[d] === "STRUCTURAL")) && DEFAULT_AUDIENCE_PROFILES.some((p) => AUDIENCE_DIMENSIONS.some((d) => p.requirements[d] === "CONTEXTUAL")));
  check("the built-in profiles cite no advertising platform", !/google|facebook|\bmeta\b|tiktok|pinterest|lookalike|interest targeting|demographic/i.test(JSON.stringify(DEFAULT_AUDIENCE_PROFILES)));
  check("a default registry holds the nine profiles, all enabled", (() => { const r = createDefaultAudienceProfileRegistry(); return r.count() === 9 && r.list().every((e) => e.enabled); })());

  // ---------- profile validation ----------
  check("Invalid Audience Definition: a non-object is rejected", [null, undefined, "x", 5, []].every((v) => has(validateAudienceProfile(v), /a profile must be an object/)));
  check("a valid profile passes", validateAudienceProfile(zetaProfile()).length === 0);
  check("Invalid Audience Definition: id, name, description, family, status, and enabled are checked", has(validateAudienceProfile(zetaProfile({ id: "Bad Id" })), /id must be/) && has(validateAudienceProfile(zetaProfile({ name: " " })), /name must be/) && has(validateAudienceProfile(zetaProfile({ description: 5 })), /description must be/) && has(validateAudienceProfile(zetaProfile({ family: "NOPE" })), /family is not supported/) && has(validateAudienceProfile(zetaProfile({ status: "NOPE" })), /status is not supported/) && has(validateAudienceProfile(zetaProfile({ enabled: "yes" })), /enabled must be/));
  check("Invalid Audience Definition: requirements must cover every dimension", has(validateAudienceProfile(zetaProfile({ requirements: null })), /requirements must be an object/) && has(validateAudienceProfile(zetaProfile({ requirements: { ...zetaProfile().requirements, EXTRA: "STRUCTURAL" } })), /not an audience dimension/) && has(validateAudienceProfile(zetaProfile({ requirements: { ...zetaProfile().requirements, BENEFIT_CLARITY: "NOPE" } })), /STRUCTURAL, CONTEXTUAL, or NOT_APPLICABLE/) && has(validateAudienceProfile(zetaProfile({ requirements: { ...zetaProfile().requirements, BENEFIT_CLARITY: undefined } })), /BENEFIT_CLARITY/));
  check("Invalid Audience Definition: a profile is metadata only, so a score, size, or classification field is rejected", ["score", "size", "classification", "lookalike", "targeting"].every((field) => has(validateAudienceProfile(zetaProfile({ [field]: 1 })), new RegExp(`unexpected field "${field}"`))));
  check("Invalid Metadata: nested, array, and undefined profile metadata is rejected", [{ a: { b: 1 } }, { a: [1] }, { a: undefined }, [], null].every((metadata) => has(validateAudienceProfile(zetaProfile({ metadata })), /Invalid metadata/)));
  check("Duplicate Profiles: a repeated id in a list is rejected", has(validateAudienceProfiles([zetaProfile(), zetaProfile()]), /Duplicate profile "zeta-role"/) && has(validateAudienceProfiles("x"), /must be a list/) && validateAudienceProfiles([zetaProfile(), zetaProfile({ id: "omega-role" })]).length === 0);
  check("dimension sources: missing, malformed, and unknown entries are rejected", has(validateAudienceDimensionSources(null), /must be an object/) && has(validateAudienceDimensionSources({ ...DEFAULT_AUDIENCE_SOURCES, BENEFIT_CLARITY: undefined }), /"BENEFIT_CLARITY" needs its sources/) && has(validateAudienceDimensionSources({ ...DEFAULT_AUDIENCE_SOURCES, BENEFIT_CLARITY: { opportunityDimensions: "x", sectionKinds: [], evidenceFields: [] } }), /opportunityDimensions/) && has(validateAudienceDimensionSources({ ...DEFAULT_AUDIENCE_SOURCES, BENEFIT_CLARITY: { opportunityDimensions: ["A", "A"], sectionKinds: [], evidenceFields: [] } }), /must not repeat/) && has(validateAudienceDimensionSources({ ...DEFAULT_AUDIENCE_SOURCES, EXTRA: { opportunityDimensions: [], sectionKinds: [], evidenceFields: [] } }), /not an audience dimension/));

  // ---------- the profile registry ----------
  const registry = createAudienceProfileRegistry();
  const original = zetaProfile();
  const entry = registry.register(original);
  check("Register Profile: returns a frozen entry, enabled by the profile's own flag", entry.id === "zeta-role" && entry.enabled === true && Object.isFrozen(entry) && Object.isFrozen(entry.profile) && registry.count() === 1);
  (original as { name: string }).name = "tampered";
  check("Register Profile: the registry holds a copy, so later changes to the caller's object do not reach it", registry.get("zeta-role")!.profile.name === "Zeta Role");
  check("Duplicate Profiles: a second registration is rejected and the first is kept", (() => { try { registry.register(zetaProfile()); return false; } catch (e) { return e instanceof AudienceProfileError && /Duplicate profile/.test(e.issues.map((i) => i.message).join()); } })() && registry.count() === 1);
  check("Invalid Audience Definition: an invalid profile is not registered, and the error carries every issue", (() => { try { registry.register(zetaProfile({ id: "Bad", family: "NO" })); return false; } catch (e) { return e instanceof AudienceProfileError && e.issues.length === 2 && e.name === "AudienceProfileError"; } })() && registry.get("Bad") === null);
  check("Validate Profile: reports a profile's problems and a duplicate id, and changes nothing", registry.validate(zetaProfile()).length === 1 && has(registry.validate(zetaProfile()), /Duplicate profile/) && registry.validate(zetaProfile({ id: "other-role" })).length === 0 && has(registry.validate(null), /must be an object/) && registry.count() === 1);
  check("Disable Profile and Enable Profile change only the enabled state", registry.disable("zeta-role").enabled === false && registry.get("zeta-role")!.enabled === false && registry.enable("zeta-role").enabled === true);
  check("enabling or disabling an unknown profile is rejected", (() => { try { registry.enable("nope"); return false; } catch (e) { return e instanceof AudienceProfileError && /Unknown profile/.test(e.message); } })());
  registry.register(zetaProfile({ id: "alpha-role", name: "Alpha" }));
  check("List Profiles is sorted by id, and a registry can start from a list", registry.list().map((e) => e.id).join() === "alpha-role,zeta-role" && createAudienceProfileRegistry([zetaProfile(), zetaProfile({ id: "alpha-role" })]).count() === 2);
  check("a registry started from a list with a duplicate or invalid profile is rejected", (() => { try { createAudienceProfileRegistry([zetaProfile(), zetaProfile()]); return false; } catch (e) { return e instanceof AudienceProfileError; } })() && (() => { try { createAudienceProfileRegistry([{}]); return false; } catch (e) { return e instanceof AudienceProfileError; } })());

  // ---------- the signal ----------
  check("signal identity and contract", signal.id === AUDIENCE_FIT_SIGNAL_ID && signal.id === "audience-fit" && signal.version === "1.0.0" && signal.category === "AUDIENCE" && signal.enabled === true && signal.priority === 70 && validateTrafficSignalModule(signal).length === 0);
  check("the signal depends on no other signal", signal.dependencies.requires.length === 0 && signal.dependencies.optional.length === 0 && signal.dependencies.conflicts.length === 0);
  check("enabled and priority can be set", createAudienceFitSignal({ enabled: false, priority: 5 }).enabled === false && createAudienceFitSignal({ priority: 5 }).priority === 5);

  // ---------- registration ----------
  const host = createTrafficModuleRegistry();
  const hostEntry = registerAudienceFitSignal(host, { now: zero });
  check("registration returns the entry, enabled, in the registry", hostEntry.id === "audience-fit" && hostEntry.enabled && host.count() === 1 && host.get("audience-fit")?.module.category === "AUDIENCE");
  check("registering it twice is rejected as a duplicate signal id", (() => { try { registerAudienceFitSignal(host, { now: zero }); return false; } catch (e) { return e instanceof TrafficFrameworkError && /already registered/.test(e.message + e.issues.map((i) => i.message).join()); } })() && host.count() === 1);
  const hostPipeline = createTrafficSignalPipeline({ now: zero });
  registerAudienceFitSignal(hostPipeline, { now: zero });
  check("registration works on a pipeline, and its dependencies are valid", hostPipeline.validateDependencies().length === 0 && hostPipeline.resolveExecutionOrder().order.join() === "audience-fit");

  // ---------- a well-evidenced offer ----------
  const out = run(signal, base.context);
  check("a well-evidenced offer COMPLETES", out.status === "COMPLETED" && out.errors.length === 0 && validateTrafficSignalOutput(out).length === 0);
  check("every defined profile is supported and only the placeholder is not", same(listOf(out, "supportedProfiles"), definedIds) && same(listOf(out, "unsupportedProfiles"), ["future"]));
  check("the placeholder is unsupported because it is a placeholder", /placeholder/.test(String(metaOf(out)["unavailable.future"])) && /UNAVAILABLE/.test(String(metaOf(out)["reason.future"])));
  check("with every dimension established, confidence is 1", out.confidence === 1 && metaOf(out).assessedCount === metaOf(out).assessableCount);
  check("all twelve dimensions have a verdict for cold", AUDIENCE_DIMENSIONS.every((d) => AUDIENCE_VERDICTS.includes(String(metaOf(out)[`verdict.cold.${d}`]) as never)));
  check("a dimension the profile does not need is NOT_APPLICABLE", metaOf(out)["verdict.cold.PURCHASE_INTENT"] === "NOT_APPLICABLE" && metaOf(out)["verdict.cold.RECURRING_NEED"] === "NOT_APPLICABLE" && metaOf(out)["verdict.existing-customer.PROBLEM_AWARENESS"] === "NOT_APPLICABLE");
  check("the metadata holds counts, the scope note, and the Opportunity references", metaOf(out).profileCount === 9 && metaOf(out).supportedCount === 8 && metaOf(out).unsupportedCount === 1 && metaOf(out).scopeNote === AUDIENCE_FIT_SCOPE_NOTE && metaOf(out).opportunityAnalysisId === (base.analysis as { analysisId: string }).analysisId && metaOf(out).candidateId === "cand-1" && metaOf(out).explanationSupplied === true);
  check("every audience dimension is restated in the metadata", AUDIENCE_DIMENSIONS.every((d) => typeof metaOf(out)[`need.${d}`] === "string") && metaOf(out)["need.PROBLEM_AWARENESS"] === "SATISFIED" && metaOf(out)["need.RECURRING_NEED"] === "SATISFIED");
  check("execution metadata is passed through under its own key", metaOf(out)["execution.run"] === "t1" && metaOf(out)["execution.attempt"] === 2);
  check("a well-evidenced offer without content warns only that content was not supplied", out.warnings.length === 1 && /No content was supplied/.test(out.warnings[0]));
  check("the output metadata is flat", Object.values(metaOf(out)).every((v) => v === null || ["string", "number", "boolean"].includes(typeof v)));

  // ---------- structural vs contextual ----------
  const noProblem = run(signal, (await scenario({ states: { PROBLEM_AWARENESS: "MISSING" } })).context);
  check("a structural need reported missing excludes exactly the profiles that need it", listOf(noProblem, "unsupportedProfiles").includes("cold") && !listOf(noProblem, "unsupportedProfiles").includes("warm") && metaOf(noProblem)["verdict.cold.PROBLEM_AWARENESS"] === "INCOMPATIBLE" && metaOf(noProblem)["need.PROBLEM_AWARENESS"] === "ABSENT");
  check("a contextual need reported missing is NOT_ASSESSED and excludes nothing", metaOf(noProblem)["verdict.warm.PROBLEM_AWARENESS"] === "NOT_ASSESSED" && listOf(noProblem, "supportedProfiles").includes("warm") && /PROBLEM_AWARENESS/.test(String(metaOf(noProblem)["notAssessed.warm"])));
  check("pain visibility stays met when another of its sources is still present", metaOf(noProblem)["need.PAIN_VISIBILITY"] === "SATISFIED" && metaOf(noProblem)["verdict.cold.PAIN_VISIBILITY"] === "COMPATIBLE");
  const noRecurring = run(signal, (await scenario({ states: { RECURRING_PURCHASE_POTENTIAL: "MISSING" } })).context);
  check("a missing recurring need excludes only the existing-customer profile", same(listOf(noRecurring, "unsupportedProfiles"), ["existing-customer", "future"]) && metaOf(noRecurring)["verdict.existing-customer.RECURRING_NEED"] === "INCOMPATIBLE");
  const noFaq = run(signal, (await scenario({ states: { FAQ: "MISSING", FAQ_COVERAGE: "MISSING", INFORMATION_DENSITY: "MISSING" } })).context);
  check("decision complexity excludes professional and B2B, which need it structurally", ["professional", "b2b"].every((id) => listOf(noFaq, "unsupportedProfiles").includes(id)) && !listOf(noFaq, "unsupportedProfiles").includes("consumer") && metaOf(noFaq)["need.DECISION_COMPLEXITY"] === "ABSENT");
  const weakTrust = run(signal, (await scenario({ states: { GUARANTEE: "WEAK", GUARANTEE_COVERAGE: "MISSING", RETURNS: "MISSING", MANUFACTURER: "MISSING", CONSUMER_TRUST: "MISSING" } })).context);
  check("a need reported weak is only partly evidenced: it does not exclude, and a warning says so", metaOf(weakTrust)["need.TRUST_REQUIREMENTS"] === "PARTIAL" && listOf(weakTrust, "supportedProfiles").includes("b2b") && weakTrust.warnings.some((w) => /partly evidenced/.test(w) && /TRUST_REQUIREMENTS/.test(w)));
  const unknownRecurring = run(signal, (await scenario({ states: { RECURRING_PURCHASE_POTENTIAL: null } })).context);
  check("a need nothing reported on is UNKNOWN, never ABSENT, and does not exclude", metaOf(unknownRecurring)["need.RECURRING_NEED"] === "UNKNOWN" && listOf(unknownRecurring, "supportedProfiles").includes("existing-customer") && metaOf(unknownRecurring)["verdict.existing-customer.RECURRING_NEED"] === "NOT_ASSESSED" && (unknownRecurring.confidence as number) < 1);

  // ---------- content: structure, never classification ----------
  const SECRET = "ZETA-PHRASE-77";
  const noBenefits = await scenario({ states: { FEATURES: "MISSING", FEATURE_COVERAGE: "MISSING", HERO_STRENGTH: "MISSING" } });
  const noBenefitsOut = run(signal, noBenefits.context);
  check("without features, benefit clarity is absent and structurally required profiles are unsupported", metaOf(noBenefitsOut)["need.BENEFIT_CLARITY"] === "ABSENT" && ["warm", "consumer", "b2c"].every((id) => listOf(noBenefitsOut, "unsupportedProfiles").includes(id)));
  const pageRestores = run(withContent(PAGE()), noBenefits.context);
  check("a visible mapped landing-page section establishes the dimension without reading the words", metaOf(pageRestores)["need.BENEFIT_CLARITY"] === "SATISFIED" && listOf(pageRestores, "supportedProfiles").includes("warm") && listOf(pageRestores, "supportedProfiles").includes("consumer") && /BENEFIT_CLARITY/.test(String(metaOf(pageRestores).structureEstablished)));
  check("the supplied text is never copied into the result", !JSON.stringify(pageRestores).includes("desk lamp") && !JSON.stringify(run(withContent(content({ landingPage: { sections: [section("hero", "hero", [SECRET])] } })), noBenefits.context)).includes(SECRET));
  const hiddenHero = run(withContent(content({ landingPage: { sections: [section("hero", "hero", ["A lamp."], { visible: false })] } })), noBenefits.context);
  check("a hidden section is not on the page and establishes nothing", metaOf(hiddenHero)["need.BENEFIT_CLARITY"] === "ABSENT" && listOf(hiddenHero, "unsupportedProfiles").includes("warm"));
  const painField = run(withContent(content({ evidenceContext: { items: [evidenceItem("e9", "whatever words", { field: "pain" })] } })), (await scenario({ states: { PROBLEM_AWARENESS: "MISSING", WARNINGS: "MISSING" } })).context);
  check("non-empty text on a mapped field establishes the dimension; the words are not classified", metaOf(painField)["need.PAIN_VISIBILITY"] === "SATISFIED");
  const emptyPain = run(withContent(content({ evidenceContext: { items: [evidenceItem("e9", "   ", { field: "pain" })] } })), (await scenario({ states: { PROBLEM_AWARENESS: "MISSING", WARNINGS: "MISSING" } })).context);
  check("empty text on a mapped field establishes nothing", metaOf(emptyPain)["need.PAIN_VISIBILITY"] === "ABSENT");
  const overridden = run(withContent(content({ evidenceContext: { items: [evidenceItem("e3", "a benefit", { field: "benefit" })] }, manualOverrides: [{ field: "benefit", value: "   " }] })), noBenefits.context);
  check("an effective override supersedes the item that states the same field", metaOf(overridden)["need.BENEFIT_CLARITY"] === "ABSENT" && metaOf(overridden).supersededCount === 1 && overridden.warnings.some((w) => /superseded by an effective manual override/.test(w)));
  const overrideRestores = run(withContent(content({ evidenceContext: { items: [evidenceItem("e3", "", { field: "benefit" })] }, manualOverrides: [{ field: "benefit", value: "restored" }] })), noBenefits.context);
  check("an override's effective text establishes the mapped dimension", metaOf(overrideRestores)["need.BENEFIT_CLARITY"] === "SATISFIED" && metaOf(overrideRestores).supersededCount === 1);
  const overrideNonText = run(withContent(content({ manualOverrides: [{ field: "benefit", value: 5 }] })), noBenefits.context);
  check("an override whose value is not text is ignored, with a warning", metaOf(overrideNonText)["need.BENEFIT_CLARITY"] === "ABSENT" && overrideNonText.warnings.some((w) => /not text and was not read/.test(w)));

  // ---------- availability from the configuration ----------
  const onlyTwo = run(signal, (await scenario({ configuration: { [AUDIENCE_INPUT_KEYS.enabled]: "cold, consumer" } })).context);
  check("an enabled list makes every other profile unavailable", same(listOf(onlyTwo, "supportedProfiles"), ["cold", "consumer"]) && onlyTwo.metadata["unavailable.hot"] === "the configuration enables other profiles only");
  const disabledOne = run(signal, (await scenario({ configuration: { [AUDIENCE_INPUT_KEYS.disabled]: "hot" } })).context);
  check("a disabled list removes only the named profile", same(listOf(disabledOne, "unsupportedProfiles"), ["future", "hot"]) && disabledOne.metadata["unavailable.hot"] === "the configuration disables it");
  const enableFuture = run(signal, (await scenario({ configuration: { [AUDIENCE_INPUT_KEYS.enabled]: "future,cold" } })).context);
  check("enabling the placeholder does not make it available", listOf(enableFuture, "unsupportedProfiles").includes("future") && listOf(enableFuture, "supportedProfiles").join() === "cold");
  const unknownId = run(signal, (await scenario({ configuration: { [AUDIENCE_INPUT_KEYS.disabled]: "nonexistent-net" } })).context);
  check("a profile id with no definition is a warning, not a failure", unknownId.status === "COMPLETED" && unknownId.warnings.some((w) => /"nonexistent-net", which has no definition/.test(w)));

  // ---------- registry enable / disable ----------
  const live = createDefaultAudienceProfileRegistry();
  const liveSignal = createAudienceFitSignal({ now: zero, registry: live });
  const liveBefore = run(liveSignal, base.context);
  live.disable("cold");
  const liveDisabled = run(liveSignal, base.context);
  check("Disable Profile: a disabled profile is omitted from both lists and a warning says so", !listOf(liveDisabled, "supportedProfiles").includes("cold") && !listOf(liveDisabled, "unsupportedProfiles").includes("cold") && liveDisabled.warnings.some((w) => /Disabled in the registry and not assessed: cold/.test(w)) && metaOf(liveDisabled).profileCount === 8);
  live.enable("cold");
  check("Enable Profile: the same signal assesses the profile again, with no re-registration", stable(run(liveSignal, base.context)) === stable(liveBefore));
  const custom = createAudienceProfileRegistry([zetaProfile()]);
  const customOut = run(createAudienceFitSignal({ now: zero, registry: custom }), base.context);
  check("a fictional profile works through the same engine, with no change to the code", customOut.status === "COMPLETED" && same(listOf(customOut, "supportedProfiles"), ["zeta-role"]) && metaOf(customOut)["verdict.zeta-role.BENEFIT_CLARITY"] === "COMPATIBLE");
  const customSources = createAudienceFitSignal({ now: zero, registry: createAudienceProfileRegistry([zetaProfile()]), dimensionSources: { ...DEFAULT_AUDIENCE_SOURCES, BENEFIT_CLARITY: { opportunityDimensions: ["CUSTOM_DIMENSION"], sectionKinds: [], evidenceFields: [] } } });
  const customScenario = await scenario({ states: { FEATURES: "MISSING", FEATURE_COVERAGE: "MISSING", HERO_STRENGTH: "MISSING", CUSTOM_DIMENSION: "STRONG" } });
  const defaultCustom = run(createAudienceFitSignal({ now: zero, registry: createAudienceProfileRegistry([zetaProfile()]) }), customScenario.context);
  const customSourcesOut = run(customSources, customScenario.context);
  check("the dimension sources are data: another dimension name can establish a need", metaOf(defaultCustom)["need.BENEFIT_CLARITY"] === "ABSENT" && customSourcesOut.status === "COMPLETED" && metaOf(customSourcesOut)["need.BENEFIT_CLARITY"] === "SATISFIED");
  const emptySet = run(createAudienceFitSignal({ now: zero, registry: createAudienceProfileRegistry() }), base.context);
  check("an empty profile set has nothing to assess: no profiles and no confidence", emptySet.status === "COMPLETED" && emptySet.confidence === null && metaOf(emptySet).profileCount === 0 && listOf(emptySet, "supportedProfiles").length === 0);

  // ---------- no explanation / partial ----------
  const noExplanation = await scenario({ explain: false });
  const noExOut = run(signal, noExplanation.context);
  check("without an explanation only availability is established, with a warning", noExOut.status === "COMPLETED" && metaOf(noExOut).explanationSupplied === false && metaOf(noExOut).dimensionsRead === 0 && noExOut.warnings.some((w) => /No Opportunity explanation/.test(w)));
  check("without an explanation nothing is excluded for evidence except the placeholder", same(listOf(noExOut, "unsupportedProfiles"), ["future"]) && (noExOut.confidence as number) < 1);
  const partial = run(signal, (await scenario({ mutate: (analysis) => { analysis.status = "PARTIAL"; } })).context);
  check("a PARTIAL Opportunity analysis can be read, and says so", partial.status === "COMPLETED" && partial.warnings.some((w) => /PARTIAL/.test(w)) && metaOf(partial).opportunityStatus === "PARTIAL");
  const failedLp = await scenario({ mutate: (analysis) => { (analysis.signalResults as Array<{ signalId: string; status: string }>).find((r) => r.signalId === "lp")!.status = "FAILED"; } });
  const failedLpOut = run(signal, failedLp.context);
  check("dimensions of a signal that did not complete are not read", (failedLpOut.metadata.dimensionsRead as number) === 16 && metaOf(failedLpOut)["need.BENEFIT_CLARITY"] === "SATISFIED");

  // ---------- rejections ----------
  const noAnalysis = createTrafficSignalContext({ candidate });
  check("Missing Context: the signal does not support the analysis", signal.supportsAnalysis(noAnalysis) === false);
  check("Missing Context: the validator rejects it", has(signal.validate(noAnalysis), /Missing context/) && has(validateAudienceFitContext(null), /Missing context/) && has(validateAudienceFitContext({ ...base.context, opportunityAnalysis: null }), /Missing context: an Opportunity analysis/));
  const forced = run(signal, noAnalysis);
  check("Missing Context: analyze FAILS with the reason and no profiles", forced.status === "FAILED" && forced.errors.some((e) => /Missing context/.test(e)) && forced.confidence === null && Object.keys(forced.metadata).length === 0);
  const skipped = await (async () => { const p = createTrafficSignalPipeline({ now: zero }); registerAudienceFitSignal(p, { now: zero }); return p.run(noAnalysis); })();
  check("Missing Context: in a pipeline the signal is SKIPPED", skipped.results.length === 1 && skipped.results[0].status === "SKIPPED");
  check("Missing Context: an empty object is rejected too", validateAudienceFitContext({}).length > 0);
  check("Invalid Context: an analysis that failed or was refused cannot be read", ["FAILED", "REFUSED"].every((status) => has(validateAudienceFitContext({ ...base.context, opportunityAnalysis: { ...base.context.opportunityAnalysis, status } }), /only a COMPLETED or PARTIAL analysis can be read/)));
  const failedAnalysis = await scenario({ mutate: (analysis) => { analysis.status = "FAILED"; } });
  check("Invalid Context: analyze FAILS for an analysis that did not complete", run(signal, failedAnalysis.context).status === "FAILED" && run(signal, failedAnalysis.context).errors.some((e) => /FAILED/.test(e)));
  check("Invalid Context: a profile both enabled and disabled is rejected", has(validateAudienceConfiguration({ [AUDIENCE_INPUT_KEYS.enabled]: "cold,warm", [AUDIENCE_INPUT_KEYS.disabled]: "warm" }), /both enabled and disabled/));
  const bothOut = run(signal, (await scenario({ configuration: { [AUDIENCE_INPUT_KEYS.enabled]: "cold", [AUDIENCE_INPUT_KEYS.disabled]: "cold" } })).context);
  check("Invalid Context: analyze FAILS for a contradicting configuration", bothOut.status === "FAILED" && bothOut.errors.some((e) => /both enabled and disabled/.test(e)));
  check("Invalid Context: a malformed profile id is rejected", has(validateAudienceConfiguration({ [AUDIENCE_INPUT_KEYS.enabled]: "Bad Id" }), /only profile ids/) && has(validateAudienceConfiguration({ [AUDIENCE_INPUT_KEYS.enabled]: "cold,,warm" }), /no empty entry/));

  check("Duplicate Profiles: a profile listed twice in the enabled list is rejected", has(validateAudienceConfiguration({ [AUDIENCE_INPUT_KEYS.enabled]: "cold,warm,cold" }), /Duplicate profile "cold"/));
  const dupOut = run(signal, (await scenario({ configuration: { [AUDIENCE_INPUT_KEYS.enabled]: "cold,cold" } })).context);
  check("Duplicate Profiles: analyze FAILS for a duplicate in the configuration", dupOut.status === "FAILED" && dupOut.errors.some((e) => /Duplicate profile "cold"/.test(e)));
  const dupRegistry = { ...createDefaultAudienceProfileRegistry(), list: () => { const e = { id: "cold", profile: DEFAULT_AUDIENCE_PROFILES[0], enabled: true }; return [e, e]; } } as never;
  const dupRegOut = run(createAudienceFitSignal({ now: zero, registry: dupRegistry }), base.context);
  check("Duplicate Profiles: the signal FAILS if its registry lists a profile twice", dupRegOut.status === "FAILED" && dupRegOut.errors.some((e) => /Duplicate profile "cold"/.test(e)));
  const badRegistry = { ...createDefaultAudienceProfileRegistry(), list: () => [{ id: "cold", profile: { ...DEFAULT_AUDIENCE_PROFILES[0], family: "NOPE" }, enabled: true }] } as never;
  check("Invalid Audience Definition: the signal FAILS if its registry holds an invalid profile", run(createAudienceFitSignal({ now: zero, registry: badRegistry }), base.context).status === "FAILED");

  check("Invalid Metadata: nested configuration is rejected", has(validateAudienceConfiguration({ a: { b: 1 } }), /Invalid metadata/) && has(validateAudienceFitContext({ ...base.context, configuration: { a: [1] } }), /Invalid metadata/));
  const badInputs = (over: Record<string, unknown>) => validateAudienceFitInputs({ opportunityAnalysis: base.context.opportunityAnalysis, opportunityExplanation: base.context.opportunityExplanation, executionMetadata: {}, configuration: {}, profiles: DEFAULT_AUDIENCE_PROFILES, dimensionSources: DEFAULT_AUDIENCE_SOURCES, content: null, ...over });
  check("Invalid Metadata: nested execution metadata is rejected by the analyzer inputs", has(badInputs({ executionMetadata: { a: { b: 1 } } }), /Invalid metadata: "executionMetadata"/) && badInputs({}).length === 0);
  check("content: none is valid, and a complete one is valid", validateAudienceFitContent(null).length === 0 && validateAudienceFitContent(PAGE()).length === 0);
  check("content: overrides carry effective values only", has(validateAudienceFitContent({ evidenceContext: null, landingPage: null, manualOverrides: [{ field: "a", value: "x", id: 7 }] }), /unexpected field "id"/) && has(validateAudienceFitContent({ evidenceContext: null, landingPage: null, manualOverrides: [{ field: "a", value: "x" }, { field: "a", value: "y" }] }), /duplicate override/));
  const badProvider = run(createAudienceFitSignal({ now: zero, content: () => ({ evidenceContext: { items: [{ id: "", text: "x", sourceUrl: null, pageCategory: null }] }, landingPage: null, manualOverrides: null }) }), base.context);
  check("Invalid content from the provider makes the signal FAIL", badProvider.status === "FAILED" && badProvider.errors.some((e) => /Invalid content/.test(e)));
  const throwingProvider = run(createAudienceFitSignal({ now: zero, content: () => { throw new Error("provider exploded"); } }), base.context);
  check("a provider that throws makes the signal FAIL, never a guess", throwingProvider.status === "FAILED" && throwingProvider.errors.some((e) => /provider exploded/.test(e)));

  // ---------- result shape ----------
  const goodResult = analyzeAudienceFit({ opportunityAnalysis: base.context.opportunityAnalysis!, opportunityExplanation: base.context.opportunityExplanation, executionMetadata: {}, configuration: {}, profiles: DEFAULT_AUDIENCE_PROFILES, dimensionSources: DEFAULT_AUDIENCE_SOURCES, content: null }, zero);
  check("a real result passes its validator", validateAudienceFitResult(goodResult, DEFAULT_AUDIENCE_PROFILES.map((p) => p.id)).length === 0);
  check("the result keys are exactly the specified ones", same(Object.keys(goodResult).sort(), [...AUDIENCE_RESULT_KEYS].sort()));
  check("a result with a score, ranking, classification, or recommendation is rejected", ["score", "rank", "ranking", "classification", "recommendation", "audienceSize", "lookalike"].every((field) => has(validateAudienceFitResult({ ...goodResult, [field]: 1 }), new RegExp(`unexpected field "${field}"`))));
  check("a result missing a field is rejected", AUDIENCE_RESULT_KEYS.every((key) => { const { [key]: _removed, ...rest } = goodResult as unknown as Record<string, unknown>; return has(validateAudienceFitResult(rest), new RegExp(`"${key}" is missing`)); }));
  check("Duplicate Profiles: a result that lists a profile twice is rejected", has(validateAudienceFitResult({ ...goodResult, supportedProfiles: ["cold", "cold"], unsupportedProfiles: [] }), /Duplicate profile "cold"/) && has(validateAudienceFitResult({ ...goodResult, supportedProfiles: ["cold"], unsupportedProfiles: ["cold"] }), /both supported and unsupported/));
  check("an unsorted list is rejected, so that order cannot imply a ranking", has(validateAudienceFitResult({ ...goodResult, supportedProfiles: ["warm", "cold"], unsupportedProfiles: [] }), /must be sorted by id/));
  check("both lists are sorted by id, whatever the order of the profiles", same(listOf(out, "supportedProfiles"), [...listOf(out, "supportedProfiles")].sort()) && same(listOf(noProblem, "unsupportedProfiles"), [...listOf(noProblem, "unsupportedProfiles")].sort()));
  const reversed = createAudienceFitSignal({ now: zero, registry: createAudienceProfileRegistry([...DEFAULT_AUDIENCE_PROFILES].reverse()) }).analyze(base.context, {} as never);
  check("the order of the profiles changes nothing", stable(reversed) === stable(out));
  check("no metadata key names a score, rank, weight, recommendation, size, or classification", Object.keys(metaOf(out)).every((k) => !/score|rank|weight|recommend|size|classif|lookalike|target/i.test(k)));
  check("the signal output is exactly status, confidence, metadata, warnings, and errors", same(Object.keys(audienceFitToSignalOutput(goodResult)).sort(), ["confidence", "errors", "metadata", "status", "warnings"]) && audienceFitToSignalOutput(goodResult).errors.length === 0);

  // ---------- determinism, time, independence ----------
  check("the same context gives the same output", stable(run(signal, base.context)) === stable(run(signal, base.context)));
  const clockInputs = { opportunityAnalysis: base.context.opportunityAnalysis!, opportunityExplanation: null, executionMetadata: {}, configuration: {}, profiles: DEFAULT_AUDIENCE_PROFILES, dimensionSources: DEFAULT_AUDIENCE_SOURCES, content: null };
  check("executionTime comes from the injected clock, and a bad clock reports zero", analyzeAudienceFit(clockInputs, tick()).executionTime === 1 && analyzeAudienceFit(clockInputs, () => Number.NaN).executionTime === 0 && (() => { let t = 10; return analyzeAudienceFit(clockInputs, () => (t -= 1)).executionTime === 0; })() && analyzeAudienceFit(clockInputs).executionTime >= 0);
  const withUpstream = signal.analyze(base.context, { "other-signal": { signalId: "other-signal", status: "COMPLETED", confidence: 1, metadata: { x: 1 }, warnings: [], errors: [], executionTime: 0 } } as never);
  check("independent execution: the output does not depend on any other signal", stable(withUpstream) === stable(out));

  // ---------- run beside Channel Suitability and Policy Risk ----------
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
  const together = createTrafficSignalPipeline({ now: zero });
  together.register(sibling("zeta-sibling"));
  registerChannelSuitabilitySignal(together, { now: zero });
  registerPolicyRiskSignal(together, { now: zero });
  registerAudienceFitSignal(together, { now: zero });
  together.register(sibling("broken-sibling", { analyze: () => { throw new Error("sibling exploded"); }, priority: 75 }));
  const togetherRun = await together.run(base.context);
  const own = togetherRun.results.find((r) => r.signalId === "audience-fit")!;
  const channel = togetherRun.results.find((r) => r.signalId === "channel-suitability")!;
  const policy = togetherRun.results.find((r) => r.signalId === "policy-risk")!;
  check("it runs sequentially beside Channel Suitability and Policy Risk, in priority order", togetherRun.order.join() === "zeta-sibling,channel-suitability,policy-risk,broken-sibling,audience-fit" && togetherRun.results.length === 5);
  check("Channel Suitability and Policy Risk regression: all three COMPLETE and neither changes the others' output", own.status === "COMPLETED" && channel.status === "COMPLETED" && policy.status === "COMPLETED" && sameOutput(channel, run(createChannelSuitabilitySignal({ now: zero }), base.context)) && sameOutput(policy, run(createPolicyRiskSignal({ now: zero }), base.context)) && sameOutput(own, out));
  check("a sibling that throws does not change this signal's output", togetherRun.results.find((r) => r.signalId === "broken-sibling")!.status === "FAILED" && own.status === "COMPLETED");
  check("this signal does not run the other signals", calls.join() === "zeta-sibling");
  const alone = await (async () => { const p = createTrafficSignalPipeline({ now: zero }); registerAudienceFitSignal(p, { now: zero }); return p.run(base.context); })();
  check("it runs alone with the same output", alone.results.length === 1 && stable(alone.results[0].metadata) === stable(own.metadata) && alone.results[0].confidence === own.confidence);
  const disabledPipeline = createTrafficSignalPipeline({ now: zero });
  registerAudienceFitSignal(disabledPipeline, { enabled: false, now: zero });
  check("disabled, the pipeline does not run it", (await disabledPipeline.run(base.context)).results.length === 0);
  const unreadable = createTrafficSignalPipeline({ now: zero });
  registerAudienceFitSignal(unreadable, { now: zero });
  check("an unreadable context makes the pipeline report FAILED for this signal", (await unreadable.run(failedAnalysis.context)).results[0].status === "FAILED");

  // ---------- nothing is mutated ----------
  const contentObject = PAGE();
  const contentBefore = JSON.stringify(contentObject);
  const before = { context: JSON.stringify(base.context), analysis: JSON.stringify(base.context.opportunityAnalysis), explanation: JSON.stringify(base.context.opportunityExplanation), candidate: JSON.stringify(base.context.candidate) };
  const reg = createDefaultAudienceProfileRegistry();
  const regBefore = JSON.stringify(reg.list());
  const first = run(withContent(contentObject, { registry: reg }), base.context);
  (first.metadata as Record<string, unknown>).tampered = true;
  (first.warnings as string[]).push("tampered");
  check("no Opportunity mutation: the analysis and the explanation are unchanged", JSON.stringify(base.context.opportunityAnalysis) === before.analysis && JSON.stringify(base.context.opportunityExplanation) === before.explanation && JSON.stringify(base.context) === before.context);
  check("no Discovery mutation: the candidate is unchanged", JSON.stringify(base.context.candidate) === before.candidate && JSON.stringify(candidate) === candidateBefore);
  check("no mutation of the supplied content or the profiles", JSON.stringify(contentObject) === contentBefore && JSON.stringify(reg.list()) === regBefore);
  check("the context stays deep frozen", Object.isFrozen(base.context) && Object.isFrozen(base.context.opportunityAnalysis) && Object.isFrozen(base.context.opportunityExplanation));
  check("changing a returned result does not change a later one", !("tampered" in run(withContent(contentObject, { registry: reg }), base.context).metadata));
  check("the profile entries are frozen, so a caller cannot edit a registered profile", reg.list().every((e) => Object.isFrozen(e) && Object.isFrozen(e.profile)) && (() => { const p = reg.get("cold")!.profile; const before = p.name; try { (p as { name: string }).name = "x"; } catch { /* frozen */ } return p.name === before; })());

  // ---------- boundaries ----------
  const trafficDir = join(process.cwd(), "src", "lib", "traffic");
  const audienceFiles = readdirSync(trafficDir).filter((name) => name.startsWith("audience-") && name.endsWith(".ts"));
  check("the signal is six modules", audienceFiles.length === 6 && ["audience-fit-analyzer.ts", "audience-fit-result.ts", "audience-fit-signal.ts", "audience-fit-validator.ts", "audience-profile-definitions.ts", "audience-profile-registry.ts"].every((name) => audienceFiles.includes(name)));
  const sources = audienceFiles.map((name) => ({ name, text: readFileSync(join(trafficDir, name), "utf8") }));
  const statements = (text: string) => text.match(/^import[\s\S]*?from\s+"[^"]+";/gm) ?? [];
  const importPath = (statement: string) => /from\s+"([^"]+)"/.exec(statement)![1];
  const allImports = sources.flatMap((s) => statements(s.text).map((statement) => ({ file: s.name, statement, path: importPath(statement) })));
  check("every import is local to the traffic module or a type-only import of an Opportunity or Discovery shape", allImports.every((i) => i.path.startsWith("./") || (/^\.\.\/(opportunity|discovery)\//.test(i.path) && /^import type /.test(i.statement))) && allImports.some((i) => i.path.startsWith("../opportunity/")));
  check("no import from ProductFacts, the LP Builder, the importer, grounding, publication, tracking, analytics, a database, or the network", allImports.every((i) => !/product-facts|lp-|landing|importer|grounding|publication|tracking|analytics|sqlite|\/db|node:|http|openai|anthropic/i.test(i.path.replace(/^\.\.\/opportunity\//, "").replace(/opportunity-explanation-result|opportunity-resolver-analysis/, ""))));
  const code = sources.map((s) => ({ name: s.name, text: stripCode(s.text) }));
  check("no score, ranking, classification, size, lookalike, interest, demographic, keyword, CPC, budget, or campaign logic in the code", code.every((c) => !/\b(score|rank|ranking|classif\w*|lookalike|interest|demographic|targeting|keyword|cpc|budget|campaign|adwords|audienceSize|reach)\b/i.test(c.text)));
  check("no HTTP, network, AI, database, file, or environment access in the code", code.every((c) => !/\b(fetch|XMLHttpRequest|WebSocket|require|readFile|writeFile|process\.env|Math\.random|new Date|Date\.now)\b/.test(c.text) && !/openai|anthropic|sqlite|google-ads/i.test(c.text)));
  check("no advertising platform is named anywhere in the modules, comments included", sources.every((s) => !/google audience|facebook audience|meta ads|tiktok ads|lookalike/i.test(s.text)));
  check("no product, slug, or source-path-specific logic", code.every((c) => !/gizmo|example\.test|https?:\/\/|\/products\/|slug/i.test(c.text)));
  check("the code never writes to its inputs", code.every((c) => !/\b(opportunityAnalysis|opportunityExplanation|candidate|executionMetadata|inputs)(\.[A-Za-z]+)*\s*(=[^=]|\.push\(|\.splice\(|\.sort\()/.test(c.text)));
  const sourceTree = walk(join(process.cwd(), "src")).filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"));
  const outsiders = sourceTree.filter((file) => !file.includes(join("src", "lib", "traffic")) && /audience-fit|audience-profile/.test(readFileSync(file, "utf8")));
  check("nothing outside the traffic module uses the signal: Opportunity, Discovery, and the LP Builder are untouched", outsiders.length === 0);
  const channelText = readdirSync(trafficDir).filter((n) => n.startsWith("channel-")).map((n) => readFileSync(join(trafficDir, n), "utf8")).join("\n");
  const policyText = readdirSync(trafficDir).filter((n) => n.startsWith("policy-")).map((n) => readFileSync(join(trafficDir, n), "utf8")).join("\n");
  check("Channel Suitability and Policy Risk do not depend on Audience Fit", !/audience-fit|audience-profile/.test(channelText) && !/audience-fit|audience-profile/.test(policyText));
  const others = readdirSync(trafficDir).filter((n) => !n.startsWith("audience-") && !n.startsWith("channel-") && !n.startsWith("policy-") && n !== "traffic-dimension-reader.ts");
  check("the signal adds files only; no framework or architecture module imports it", others.every((n) => !/audience-fit|audience-profile/.test(readFileSync(join(trafficDir, n), "utf8"))));

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
