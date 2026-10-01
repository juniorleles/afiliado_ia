import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { TRAFFIC_SIGNAL_CATEGORIES, TRAFFIC_STATUSES, TRAFFIC_STATUS_TRANSITIONS } from "../src/lib/traffic/traffic-types.ts";
import type { TrafficAnalysis, TrafficMetadata, TrafficSignal, TrafficSignalCategory, TrafficStatus } from "../src/lib/traffic/traffic-types.ts";
import type { TrafficAnalysisRequest, TrafficResult } from "../src/lib/traffic/traffic-analysis.ts";
import type { TrafficSignalFilter, TrafficSignalRegistry } from "../src/lib/traffic/traffic-registry.ts";
import type { TrafficIssue, TrafficValidator } from "../src/lib/traffic/traffic-validator.ts";
import type { TrafficEngine, TrafficEngineDependencies } from "../src/lib/traffic/traffic-engine.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

// ---------- the domain model, as literals the compiler checks ----------
const metadata: TrafficMetadata = { note: "fixture", n: 1, flag: true, none: null };
const signal: TrafficSignal = { id: "s-1", category: "TRAFFIC_CHANNEL", priority: 10, enabled: true, metadata };
const analysis: TrafficAnalysis = { id: "t-1", candidateId: "cand-1", opportunityAnalysisId: "opp-1", status: "PENDING", createdAt: "2026-01-01T00:00:00.000Z", completedAt: null, version: 1 };
const result: TrafficResult = { strategy: null, confidence: null, warnings: [], signals: [signal], metadata };
const request: TrafficAnalysisRequest = { candidateId: "cand-1", opportunityAnalysisId: "opp-1" };

// ---------- a minimal in-memory implementation, only to show each contract can be implemented ----------
function fakeRegistry(): TrafficSignalRegistry {
  const signals = new Map<string, TrafficSignal>();
  const issues = (input: unknown): TrafficIssue[] => (typeof input === "object" && input !== null && "id" in input ? [] : [{ field: "signal", message: "not a signal" }]);
  return {
    register: (s) => (signals.set(s.id, s), s),
    enable: (id) => (signals.set(id, { ...signals.get(id)!, enabled: true }), signals.get(id)!),
    disable: (id) => (signals.set(id, { ...signals.get(id)!, enabled: false }), signals.get(id)!),
    get: (id) => signals.get(id) ?? null,
    list: (filter?: TrafficSignalFilter) => [...signals.values()].filter((s) => (filter?.category === undefined || s.category === filter.category) && (filter?.enabled === undefined || s.enabled === filter.enabled)),
    validate: issues,
  };
}
const validator: TrafficValidator = { validateSignal: () => [], validateAnalysis: () => [], validateResult: () => [] };
const dependencies: TrafficEngineDependencies = { registry: fakeRegistry(), validator };
const engine: TrafficEngine = {
  analyze: async (r) => ({ ...analysis, candidateId: r.candidateId, opportunityAnalysisId: r.opportunityAnalysisId }),
  getAnalysis: () => null,
  getResult: () => null,
};

async function main() {
  // ---------- constants ----------
  check("eight signal categories, in the requested order", TRAFFIC_SIGNAL_CATEGORIES.join() === "TRAFFIC_CHANNEL,TRAFFIC_RISK,TRAFFIC_STRATEGY,POLICY,AUDIENCE,OFFER,CREATIVE,FUTURE");
  check("four statuses, in the requested order", TRAFFIC_STATUSES.join() === "PENDING,ANALYZING,COMPLETED,FAILED");
  check("every category and status is distinct", new Set(TRAFFIC_SIGNAL_CATEGORIES).size === 8 && new Set(TRAFFIC_STATUSES).size === 4);
  const next = (s: TrafficStatus) => TRAFFIC_STATUS_TRANSITIONS[s];
  check("transitions cover every status and only move forward", TRAFFIC_STATUSES.every((s) => s in TRAFFIC_STATUS_TRANSITIONS) && next("PENDING").join() === "ANALYZING,FAILED" && next("ANALYZING").join() === "COMPLETED,FAILED");
  check("COMPLETED and FAILED are final", next("COMPLETED").length === 0 && next("FAILED").length === 0);
  check("every transition target is a known status", TRAFFIC_STATUSES.every((s) => next(s).every((t) => TRAFFIC_STATUSES.includes(t))));

  // ---------- the domain model ----------
  check("a traffic analysis has exactly the requested fields", Object.keys(analysis).join() === "id,candidateId,opportunityAnalysisId,status,createdAt,completedAt,version");
  check("a traffic result has exactly the requested fields", Object.keys(result).join() === "strategy,confidence,warnings,signals,metadata");
  check("a traffic signal has exactly the requested fields", Object.keys(signal).join() === "id,category,priority,enabled,metadata");
  check("a request carries two references and nothing else", Object.keys(request).join() === "candidateId,opportunityAnalysisId");
  const category: TrafficSignalCategory = "FUTURE";
  check("a signal's category is one of the supported ones", TRAFFIC_SIGNAL_CATEGORIES.includes(category) && TRAFFIC_SIGNAL_CATEGORIES.includes(signal.category));

  // ---------- the contracts can be implemented ----------
  const registry = dependencies.registry;
  registry.register(signal);
  registry.register({ ...signal, id: "s-2", category: "POLICY", enabled: false });
  check("the registry registers, gets, and lists signals", registry.get("s-1")?.id === "s-1" && registry.get("nope") === null && registry.list().length === 2);
  check("the registry enables and disables a signal", registry.disable("s-1").enabled === false && registry.enable("s-1").enabled === true);
  check("the registry lists by category and by enabled flag", registry.list({ category: "POLICY" }).length === 1 && registry.list({ enabled: true }).map((s) => s.id).join() === "s-1");
  check("the registry validates without registering", registry.validate({ id: "x" }).length === 0 && registry.validate(5).length === 1 && registry.get("x") === null);
  const created = await engine.analyze(request);
  check("the engine analyzes a request and returns a PENDING-shaped analysis record", created.candidateId === "cand-1" && created.opportunityAnalysisId === "opp-1" && engine.getAnalysis("nope") === null && engine.getResult("nope") === null);

  // ---------- genericity and boundaries ----------
  const dir = join(process.cwd(), "src/lib/traffic");
  // The signal framework (traffic-signal-*) is covered by test-traffic-signal-framework.ts,
  // and each signal by its own test. This test covers the five architecture modules only, by name,
  // so that adding a signal never changes what it checks.
  const architecture = ["traffic-analysis.ts", "traffic-engine.ts", "traffic-registry.ts", "traffic-types.ts", "traffic-validator.ts"];
  check("the five architecture modules are present", architecture.every((f) => readdirSync(dir).includes(f)));
  const files = readdirSync(dir).filter((f) => architecture.includes(f));
  check("exactly the five architecture modules exist", files.sort().join() === "traffic-analysis.ts,traffic-engine.ts,traffic-registry.ts,traffic-types.ts,traffic-validator.ts");
  const lines = files.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 6);
  check("every import is type-only and from inside the traffic folder", imports.every((i) => i.typeOnly && /^\.\/traffic-[a-z]+$/.test(i.from)));
  check("nothing imports Opportunity, Discovery, the LP Builder, Importer, Grounding, Policy, Publication, Tracking, Analytics, ProductFacts, or the database", !imports.some((i) => /opportunity|discovery|lp-builder|import(er)?\b|grounding|policy|publication|tracking|analytics|product-facts|db/i.test(i.from)));
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no ad platform, keyword, campaign, bid, or cost logic in code", !code.some((l) => /google|\bads?\b|keyword|campaign|\bcpc\b|\bcpa\b|\bbid\b|budget|adwords/i.test(l)));
  check("no AI, network, persistence, timers, or file access in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|node:fs|child_process|crawl|scrap|localStorage|INSERT /.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no policy evaluation, scoring, ranking, or formulas in code", !code.some((l) => /evaluat|\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  const runtime = code.filter((l) => /^\s*export\s+(async\s+)?(function|class)\b|=>\s*[^;]*;?\s*$/.test(l) && !/^\s*export\s+(type|interface)\b/.test(l));
  check("architecture only: no function or class is exported, and the only runtime values are constants", runtime.length === 0 && code.filter((l) => /^\s*export\s+const\b/.test(l)).length === 3);
  const others = ["src/lib/opportunity", "src/lib/discovery"].flatMap((d) => readdirSync(join(process.cwd(), d)).filter((f) => f.endsWith(".ts")).map((f) => join(process.cwd(), d, f)));
  check("no Opportunity or Discovery module imports the traffic engine", !others.some((f) => /\/traffic\/|traffic-(engine|types|registry|validator|analysis)/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nTraffic architecture: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
