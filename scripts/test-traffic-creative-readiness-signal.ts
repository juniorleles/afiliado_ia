import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createOpportunityExecutionContext } from "../src/lib/opportunity/opportunity-resolver-context.ts";
import { createOpportunityResolver } from "../src/lib/opportunity/opportunity-resolver.ts";
import { createOpportunityExplanationEngine } from "../src/lib/opportunity/opportunity-explanation-engine.ts";
import { createSignalPipeline } from "../src/lib/opportunity/opportunity-signal-pipeline.ts";
import type { OpportunitySignalModule, SignalOutput } from "../src/lib/opportunity/opportunity-signal-contract.ts";
import { createEvidenceContext } from "../src/lib/opportunity/providers/evidence-provider-context.ts";
import {
  CREATIVE_ASSET_FAMILIES,
  CREATIVE_ASSET_KEYS,
  CREATIVE_DIMENSIONS,
  CREATIVE_FORMAT_FAMILIES,
  CREATIVE_FORMAT_KEYS,
  CREATIVE_INPUT_KEYS,
  CREATIVE_READINESS_SCOPE_NOTE,
  CREATIVE_REQUIREMENT_KINDS,
  CREATIVE_RESULT_KEYS,
  CREATIVE_STATUSES,
  CREATIVE_VERDICTS,
  creativeReadinessToSignalOutput,
} from "../src/lib/traffic/creative-readiness-result.ts";
import type { CreativeReadinessContent } from "../src/lib/traffic/creative-readiness-result.ts";
import type { CreativeAsset, CreativeFormat } from "../src/lib/traffic/creative-asset-definitions.ts";
import { DEFAULT_CREATIVE_ASSETS, DEFAULT_CREATIVE_FORMATS } from "../src/lib/traffic/creative-asset-definitions.ts";
import { CreativeAssetError, createCreativeAssetRegistry } from "../src/lib/traffic/creative-asset-registry.ts";
import {
  validateCreativeAsset,
  validateCreativeAssets,
  validateCreativeConfiguration,
  validateCreativeFormat,
  validateCreativeFormats,
  validateCreativeReadinessContent,
  validateCreativeReadinessContext,
  validateCreativeReadinessInputs,
  validateCreativeReadinessResult,
} from "../src/lib/traffic/creative-readiness-validator.ts";
import { analyzeCreativeReadiness } from "../src/lib/traffic/creative-readiness-analyzer.ts";
import {
  CREATIVE_READINESS_SIGNAL_ID,
  createCreativeReadinessSignal,
  createDefaultCreativeAssetRegistry,
  registerCreativeReadinessSignal,
} from "../src/lib/traffic/creative-readiness-signal.ts";
import type { CreativeReadinessSignalOptions } from "../src/lib/traffic/creative-readiness-signal.ts";
import { createChannelSuitabilitySignal, registerChannelSuitabilitySignal } from "../src/lib/traffic/channel-suitability-signal.ts";
import { createPolicyRiskSignal, registerPolicyRiskSignal } from "../src/lib/traffic/policy-risk-signal.ts";
import { createAudienceFitSignal, registerAudienceFitSignal } from "../src/lib/traffic/audience-fit-signal.ts";
import { createOfferStrategySignal, registerOfferStrategySignal } from "../src/lib/traffic/offer-strategy-signal.ts";
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
  FEATURES: "evid",
  PRICING: "evid",
  GUARANTEE: "evid",
  RETURNS: "evid",
  MANUFACTURER: "evid",
  FAQ: "evid",
  OFFER_COVERAGE: "lp",
  HERO_STRENGTH: "lp",
  FEATURE_COVERAGE: "lp",
  PRICING_COVERAGE: "lp",
  GUARANTEE_COVERAGE: "lp",
  FAQ_COVERAGE: "lp",
  INFORMATION_DENSITY: "lp",
  CTA_AVAILABILITY: "lp",
  PRESENTATION_READINESS: "lp",
  MEDIA_AVAILABILITY: "lp",
  OFFER_VISIBILITY: "intent",
  PRICE_VISIBILITY: "intent",
  UPSELL_POTENTIAL: "intent",
  BUYER_READINESS: "intent",
  CONSUMER_TRUST: "intent",
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
  const runResolver = await createOpportunityResolver({ signals, ...resolverClocks() } as never).run(opportunityContext);
  const analysis = JSON.parse(JSON.stringify(runResolver.analysis)) as Record<string, unknown>;
  options.mutate?.(analysis);
  const explanation = options.explain === false ? null : createOpportunityExplanationEngine({ now: tick() }).explain(runResolver.analysis).explanation;
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
const content = (over: Partial<CreativeReadinessContent> = {}): CreativeReadinessContent => ({ evidenceContext: null, landingPage: null, presentationPlan: null, manualOverrides: null, ...over }) as CreativeReadinessContent;
const PAGE = (): CreativeReadinessContent =>
  content({
    evidenceContext: { items: [evidenceItem("e1", "A desk lamp with a metal arm.")] },
    landingPage: {
      sections: [
        section("hero", "hero", ["A durable blue desk lamp."]),
        section("feat", "features", ["Adjustable arm."]),
        section("media", "media", ["photo"]),
        section("prod", "product-images", ["photo"]),
        section("life", "lifestyle", ["scene"]),
        section("proof", "testimonials", ["a reviewer"]),
        section("act", "cta", ["See the offer."]),
        section("faq", "faq", ["How tall is it?"]),
        section("by", "manufacturer", ["A fictional maker."]),
        section("vid", "video", ["clip"]),
      ],
    },
    presentationPlan: {
      heroStrategy: "BENEFIT",
      sectionVisibility: { hero: true, features: true, pricing: true, faq: true, manufacturer: true, closing: true },
      sectionVariants: { pricing: "COMPARISON" },
    },
    manualOverrides: [],
  });

const none = Object.fromEntries(CREATIVE_DIMENSIONS.map((d) => [d, "NOT_APPLICABLE"])) as CreativeFormat["requirements"];
const zetaAsset = (over: Record<string, unknown> = {}): CreativeAsset =>
  ({
    id: "zeta-headline",
    name: "Zeta Headline",
    description: "A fictional asset for tests.",
    dimension: "HEADLINE_AVAILABILITY",
    family: "COPY",
    status: "DEFINED",
    enabled: true,
    sources: { opportunityDimensions: ["HERO_STRENGTH"], sectionKinds: [], evidenceFields: [], planSections: [], planHeroStrategies: [], planVariants: [] },
    metadata: {},
    ...over,
  }) as CreativeAsset;
const zetaFormat = (over: Record<string, unknown> = {}): CreativeFormat =>
  ({
    id: "zeta-text",
    name: "Zeta Text",
    description: "A fictional format for tests.",
    family: "TEXT",
    status: "DEFINED",
    enabled: true,
    requirements: { ...none, HEADLINE_AVAILABILITY: "STRUCTURAL" },
    metadata: {},
    ...over,
  }) as CreativeFormat;

const signal = createCreativeReadinessSignal({ now: zero });
const withContent = (value: CreativeReadinessContent | null, options: CreativeReadinessSignalOptions = {}) => createCreativeReadinessSignal({ now: zero, content: () => value, ...options });
const run = (module: TrafficSignalModule, context: TrafficSignalContext) => module.analyze(context, {} as never);
const metaOf = (output: { metadata: Record<string, unknown> }) => output.metadata;
const listOf = (output: { metadata: Record<string, unknown> }, key: string) => String(output.metadata[key] ?? "").split(",").filter((part) => part !== "");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));
}
const stripCode = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/`(?:\\.|[^`\\])*`/g, '""').replace(/"(?:\\.|[^"\\\n])*"/g, '""').replace(/'(?:\\.|[^'\\\n])*'/g, '""').replace(/\/\/.*$/gm, "");

async function main() {
  const base = await scenario();
  const definedFormatIds = DEFAULT_CREATIVE_FORMATS.filter((s) => s.id !== "future").map((s) => s.id).sort();

  check("fourteen creative dimensions, in the specified order", same(CREATIVE_DIMENSIONS, ["HEADLINE_AVAILABILITY", "HOOK_AVAILABILITY", "PRIMARY_BENEFITS", "VISUAL_ASSETS", "PRODUCT_IMAGES", "LIFESTYLE_IMAGES", "SOCIAL_PROOF", "TESTIMONIALS", "CTA_READINESS", "OFFER_CLARITY", "BRAND_ASSETS", "VIDEO_POTENTIAL", "COMPARISON_POTENTIAL", "EDUCATIONAL_CONTENT"]));
  check("four verdicts, none of them a recommendation", same(CREATIVE_VERDICTS, ["COMPATIBLE", "INCOMPATIBLE", "NOT_ASSESSED", "NOT_APPLICABLE"]) && same(CREATIVE_REQUIREMENT_KINDS, ["STRUCTURAL", "CONTEXTUAL", "NOT_APPLICABLE"]));
  check("the result carries exactly the specified fields", same([...CREATIVE_RESULT_KEYS].sort(), ["availableAssets", "confidence", "executionTime", "metadata", "missingAssets", "status", "supportedFormats", "unsupportedFormats", "warnings"]));
  check("asset and format families, statuses, and keys", CREATIVE_ASSET_FAMILIES.includes("MOTION") && CREATIVE_FORMAT_FAMILIES.includes("FUTURE") && CREATIVE_STATUSES.includes("PLACEHOLDER") && !CREATIVE_ASSET_KEYS.some((k) => /score|classif|recommend/i.test(k)) && !CREATIVE_FORMAT_KEYS.some((k) => /score|classif|recommend/i.test(k)));
  check("the scope note says it is no ranking, score, or recommendation, and generates nothing", /not a ranking, a score, or a recommendation/.test(CREATIVE_READINESS_SCOPE_NOTE) && /generates copy, images, or video/.test(CREATIVE_READINESS_SCOPE_NOTE));

  check("fourteen built-in assets, one per dimension, named as specified", DEFAULT_CREATIVE_ASSETS.length === 14 && same(DEFAULT_CREATIVE_ASSETS.map((a) => a.dimension), CREATIVE_DIMENSIONS) && same(DEFAULT_CREATIVE_ASSETS.map((a) => a.name), ["Headline", "Hook", "Primary Benefits", "Visual Assets", "Product Images", "Lifestyle Images", "Social Proof", "Testimonials", "Call To Action", "Offer Clarity", "Brand Assets", "Video Potential", "Comparison Potential", "Educational Content"]));
  check("eight built-in formats, named as specified", same(DEFAULT_CREATIVE_FORMATS.map((f) => f.name), ["Search Text", "Display Banner", "Native Ads", "Video", "Short Video", "Image Ads", "Carousel", "Future Formats"]));
  check("asset and format ids are unique and the definitions pass their validators", new Set(DEFAULT_CREATIVE_ASSETS.map((a) => a.id)).size === 14 && new Set(DEFAULT_CREATIVE_FORMATS.map((f) => f.id)).size === 8 && validateCreativeAssets(DEFAULT_CREATIVE_ASSETS).length === 0 && validateCreativeFormats(DEFAULT_CREATIVE_FORMATS).length === 0);
  check("the assets and formats are deep frozen", DEFAULT_CREATIVE_ASSETS.every((a) => Object.isFrozen(a) && Object.isFrozen(a.sources)) && DEFAULT_CREATIVE_FORMATS.every((f) => Object.isFrozen(f) && Object.isFrozen(f.requirements)));
  check("future formats are a placeholder and no other format is", DEFAULT_CREATIVE_FORMATS.filter((f) => f.status === "PLACEHOLDER").map((f) => f.id).join() === "future");
  check("every asset has sources, and both requirement kinds are used", DEFAULT_CREATIVE_ASSETS.every((a) => Array.isArray(a.sources.opportunityDimensions)) && DEFAULT_CREATIVE_FORMATS.some((f) => CREATIVE_DIMENSIONS.some((d) => f.requirements[d] === "STRUCTURAL")) && DEFAULT_CREATIVE_FORMATS.some((f) => CREATIVE_DIMENSIONS.some((d) => f.requirements[d] === "CONTEXTUAL")));
  check("the built-in tables cite no advertising platform", !/google|facebook|lookalike|adwords/i.test(JSON.stringify(DEFAULT_CREATIVE_ASSETS) + JSON.stringify(DEFAULT_CREATIVE_FORMATS)));
  check("a default registry holds the fourteen assets, all enabled", (() => { const r = createDefaultCreativeAssetRegistry(); return r.count() === 14 && r.list().every((e) => e.enabled); })());

  check("Invalid Creative Definition: a non-object asset is rejected", [null, undefined, "x", 5, []].every((v) => has(validateCreativeAsset(v), /an asset must be an object/)));
  check("a valid asset passes", validateCreativeAsset(zetaAsset()).length === 0);
  check("Invalid Creative Definition: id, name, description, family, status, dimension, and enabled are checked", has(validateCreativeAsset(zetaAsset({ id: "Bad Id" })), /id must be/) && has(validateCreativeAsset(zetaAsset({ name: " " })), /name must be/) && has(validateCreativeAsset(zetaAsset({ description: 5 })), /description must be/) && has(validateCreativeAsset(zetaAsset({ family: "NOPE" })), /family is not supported/) && has(validateCreativeAsset(zetaAsset({ status: "NOPE" })), /status is not supported/) && has(validateCreativeAsset(zetaAsset({ dimension: "NOPE" })), /dimension is not a creative dimension/) && has(validateCreativeAsset(zetaAsset({ enabled: "yes" })), /enabled must be/));
  check("Invalid Creative Definition: an asset is metadata only, so a score or recommendation field is rejected", ["score", "recommendation", "file"].every((field) => has(validateCreativeAsset(zetaAsset({ [field]: 1 })), new RegExp(`unexpected field "${field}"`))));
  check("Invalid Metadata: nested asset metadata is rejected", [{ a: { b: 1 } }, { a: [1] }, null].every((metadata) => has(validateCreativeAsset(zetaAsset({ metadata })), /Invalid metadata/)));
  check("Duplicate Assets: a repeated id in a list is rejected", has(validateCreativeAssets([zetaAsset(), zetaAsset()]), /Duplicate asset "zeta-headline"/) && validateCreativeAssets([zetaAsset(), zetaAsset({ id: "omega-headline", dimension: "HOOK_AVAILABILITY" })]).length === 0);
  check("Duplicate Assets: two assets of the same dimension are rejected", has(validateCreativeAssets([zetaAsset(), zetaAsset({ id: "omega-headline" })]), /dimension "HEADLINE_AVAILABILITY"/));

  check("Invalid Creative Definition: a non-object format is rejected", [null, undefined, "x", 5, []].every((v) => has(validateCreativeFormat(v), /a format must be an object/)));
  check("a valid format passes", validateCreativeFormat(zetaFormat()).length === 0);
  check("Invalid Creative Definition: format requirements must cover every dimension", has(validateCreativeFormat(zetaFormat({ requirements: null })), /requirements must be an object/) && has(validateCreativeFormat(zetaFormat({ requirements: { ...zetaFormat().requirements, EXTRA: "STRUCTURAL" } })), /not a creative dimension/) && has(validateCreativeFormat(zetaFormat({ requirements: { ...zetaFormat().requirements, HEADLINE_AVAILABILITY: "NOPE" } })), /STRUCTURAL, CONTEXTUAL, or NOT_APPLICABLE/));
  check("Duplicate Formats: a repeated id in a list is rejected", has(validateCreativeFormats([zetaFormat(), zetaFormat()]), /Duplicate format "zeta-text"/) && validateCreativeFormats([zetaFormat(), zetaFormat({ id: "omega-text" })]).length === 0);

  const registry = createCreativeAssetRegistry();
  const original = zetaAsset();
  const entry = registry.register(original);
  check("Register Asset: returns a frozen entry, enabled by the asset's own flag", entry.id === "zeta-headline" && entry.enabled === true && Object.isFrozen(entry) && Object.isFrozen(entry.asset) && registry.count() === 1);
  (original as { name: string }).name = "tampered";
  check("Register Asset: the registry holds a copy", registry.get("zeta-headline")!.asset.name === "Zeta Headline");
  check("Duplicate Assets: a second registration is rejected", (() => { try { registry.register(zetaAsset()); return false; } catch (e) { return e instanceof CreativeAssetError && /Duplicate asset/.test(e.issues.map((i) => i.message).join()); } })() && registry.count() === 1);
  check("Invalid Creative Definition: an invalid asset is not registered", (() => { try { registry.register(zetaAsset({ id: "Bad", family: "NO" })); return false; } catch (e) { return e instanceof CreativeAssetError && e.issues.length >= 2 && e.name === "CreativeAssetError"; } })());
  check("Validate Asset: reports problems and a duplicate id, and changes nothing", registry.validate(zetaAsset()).length === 1 && has(registry.validate(zetaAsset()), /Duplicate asset/) && registry.validate(zetaAsset({ id: "other-headline", dimension: "HOOK_AVAILABILITY" })).length === 0 && registry.count() === 1);
  check("Disable Asset and Enable Asset change only the enabled state", registry.disable("zeta-headline").enabled === false && registry.enable("zeta-headline").enabled === true);
  check("enabling an unknown asset is rejected", (() => { try { registry.enable("nope"); return false; } catch (e) { return e instanceof CreativeAssetError && /Unknown asset/.test(e.message); } })());
  registry.register(zetaAsset({ id: "alpha-headline", name: "Alpha", dimension: "HOOK_AVAILABILITY" }));
  check("List Assets is sorted by id", registry.list().map((e) => e.id).join() === "alpha-headline,zeta-headline");
  check("a registry started from a duplicate list is rejected", (() => { try { createCreativeAssetRegistry([zetaAsset(), zetaAsset()]); return false; } catch (e) { return e instanceof CreativeAssetError; } })());
  check("Duplicate Assets: a second asset of the same dimension is rejected at registration", (() => { try { registry.register(zetaAsset({ id: "copy-headline" })); return false; } catch (e) { return e instanceof CreativeAssetError && /HEADLINE_AVAILABILITY/.test(e.issues.map((i) => i.message).join()); } })());

  check("signal identity and contract", signal.id === CREATIVE_READINESS_SIGNAL_ID && signal.id === "creative-readiness" && signal.version === "1.0.0" && signal.category === "CREATIVE" && signal.enabled === true && signal.priority === 50 && validateTrafficSignalModule(signal).length === 0);
  check("the signal depends on no other signal", signal.dependencies.requires.length === 0 && signal.dependencies.optional.length === 0 && signal.dependencies.conflicts.length === 0);
  check("enabled and priority can be set", createCreativeReadinessSignal({ enabled: false, priority: 5 }).enabled === false && createCreativeReadinessSignal({ priority: 5 }).priority === 5);

  const host = createTrafficModuleRegistry();
  const hostEntry = registerCreativeReadinessSignal(host, { now: zero });
  check("registration returns the entry, enabled, in the registry", hostEntry.id === "creative-readiness" && hostEntry.enabled && host.count() === 1 && host.get("creative-readiness")?.module.category === "CREATIVE");
  check("registering it twice is rejected as a duplicate signal id", (() => { try { registerCreativeReadinessSignal(host, { now: zero }); return false; } catch (e) { return e instanceof TrafficFrameworkError && /already registered/.test(e.message + e.issues.map((i) => i.message).join()); } })());
  const hostPipeline = createTrafficSignalPipeline({ now: zero });
  registerCreativeReadinessSignal(hostPipeline, { now: zero });
  check("registration works on a pipeline", hostPipeline.validateDependencies().length === 0 && hostPipeline.resolveExecutionOrder().order.join() === "creative-readiness");

  const out = run(signal, base.context);
  check("a well-evidenced context COMPLETES", out.status === "COMPLETED" && out.errors.length === 0 && validateTrafficSignalOutput(out).length === 0);
  check("every defined format is supported and only the placeholder is not", same(listOf(out, "supportedFormats"), definedFormatIds) && same(listOf(out, "unsupportedFormats"), ["future"]));
  check("the placeholder is unsupported because it is a placeholder", /placeholder/.test(String(metaOf(out)["unavailable.future"])) && /UNAVAILABLE/.test(String(metaOf(out)["reason.future"])));
  check("video and lifestyle stay unknown without those sources, so confidence is below 1", metaOf(out)["need.VIDEO_POTENTIAL"] === "UNKNOWN" && metaOf(out)["need.LIFESTYLE_IMAGES"] === "UNKNOWN" && metaOf(out)["need.TESTIMONIALS"] === "UNKNOWN" && (out.confidence as number) < 1);
  check("generic media does not establish video potential", metaOf(out)["need.VISUAL_ASSETS"] === "SATISFIED" && metaOf(out)["need.PRODUCT_IMAGES"] === "SATISFIED" && metaOf(out)["need.VIDEO_POTENTIAL"] === "UNKNOWN" && listOf(out, "supportedFormats").includes("video") && !listOf(out, "availableAssets").includes("video-potential") && !listOf(out, "missingAssets").includes("video-potential"));
  check("available assets are the ones established, missing assets are only ABSENT, and unknown is neither", listOf(out, "availableAssets").includes("headline") && listOf(out, "availableAssets").includes("cta") && !listOf(out, "missingAssets").includes("lifestyle-images") && !listOf(out, "availableAssets").includes("lifestyle-images") && same(listOf(out, "availableAssets"), [...listOf(out, "availableAssets")].sort()) && same(listOf(out, "missingAssets"), [...listOf(out, "missingAssets")].sort()));
  check("all fourteen dimensions have a verdict for search-text", CREATIVE_DIMENSIONS.every((d) => CREATIVE_VERDICTS.includes(String(metaOf(out)[`verdict.search-text.${d}`]) as never)));
  check("search text does not require visuals", metaOf(out)["verdict.search-text.PRODUCT_IMAGES"] === "NOT_APPLICABLE" && metaOf(out)["verdict.search-text.VIDEO_POTENTIAL"] === "NOT_APPLICABLE");
  check("the metadata holds counts, the scope note, and the Opportunity references", metaOf(out).assetCount === 14 && metaOf(out).formatCount === 8 && metaOf(out).supportedCount === 7 && metaOf(out).unsupportedCount === 1 && metaOf(out).scopeNote === CREATIVE_READINESS_SCOPE_NOTE && metaOf(out).opportunityAnalysisId === (base.analysis as { analysisId: string }).analysisId && metaOf(out).candidateId === "cand-1");
  check("every creative dimension is restated in the metadata", CREATIVE_DIMENSIONS.every((d) => typeof metaOf(out)[`need.${d}`] === "string") && metaOf(out)["need.HEADLINE_AVAILABILITY"] === "SATISFIED" && metaOf(out)["need.CTA_READINESS"] === "SATISFIED");
  check("execution metadata is passed through under its own key", metaOf(out)["execution.run"] === "t1" && metaOf(out)["execution.attempt"] === 2);
  check("a well-evidenced context without content warns only that content was not supplied", out.warnings.length === 1 && /No content was supplied/.test(out.warnings[0]));
  check("the output metadata is flat", Object.values(metaOf(out)).every((v) => v === null || ["string", "number", "boolean"].includes(typeof v)));

  const noMedia = run(signal, (await scenario({ states: { MEDIA_AVAILABILITY: "MISSING" } })).context);
  check("missing media excludes image-led formats and not search text", ["display-banner", "image-ads", "carousel"].every((id) => listOf(noMedia, "unsupportedFormats").includes(id)) && listOf(noMedia, "supportedFormats").includes("search-text") && listOf(noMedia, "missingAssets").includes("visual-assets") && listOf(noMedia, "missingAssets").includes("product-images"));
  check("a contextual visual need reported missing is NOT_ASSESSED and excludes nothing", metaOf(noMedia)["verdict.native-ads.VISUAL_ASSETS"] === "NOT_ASSESSED" && listOf(noMedia, "supportedFormats").includes("native-ads"));
  const noHero = run(signal, (await scenario({ states: { HERO_STRENGTH: "MISSING" } })).context);
  check("a missing headline excludes formats that need it structurally", ["search-text", "display-banner", "native-ads", "image-ads"].every((id) => listOf(noHero, "unsupportedFormats").includes(id)) && listOf(noHero, "supportedFormats").includes("carousel") && listOf(noHero, "missingAssets").includes("headline"));
  const noCta = run(signal, (await scenario({ states: { CTA_AVAILABILITY: "MISSING", PRESENTATION_READINESS: "MISSING" } })).context);
  check("missing call-to-action readiness excludes formats that need it structurally", ["search-text", "display-banner"].every((id) => listOf(noCta, "unsupportedFormats").includes(id)) && listOf(noCta, "supportedFormats").includes("native-ads") && listOf(noCta, "missingAssets").includes("cta"));
  const weakHero = run(signal, (await scenario({ states: { HERO_STRENGTH: "WEAK" } })).context);
  check("a need reported weak is only partly evidenced: it does not exclude, and a warning says so", metaOf(weakHero)["need.HEADLINE_AVAILABILITY"] === "PARTIAL" && listOf(weakHero, "supportedFormats").includes("search-text") && listOf(weakHero, "availableAssets").includes("headline") && weakHero.warnings.some((w) => /partly evidenced/.test(w) && /HEADLINE_AVAILABILITY/.test(w)));
  const unknownFaq = run(signal, (await scenario({ states: { FAQ: null, FAQ_COVERAGE: null, SUPPORTING_CONTENT: null, INFORMATION_DENSITY: null } })).context);
  check("a need nothing reported on is UNKNOWN, never ABSENT, and does not exclude", metaOf(unknownFaq)["need.EDUCATIONAL_CONTENT"] === "UNKNOWN" && listOf(unknownFaq, "supportedFormats").includes("native-ads") && metaOf(unknownFaq)["verdict.native-ads.EDUCATIONAL_CONTENT"] === "NOT_ASSESSED" && !listOf(unknownFaq, "missingAssets").includes("educational-content") && (unknownFaq.confidence as number) < 1);

  const SECRET = "ZETA-PHRASE-77";
  const noMediaPage = await scenario({ states: { MEDIA_AVAILABILITY: "MISSING" } });
  const pageRestores = run(withContent(PAGE()), noMediaPage.context);
  check("a visible mapped landing-page section establishes the dimension without reading the words", metaOf(pageRestores)["need.VISUAL_ASSETS"] === "SATISFIED" && listOf(pageRestores, "supportedFormats").includes("display-banner") && /VISUAL_ASSETS/.test(String(metaOf(pageRestores).structureEstablished)));
  check("the supplied text is never copied into the result", !JSON.stringify(pageRestores).includes("desk lamp") && !JSON.stringify(run(withContent(content({ landingPage: { sections: [section("media", "media", [SECRET])] } })), noMediaPage.context)).includes(SECRET));
  const hiddenMedia = run(withContent(content({ landingPage: { sections: [section("media", "media", ["photo"], { visible: false })] } })), noMediaPage.context);
  check("a hidden section is not on the page and establishes nothing", metaOf(hiddenMedia)["need.VISUAL_ASSETS"] === "ABSENT" && listOf(hiddenMedia, "unsupportedFormats").includes("display-banner"));
  const imageField = run(withContent(content({ evidenceContext: { items: [evidenceItem("e9", "whatever words", { field: "image" })] } })), noMediaPage.context);
  check("non-empty text on a mapped field establishes the dimension; the words are not classified", metaOf(imageField)["need.VISUAL_ASSETS"] === "SATISFIED");
  const overridden = run(withContent(content({ evidenceContext: { items: [evidenceItem("e3", "a photo", { field: "image" })] }, manualOverrides: [{ field: "image", value: "   " }] })), noMediaPage.context);
  check("an effective override supersedes the item that states the same field", metaOf(overridden)["need.VISUAL_ASSETS"] === "ABSENT" && metaOf(overridden).supersededCount === 1);
  const overrideRestores = run(withContent(content({ evidenceContext: { items: [evidenceItem("e3", "", { field: "image" })] }, manualOverrides: [{ field: "image", value: "restored" }] })), noMediaPage.context);
  check("an override's effective text establishes the mapped dimension", metaOf(overrideRestores)["need.VISUAL_ASSETS"] === "SATISFIED");
  const videoFromPage = run(withContent(PAGE()), base.context);
  check("a video section establishes video potential, and every asset on the page is available", metaOf(videoFromPage)["need.VIDEO_POTENTIAL"] === "SATISFIED" && listOf(videoFromPage, "availableAssets").includes("video-potential") && listOf(videoFromPage, "availableAssets").includes("lifestyle-images") && listOf(videoFromPage, "availableAssets").includes("testimonials") && videoFromPage.confidence === 1);

  const noHeroPlan = await scenario({ states: { HERO_STRENGTH: "MISSING" } });
  const identityPlan = run(withContent(content({ presentationPlan: { heroStrategy: "IDENTITY", sectionVisibility: null, sectionVariants: null } })), noHeroPlan.context);
  check("a presentation-plan hero strategy establishes headline without executing the plan", metaOf(identityPlan)["need.HEADLINE_AVAILABILITY"] === "SATISFIED" && listOf(identityPlan, "availableAssets").includes("headline") && metaOf(identityPlan)["need.HOOK_AVAILABILITY"] === "ABSENT");
  const benefitPlan = run(withContent(content({ presentationPlan: { heroStrategy: "BENEFIT", sectionVisibility: null, sectionVariants: null } })), noHeroPlan.context);
  check("a BENEFIT hero strategy establishes both headline and hook", metaOf(benefitPlan)["need.HEADLINE_AVAILABILITY"] === "SATISFIED" && metaOf(benefitPlan)["need.HOOK_AVAILABILITY"] === "SATISFIED");
  const noPricePlan = await scenario({ states: { PRICING_COVERAGE: "MISSING" } });
  const comparisonPlan = run(withContent(content({ presentationPlan: { heroStrategy: null, sectionVisibility: null, sectionVariants: { pricing: "COMPARISON" } } })), noPricePlan.context);
  check("a comparison variant on the presentation plan establishes comparison potential", metaOf(comparisonPlan)["need.COMPARISON_POTENTIAL"] === "SATISFIED" && listOf(comparisonPlan, "availableAssets").includes("comparison-potential"));
  const visiblePlan = run(withContent(content({ presentationPlan: { heroStrategy: null, sectionVisibility: { features: true, faq: true }, sectionVariants: null } })), (await scenario({ states: { FEATURES: "MISSING", FEATURE_COVERAGE: "MISSING", FAQ: "MISSING", FAQ_COVERAGE: "MISSING", INFORMATION_DENSITY: "MISSING" } })).context);
  check("a visible plan section establishes benefits and educational content", metaOf(visiblePlan)["need.PRIMARY_BENEFITS"] === "SATISFIED" && metaOf(visiblePlan)["need.EDUCATIONAL_CONTENT"] === "SATISFIED");

  const onlyTwo = run(signal, (await scenario({ configuration: { [CREATIVE_INPUT_KEYS.formatsEnabled]: "search-text, native-ads" } })).context);
  check("an enabled format list makes every other format unavailable", same(listOf(onlyTwo, "supportedFormats"), ["native-ads", "search-text"]) && onlyTwo.metadata["unavailable.carousel"] === "the configuration enables other formats only");
  const disabledOne = run(signal, (await scenario({ configuration: { [CREATIVE_INPUT_KEYS.formatsDisabled]: "carousel" } })).context);
  check("a disabled format list removes only the named format", same(listOf(disabledOne, "unsupportedFormats"), ["carousel", "future"]) && disabledOne.metadata["unavailable.carousel"] === "the configuration disables it");
  const enableFuture = run(signal, (await scenario({ configuration: { [CREATIVE_INPUT_KEYS.formatsEnabled]: "future,search-text" } })).context);
  check("enabling the placeholder does not make it available", listOf(enableFuture, "unsupportedFormats").includes("future") && listOf(enableFuture, "supportedFormats").join() === "search-text");
  const unknownId = run(signal, (await scenario({ configuration: { [CREATIVE_INPUT_KEYS.formatsDisabled]: "nonexistent-net" } })).context);
  check("a format id with no definition is a warning, not a failure", unknownId.status === "COMPLETED" && unknownId.warnings.some((w) => /"nonexistent-net", which has no definition/.test(w)));
  const onlyHeadline = run(signal, (await scenario({ configuration: { [CREATIVE_INPUT_KEYS.assetsEnabled]: "headline, cta" } })).context);
  check("an enabled asset list assesses only those assets", same(listOf(onlyHeadline, "availableAssets"), ["cta", "headline"]) && onlyHeadline.warnings.some((w) => /Disabled and not assessed as assets/.test(w)));

  const live = createDefaultCreativeAssetRegistry();
  const liveSignal = createCreativeReadinessSignal({ now: zero, registry: live });
  const liveBefore = run(liveSignal, base.context);
  live.disable("headline");
  const liveDisabled = run(liveSignal, base.context);
  check("Disable Asset: a disabled asset is omitted from both lists and a warning says so", !listOf(liveDisabled, "availableAssets").includes("headline") && !listOf(liveDisabled, "missingAssets").includes("headline") && liveDisabled.warnings.some((w) => /Disabled and not assessed as assets: headline/.test(w)) && metaOf(liveDisabled).assetCount === 13);
  live.enable("headline");
  check("Enable Asset: the same signal assesses the asset again", stable(run(liveSignal, base.context)) === stable(liveBefore));
  const customOut = run(createCreativeReadinessSignal({ now: zero, registry: createCreativeAssetRegistry([zetaAsset()]), formats: [zetaFormat()] }), base.context);
  check("a fictional asset and format work through the same engine", customOut.status === "COMPLETED" && same(listOf(customOut, "availableAssets"), ["zeta-headline"]) && same(listOf(customOut, "supportedFormats"), ["zeta-text"]) && metaOf(customOut)["verdict.zeta-text.HEADLINE_AVAILABILITY"] === "COMPATIBLE");
  const emptySet = run(createCreativeReadinessSignal({ now: zero, registry: createCreativeAssetRegistry(), formats: [] }), base.context);
  check("an empty creative set has nothing to assess", emptySet.status === "COMPLETED" && emptySet.confidence === null && metaOf(emptySet).assetCount === 0 && metaOf(emptySet).formatCount === 0);

  const noExplanation = await scenario({ explain: false });
  const noExOut = run(signal, noExplanation.context);
  check("without an explanation only availability is established, with a warning", noExOut.status === "COMPLETED" && metaOf(noExOut).explanationSupplied === false && metaOf(noExOut).dimensionsRead === 0 && noExOut.warnings.some((w) => /No Opportunity explanation/.test(w)));
  check("without an explanation nothing is excluded for evidence except the placeholder", same(listOf(noExOut, "unsupportedFormats"), ["future"]) && (noExOut.confidence as number) < 1);
  const partial = run(signal, (await scenario({ mutate: (analysis) => { analysis.status = "PARTIAL"; } })).context);
  check("a PARTIAL Opportunity analysis can be read, and says so", partial.status === "COMPLETED" && partial.warnings.some((w) => /PARTIAL/.test(w)));
  const failedLp = await scenario({ mutate: (analysis) => { (analysis.signalResults as Array<{ signalId: string; status: string }>).find((r) => r.signalId === "lp")!.status = "FAILED"; } });
  const failedLpOut = run(signal, failedLp.context);
  check("dimensions of a signal that did not complete are not read", (failedLpOut.metadata.dimensionsRead as number) === 12 && metaOf(failedLpOut)["need.HEADLINE_AVAILABILITY"] === "UNKNOWN");

  const noAnalysis = createTrafficSignalContext({ candidate });
  check("Missing Context: the signal does not support the analysis", signal.supportsAnalysis(noAnalysis) === false);
  check("Missing Context: the validator rejects it", has(signal.validate(noAnalysis), /Missing context/) && has(validateCreativeReadinessContext(null), /Missing context/) && has(validateCreativeReadinessContext({ ...base.context, opportunityAnalysis: null }), /Missing context: an Opportunity analysis/));
  const forced = run(signal, noAnalysis);
  check("Missing Context: analyze FAILS with the reason and no formats", forced.status === "FAILED" && forced.errors.some((e) => /Missing context/.test(e)) && forced.confidence === null && Object.keys(forced.metadata).length === 0);
  const skipped = await (async () => { const p = createTrafficSignalPipeline({ now: zero }); registerCreativeReadinessSignal(p, { now: zero }); return p.run(noAnalysis); })();
  check("Missing Context: in a pipeline the signal is SKIPPED", skipped.results.length === 1 && skipped.results[0].status === "SKIPPED");
  check("Invalid Context: an analysis that failed or was refused cannot be read", ["FAILED", "REFUSED"].every((status) => has(validateCreativeReadinessContext({ ...base.context, opportunityAnalysis: { ...base.context.opportunityAnalysis, status } }), /only a COMPLETED or PARTIAL analysis can be read/)));
  const failedAnalysis = await scenario({ mutate: (analysis) => { analysis.status = "FAILED"; } });
  check("Invalid Context: analyze FAILS for an analysis that did not complete", run(signal, failedAnalysis.context).status === "FAILED");
  check("Invalid Context: a format both enabled and disabled is rejected", has(validateCreativeConfiguration({ [CREATIVE_INPUT_KEYS.formatsEnabled]: "search-text,carousel", [CREATIVE_INPUT_KEYS.formatsDisabled]: "carousel" }), /both enabled and disabled/));
  const bothOut = run(signal, (await scenario({ configuration: { [CREATIVE_INPUT_KEYS.formatsEnabled]: "search-text", [CREATIVE_INPUT_KEYS.formatsDisabled]: "search-text" } })).context);
  check("Invalid Context: analyze FAILS for a contradicting configuration", bothOut.status === "FAILED" && bothOut.errors.some((e) => /both enabled and disabled/.test(e)));
  check("Duplicate Formats: a format listed twice in the enabled list is rejected", has(validateCreativeConfiguration({ [CREATIVE_INPUT_KEYS.formatsEnabled]: "search-text,carousel,search-text" }), /Duplicate format "search-text"/));
  const dupFormatOut = run(signal, (await scenario({ configuration: { [CREATIVE_INPUT_KEYS.formatsEnabled]: "search-text,search-text" } })).context);
  check("Duplicate Formats: analyze FAILS for a duplicate in the configuration", dupFormatOut.status === "FAILED" && dupFormatOut.errors.some((e) => /Duplicate format "search-text"/.test(e)));
  check("Duplicate Assets: an asset listed twice in the enabled list is rejected", has(validateCreativeConfiguration({ [CREATIVE_INPUT_KEYS.assetsEnabled]: "headline,cta,headline" }), /Duplicate asset "headline"/));
  const dupAssetOut = run(signal, (await scenario({ configuration: { [CREATIVE_INPUT_KEYS.assetsEnabled]: "headline,headline" } })).context);
  check("Duplicate Assets: analyze FAILS for a duplicate asset in the configuration", dupAssetOut.status === "FAILED" && dupAssetOut.errors.some((e) => /Duplicate asset "headline"/.test(e)));
  const dupRegistry = { ...createDefaultCreativeAssetRegistry(), list: () => { const e = { id: "headline", asset: DEFAULT_CREATIVE_ASSETS[0], enabled: true }; return [e, e]; } } as never;
  check("Duplicate Assets: the signal FAILS if its registry lists an asset twice", run(createCreativeReadinessSignal({ now: zero, registry: dupRegistry }), base.context).status === "FAILED");
  const dupFormats = run(createCreativeReadinessSignal({ now: zero, formats: [zetaFormat(), zetaFormat()] }), base.context);
  check("Duplicate Formats: the signal FAILS if its format list repeats an id", dupFormats.status === "FAILED" && dupFormats.errors.some((e) => /Duplicate format/.test(e)));
  const badRegistry = { ...createDefaultCreativeAssetRegistry(), list: () => [{ id: "headline", asset: { ...DEFAULT_CREATIVE_ASSETS[0], family: "NOPE" }, enabled: true }] } as never;
  check("Invalid Creative Definition: the signal FAILS if its registry holds an invalid asset", run(createCreativeReadinessSignal({ now: zero, registry: badRegistry }), base.context).status === "FAILED");
  check("Invalid Metadata: nested configuration is rejected", has(validateCreativeConfiguration({ a: { b: 1 } }), /Invalid metadata/));
  const badInputs = (over: Record<string, unknown>) => validateCreativeReadinessInputs({ opportunityAnalysis: base.context.opportunityAnalysis, opportunityExplanation: base.context.opportunityExplanation, executionMetadata: {}, configuration: {}, assets: DEFAULT_CREATIVE_ASSETS, formats: DEFAULT_CREATIVE_FORMATS, content: null, ...over });
  check("Invalid Metadata: nested execution metadata is rejected", has(badInputs({ executionMetadata: { a: { b: 1 } } }), /Invalid metadata: "executionMetadata"/) && badInputs({}).length === 0);
  check("content: none is valid, and a complete one is valid", validateCreativeReadinessContent(null).length === 0 && validateCreativeReadinessContent(PAGE()).length === 0);
  check("content: a presentation plan is required as a key, and unexpected plan fields are rejected", has(validateCreativeReadinessContent({ evidenceContext: null, landingPage: null, manualOverrides: null }), /"presentationPlan" is missing/) && has(validateCreativeReadinessContent({ evidenceContext: null, landingPage: null, presentationPlan: { heroStrategy: null, sectionVisibility: null, sectionVariants: null, execute: true }, manualOverrides: null }), /unexpected field "execute"/));
  check("content: overrides carry effective values only", has(validateCreativeReadinessContent({ evidenceContext: null, landingPage: null, presentationPlan: null, manualOverrides: [{ field: "a", value: "x", id: 7 }] }), /unexpected field "id"/));
  const throwingProvider = run(createCreativeReadinessSignal({ now: zero, content: () => { throw new Error("provider exploded"); } }), base.context);
  check("a provider that throws makes the signal FAIL, never a guess", throwingProvider.status === "FAILED" && throwingProvider.errors.some((e) => /provider exploded/.test(e)));

  const goodResult = analyzeCreativeReadiness({ opportunityAnalysis: base.context.opportunityAnalysis!, opportunityExplanation: base.context.opportunityExplanation, executionMetadata: {}, configuration: {}, assets: DEFAULT_CREATIVE_ASSETS, formats: DEFAULT_CREATIVE_FORMATS, content: null }, zero);
  check("a real result passes its validator", validateCreativeReadinessResult(goodResult, DEFAULT_CREATIVE_FORMATS.map((f) => f.id)).length === 0);
  check("the result keys are exactly the specified ones", same(Object.keys(goodResult).sort(), [...CREATIVE_RESULT_KEYS].sort()));
  check("a result with a score, ranking, classification, or recommendation is rejected", ["score", "rank", "ranking", "classification", "recommendation"].every((field) => has(validateCreativeReadinessResult({ ...goodResult, [field]: 1 }), new RegExp(`unexpected field "${field}"`))));
  check("Duplicate Assets: a result that lists an asset twice is rejected", has(validateCreativeReadinessResult({ ...goodResult, availableAssets: ["headline", "headline"], missingAssets: [] }), /Duplicate asset "headline"/));
  check("Duplicate Formats: a result that lists a format twice is rejected", has(validateCreativeReadinessResult({ ...goodResult, supportedFormats: ["search-text", "search-text"], unsupportedFormats: [] }), /Duplicate format "search-text"/));
  check("an unsorted list is rejected, so that order cannot imply a ranking", has(validateCreativeReadinessResult({ ...goodResult, supportedFormats: ["search-text", "carousel"], unsupportedFormats: [] }), /must be sorted by id/));
  check("all four lists are sorted by id", same(listOf(out, "availableAssets"), [...listOf(out, "availableAssets")].sort()) && same(listOf(out, "missingAssets"), [...listOf(out, "missingAssets")].sort()) && same(listOf(out, "supportedFormats"), [...listOf(out, "supportedFormats")].sort()) && same(listOf(out, "unsupportedFormats"), [...listOf(out, "unsupportedFormats")].sort()));
  const reversed = createCreativeReadinessSignal({ now: zero, registry: createCreativeAssetRegistry([...DEFAULT_CREATIVE_ASSETS].reverse()), formats: [...DEFAULT_CREATIVE_FORMATS].reverse() }).analyze(base.context, {} as never);
  check("the order of the assets and formats changes nothing", stable(reversed) === stable(out));
  check("no metadata key names a score, rank, recommendation, or conversion", Object.keys(metaOf(out)).every((k) => !/score|rank|recommend|conversion|classif/i.test(k)));
  check("the signal output is exactly status, confidence, metadata, warnings, and errors", same(Object.keys(creativeReadinessToSignalOutput(goodResult)).sort(), ["confidence", "errors", "metadata", "status", "warnings"]));

  check("the same context gives the same output", stable(run(signal, base.context)) === stable(run(signal, base.context)));
  const clockInputs = { opportunityAnalysis: base.context.opportunityAnalysis!, opportunityExplanation: null, executionMetadata: {}, configuration: {}, assets: DEFAULT_CREATIVE_ASSETS, formats: DEFAULT_CREATIVE_FORMATS, content: null };
  check("executionTime comes from the injected clock", analyzeCreativeReadiness(clockInputs, tick()).executionTime === 1 && analyzeCreativeReadiness(clockInputs, () => Number.NaN).executionTime === 0);
  check("independent execution: the output does not depend on any other signal", stable(signal.analyze(base.context, { "other-signal": { signalId: "other-signal", status: "COMPLETED", confidence: 1, metadata: { x: 1 }, warnings: [], errors: [], executionTime: 0 } } as never)) === stable(out));

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
  registerOfferStrategySignal(together, { now: zero });
  together.register(sibling("broken-sibling", { analyze: () => { throw new Error("sibling exploded"); }, priority: 52 }));
  registerCreativeReadinessSignal(together, { now: zero });
  const togetherRun = await together.run(base.context);
  const own = togetherRun.results.find((r) => r.signalId === "creative-readiness")!;
  const channel = togetherRun.results.find((r) => r.signalId === "channel-suitability")!;
  const policy = togetherRun.results.find((r) => r.signalId === "policy-risk")!;
  const audience = togetherRun.results.find((r) => r.signalId === "audience-fit")!;
  const offer = togetherRun.results.find((r) => r.signalId === "offer-strategy")!;
  check("it runs sequentially beside Channel, Policy, Audience, and Offer, in priority order", togetherRun.order.join() === "zeta-sibling,channel-suitability,policy-risk,audience-fit,offer-strategy,broken-sibling,creative-readiness" && togetherRun.results.length === 7);
  check("prior traffic signals regression: all five COMPLETE and none changes the others' output", own.status === "COMPLETED" && channel.status === "COMPLETED" && policy.status === "COMPLETED" && audience.status === "COMPLETED" && offer.status === "COMPLETED" && sameOutput(channel, run(createChannelSuitabilitySignal({ now: zero }), base.context)) && sameOutput(policy, run(createPolicyRiskSignal({ now: zero }), base.context)) && sameOutput(audience, run(createAudienceFitSignal({ now: zero }), base.context)) && sameOutput(offer, run(createOfferStrategySignal({ now: zero }), base.context)) && sameOutput(own, out));
  check("a sibling that throws does not change this signal's output", togetherRun.results.find((r) => r.signalId === "broken-sibling")!.status === "FAILED" && own.status === "COMPLETED");
  check("this signal does not run the other signals", calls.join() === "zeta-sibling");
  const alone = await (async () => { const p = createTrafficSignalPipeline({ now: zero }); registerCreativeReadinessSignal(p, { now: zero }); return p.run(base.context); })();
  check("it runs alone with the same output", alone.results.length === 1 && stable(alone.results[0].metadata) === stable(own.metadata));
  const disabledPipeline = createTrafficSignalPipeline({ now: zero });
  registerCreativeReadinessSignal(disabledPipeline, { enabled: false, now: zero });
  check("disabled, the pipeline does not run it", (await disabledPipeline.run(base.context)).results.length === 0);
  const unreadable = createTrafficSignalPipeline({ now: zero });
  registerCreativeReadinessSignal(unreadable, { now: zero });
  check("an unreadable context makes the pipeline report FAILED for this signal", (await unreadable.run(failedAnalysis.context)).results[0].status === "FAILED");

  const contentObject = PAGE();
  const contentBefore = JSON.stringify(contentObject);
  const before = { context: JSON.stringify(base.context), analysis: JSON.stringify(base.context.opportunityAnalysis), explanation: JSON.stringify(base.context.opportunityExplanation), candidate: JSON.stringify(base.context.candidate) };
  const reg = createDefaultCreativeAssetRegistry();
  const regBefore = JSON.stringify(reg.list());
  const first = run(withContent(contentObject, { registry: reg }), base.context);
  (first.metadata as Record<string, unknown>).tampered = true;
  check("no Opportunity mutation", JSON.stringify(base.context.opportunityAnalysis) === before.analysis && JSON.stringify(base.context.opportunityExplanation) === before.explanation && JSON.stringify(base.context) === before.context);
  check("no Discovery mutation", JSON.stringify(base.context.candidate) === before.candidate && JSON.stringify(candidate) === candidateBefore);
  check("no mutation of the supplied content or the assets", JSON.stringify(contentObject) === contentBefore && JSON.stringify(reg.list()) === regBefore);
  check("the context stays deep frozen", Object.isFrozen(base.context) && Object.isFrozen(base.context.opportunityAnalysis));
  check("changing a returned result does not change a later one", !("tampered" in run(withContent(contentObject, { registry: reg }), base.context).metadata));
  check("the asset entries are frozen", reg.list().every((e) => Object.isFrozen(e) && Object.isFrozen(e.asset)) && (() => { const p = reg.get("headline")!.asset; const n = p.name; try { (p as { name: string }).name = "x"; } catch { /* frozen */ } return p.name === n; })());

  const trafficDir = join(process.cwd(), "src", "lib", "traffic");
  const creativeFiles = readdirSync(trafficDir).filter((name) => name.startsWith("creative-") && name.endsWith(".ts"));
  check("the signal is six modules", creativeFiles.length === 6 && ["creative-readiness-analyzer.ts", "creative-asset-definitions.ts", "creative-asset-registry.ts", "creative-readiness-result.ts", "creative-readiness-signal.ts", "creative-readiness-validator.ts"].every((name) => creativeFiles.includes(name)));
  const sources = creativeFiles.map((name) => ({ name, text: readFileSync(join(trafficDir, name), "utf8") }));
  const statements = (text: string) => text.match(/^import[\s\S]*?from\s+"[^"]+";/gm) ?? [];
  const importPath = (statement: string) => /from\s+"([^"]+)"/.exec(statement)![1];
  const allImports = sources.flatMap((s) => statements(s.text).map((statement) => ({ file: s.name, statement, path: importPath(statement) })));
  check("every import is local to the traffic module or a type-only import of an Opportunity or Discovery shape", allImports.every((i) => i.path.startsWith("./") || (/^\.\.\/(opportunity|discovery)\//.test(i.path) && /^import type /.test(i.statement))) && allImports.some((i) => i.path.startsWith("../opportunity/")));
  check("no import from ProductFacts, the LP Builder, Presentation Plan, the importer, grounding, publication, tracking, analytics, a database, or the network", allImports.every((i) => !/product-facts|lp-|presentation-plan|landing|importer|grounding|publication|tracking|analytics|sqlite|\/db|node:|http|openai|anthropic/i.test(i.path.replace(/^\.\.\/opportunity\//, "").replace(/opportunity-explanation-result|opportunity-resolver-analysis/, ""))));
  const code = sources.map((s) => ({ name: s.name, text: stripCode(s.text) }));
  check("no score, ranking, classification, budget, or conversion logic in the code", code.every((c) => !/\b(score|rank|ranking|classif\w*|budget|conversion|keyword|cpc|adwords)\b/i.test(c.text)));
  check("no HTTP, network, AI, database, file, or environment access in the code", code.every((c) => !/\b(fetch|XMLHttpRequest|WebSocket|require|readFile|writeFile|process\.env|Math\.random|new Date|Date\.now)\b/.test(c.text) && !/openai|anthropic|sqlite|google-ads/i.test(c.text)));
  check("no image, video, or copy generation, and no advertising platform, in the modules", sources.every((s) => !/generateImage|generateVideo|generateCopy|dall-e|imagen|runway|sora|google ads|facebook ads|lookalike/i.test(s.text)));
  check("no product, slug, or source-path-specific logic", code.every((c) => !/gizmo|example\.test|https?:\/\/|\/products\/|slug/i.test(c.text)));
  check("the code never writes to its inputs", code.every((c) => !/\b(opportunityAnalysis|opportunityExplanation|candidate|executionMetadata|inputs)(\.[A-Za-z]+)*\s*(=[^=]|\.push\(|\.splice\(|\.sort\()/.test(c.text)));
  const sourceTree = walk(join(process.cwd(), "src")).filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"));
  const outsiders = sourceTree.filter((file) => !file.includes(join("src", "lib", "traffic")) && /creative-readiness|creative-asset/.test(readFileSync(file, "utf8")));
  check("nothing outside the traffic module uses the signal", outsiders.length === 0);
  const prior = ["channel-", "policy-", "audience-", "offer-"].flatMap((prefix) => readdirSync(trafficDir).filter((n) => n.startsWith(prefix)).map((n) => readFileSync(join(trafficDir, n), "utf8")).join("\n"));
  check("Channel Suitability, Policy Risk, Audience Fit, and Offer Strategy do not depend on Creative Readiness", !/creative-readiness|creative-asset/.test(prior));
  const others = readdirSync(trafficDir).filter((n) => !n.startsWith("creative-") && !n.startsWith("channel-") && !n.startsWith("policy-") && !n.startsWith("audience-") && !n.startsWith("offer-") && n !== "traffic-dimension-reader.ts");
  check("the signal adds files only; no framework or architecture module imports it", others.every((n) => !/creative-readiness|creative-asset/.test(readFileSync(join(trafficDir, n), "utf8"))));

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
