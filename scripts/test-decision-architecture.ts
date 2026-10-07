import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DECISION_CONTEXT_MEMBERS, DECISION_STATUSES, DECISION_STATUS_TRANSITIONS } from "../src/lib/decision/decision-types.ts";
import type { DecisionAnalysis, DecisionEvidence, DecisionMetadata, DecisionRule, DecisionStatus } from "../src/lib/decision/decision-types.ts";
import type { DecisionAnalysisRequest, DecisionContext, DecisionResult } from "../src/lib/decision/decision-analysis.ts";
import type { DecisionIssue, DecisionValidator } from "../src/lib/decision/decision-validator.ts";
import type { DecisionRuleFilter, DecisionRuleRegistry } from "../src/lib/decision/decision-registry.ts";
import type { DecisionEngine, DecisionEngineDependencies } from "../src/lib/decision/decision-engine.ts";
import type { DecisionResolver } from "../src/lib/decision/decision-resolver.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const metadata: DecisionMetadata = { note: "fixture", n: 1, flag: true, none: null };
const rule: DecisionRule = { id: "r-1", enabled: true, metadata };
const evidence: DecisionEvidence = { id: "e-1", sourceId: "src-1", summary: "Listed evidence.", metadata };
const analysis: DecisionAnalysis = {
  id: "d-1",
  candidateId: "cand-1",
  opportunityAnalysisId: "opp-1",
  trafficAnalysisId: "traf-1",
  pageAnalysisId: "page-1",
  status: "PENDING",
  createdAt: "2026-01-01T00:00:00.000Z",
  completedAt: null,
  version: 1,
  executionTime: null,
};
const result: DecisionResult = { evidenceSummary: ["Listed evidence."], ruleSummary: ["r-1"], evidence: [evidence], rules: [rule], warnings: [], metadata };
const request: DecisionAnalysisRequest = {
  candidateId: "cand-1",
  opportunityAnalysisId: "opp-1",
  trafficAnalysisId: "traf-1",
  pageAnalysisId: "page-1",
  executionMetadata: { run: "r1" },
  runtimeMetadata: { host: "h1" },
  configuration: { mode: "m1" },
};
const context: DecisionContext = {
  candidate: { id: "cand-1" },
  opportunityAnalysis: { id: "opp-1" },
  trafficAnalysis: { id: "traf-1" },
  pageAnalysis: { id: "page-1" },
  executionMetadata: { run: "r1" },
  runtimeMetadata: { host: "h1" },
  configuration: { mode: "m1" },
};

function fakeRegistry(): DecisionRuleRegistry {
  const rules = new Map<string, DecisionRule>();
  const issues = (input: unknown): DecisionIssue[] => (typeof input === "object" && input !== null && "id" in input ? [] : [{ field: "rule", message: "Missing rule: a rule is required." }]);
  return {
    register: (item) => {
      if (rules.has(item.id)) throw new Error("Duplicate rule");
      rules.set(item.id, item);
      return item;
    },
    enable: (id) => {
      const found = rules.get(id);
      if (!found) throw new Error("Missing rule");
      rules.set(id, { ...found, enabled: true });
      return rules.get(id)!;
    },
    disable: (id) => {
      const found = rules.get(id);
      if (!found) throw new Error("Missing rule");
      rules.set(id, { ...found, enabled: false });
      return rules.get(id)!;
    },
    get: (id) => rules.get(id) ?? null,
    list: (filter?: DecisionRuleFilter) => [...rules.values()].filter((item) => filter?.enabled === undefined || item.enabled === filter.enabled),
    validate: issues,
  };
}

const validator: DecisionValidator = {
  validateRule: (input) => (input == null ? [{ field: "rule", message: "Missing rule: a rule is required." }] : []),
  validateAnalysis: (input) => (input == null ? [{ field: "analysis", message: "Missing analysis: an analysis record is required." }] : []),
  validateResult: () => [],
  validateRequest: () => [],
  validateContext: () => [],
  validateMetadata: (input) => (input !== null && typeof input === "object" && !Array.isArray(input) && Object.values(input as object).every((v) => v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") ? [] : [{ field: "metadata", message: "Invalid metadata: a flat record is required." }]),
};

async function main() {
  check("four statuses, in the requested order", DECISION_STATUSES.join() === "PENDING,ANALYZING,COMPLETED,FAILED");
  check("seven context members, in the requested order", DECISION_CONTEXT_MEMBERS.join() === "candidate,opportunityAnalysis,trafficAnalysis,pageAnalysis,executionMetadata,runtimeMetadata,configuration");
  check("every status is distinct", new Set(DECISION_STATUSES).size === 4);
  const next = (s: DecisionStatus) => DECISION_STATUS_TRANSITIONS[s];
  check("transitions cover every status and only move forward", DECISION_STATUSES.every((s) => s in DECISION_STATUS_TRANSITIONS) && next("PENDING").join() === "ANALYZING,FAILED" && next("ANALYZING").join() === "COMPLETED,FAILED");
  check("COMPLETED and FAILED are final", next("COMPLETED").length === 0 && next("FAILED").length === 0);
  check("every transition target is a known status", DECISION_STATUSES.every((s) => next(s).every((t) => DECISION_STATUSES.includes(t))));

  check("a decision analysis has exactly the requested fields", Object.keys(analysis).join() === "id,candidateId,opportunityAnalysisId,trafficAnalysisId,pageAnalysisId,status,createdAt,completedAt,version,executionTime");
  check("a decision result has exactly the requested fields", Object.keys(result).join() === "evidenceSummary,ruleSummary,evidence,rules,warnings,metadata");
  check("a decision rule has exactly the requested fields", Object.keys(rule).join() === "id,enabled,metadata");
  check("a decision evidence record has exactly the requested fields", Object.keys(evidence).join() === "id,sourceId,summary,metadata");
  check("a request carries references and three metadata bags", Object.keys(request).join() === "candidateId,opportunityAnalysisId,trafficAnalysisId,pageAnalysisId,executionMetadata,runtimeMetadata,configuration");
  check("a context has exactly the seven members", Object.keys(context).join() === DECISION_CONTEXT_MEMBERS.join());
  check("the result carries no action list and no execution plan", !("actions" in result) && !("executionPlan" in result) && !("plan" in analysis));

  const registry = fakeRegistry();
  const dependencies: DecisionEngineDependencies = { registry, validator };
  const engine: DecisionEngine = {
    analyze: async (r) => ({ ...analysis, candidateId: r.candidateId, opportunityAnalysisId: r.opportunityAnalysisId, trafficAnalysisId: r.trafficAnalysisId, pageAnalysisId: r.pageAnalysisId }),
    getAnalysis: () => null,
    getResult: () => null,
  };
  const resolver: DecisionResolver = {
    resolve: async (ctx) => ({ ...analysis, candidateId: ctx.candidate?.id ?? null, opportunityAnalysisId: ctx.opportunityAnalysis?.id ?? null, trafficAnalysisId: ctx.trafficAnalysis?.id ?? null, pageAnalysisId: ctx.pageAnalysis?.id ?? null }),
  };

  registry.register(rule);
  registry.register({ ...rule, id: "r-2", enabled: false });
  check("the registry registers, gets, and lists rules", registry.get("r-1")?.id === "r-1" && registry.get("nope") === null && registry.list().length === 2);
  check("the registry enables and disables a rule", registry.disable("r-1").enabled === false && registry.enable("r-1").enabled === true);
  check("the registry lists by enabled flag", registry.list({ enabled: true }).map((item) => item.id).join() === "r-1");
  check("the registry validates without registering", registry.validate({ id: "x" }).length === 0 && registry.validate(5).length === 1 && registry.get("x") === null);
  let duplicate = false;
  try {
    registry.register(rule);
  } catch {
    duplicate = true;
  }
  check("Duplicate Rule: a second registration is rejected", duplicate && registry.list().length === 2);
  let missing = false;
  try {
    registry.enable("missing");
  } catch {
    missing = true;
  }
  check("Missing Rule: enable of an unknown id is rejected", missing);
  check("Missing Analysis is rejected by the validator contract", validator.validateAnalysis(null).some((i) => /Missing analysis/.test(`${i.field} ${i.message}`)));
  check("Invalid Metadata is rejected by the validator contract", validator.validateMetadata({ a: { b: 1 } }).some((i) => /Invalid metadata/.test(`${i.field} ${i.message}`)) && validator.validateMetadata(metadata).length === 0);
  const created = await engine.analyze(request);
  check("the engine analyzes a request and returns a PENDING-shaped analysis record", created.candidateId === "cand-1" && created.status === "PENDING" && engine.getAnalysis("nope") === null && engine.getResult("nope") === null);
  const resolved = await resolver.resolve(context);
  check("the resolver reads ids only and returns an analysis", resolved.candidateId === "cand-1" && resolved.trafficAnalysisId === "traf-1" && resolved.pageAnalysisId === "page-1");
  void dependencies;

  const dir = join(process.cwd(), "src/lib/decision");
  // The rule framework (decision-rule-*) is covered by test-decision-rule-framework.ts.
  // This test covers the six architecture modules only, by name.
  const architecture = ["decision-analysis.ts", "decision-engine.ts", "decision-registry.ts", "decision-resolver.ts", "decision-types.ts", "decision-validator.ts"];
  check("the six architecture modules are present", architecture.every((f) => readdirSync(dir).includes(f)));
  const files = readdirSync(dir).filter((f) => architecture.includes(f));
  check("exactly the six architecture modules exist", files.sort().join() === architecture.slice().sort().join());
  const lines = files.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 6);
  check("every import is type-only and from inside the decision folder", imports.every((i) => i.typeOnly && /^\.\/decision-[a-z]+$/.test(i.from)));
  check("nothing imports Opportunity, Discovery, the LP Builder, Importer, Grounding, Policy, Publication, Tracking, Analytics, ProductFacts, Traffic, or the database", !imports.some((i) => /opportunity|discovery|lp-builder|import(er)?\b|grounding|policy|publication|tracking|analytics|product-facts|traffic|db/i.test(i.from)));
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no ad platform, keyword, campaign, bid, or cost logic in code", !code.some((l) => /google|\bads?\b|keyword|campaign|\bcpc\b|\bcpa\b|\bbid\b|budget|adwords/i.test(l)));
  check("no AI, network, persistence, timers, or file access in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|node:fs|child_process|crawl|scrap|localStorage|INSERT /.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no scoring, ranking, weights, formulas, or recommendations in code", !code.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  const runtime = code.filter((l) => /^\s*export\s+(async\s+)?(function|class)\b|=>\s*[^;]*;?\s*$/.test(l) && !/^\s*export\s+(type|interface)\b/.test(l));
  check("architecture only: no function or class is exported, and the only runtime values are constants", runtime.length === 0 && code.filter((l) => /^\s*export\s+const\b/.test(l)).length === 3);
  const others = ["src/lib/opportunity", "src/lib/discovery", "src/lib/traffic", "src/lib/lp-builder", "src/lib/platform"].flatMap((d) => {
    try {
      return readdirSync(join(process.cwd(), d)).filter((f) => f.endsWith(".ts")).map((f) => join(process.cwd(), d, f));
    } catch {
      return [];
    }
  });
  check("no Opportunity, Discovery, Traffic, LP Builder, or Platform module imports the decision engine", !others.some((f) => /\/decision\/|decision-(engine|types|registry|validator|analysis|resolver)/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nDecision architecture: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
