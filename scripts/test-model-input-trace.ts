// npx tsx scripts/test-model-input-trace.ts
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { emptyProductFacts, withImportQuality } from "../src/lib/product-facts.ts";
import {
  ANTHROPIC_MODEL,
  buildModelProviderBoundRequest,
  buildPrompt,
} from "../src/lib/ai/generate-variants.ts";
import {
  MODEL_INPUT_TRACE_ARTIFACT,
  MODEL_INPUT_TRACE_VERSION,
  ModelInputTraceError,
  captureModelInputTrace,
  commitTracedProviderCall,
  excludedSecretMetadata,
} from "../src/lib/ai/model-input-trace.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const facts = withImportQuality({
  ...emptyProductFacts("Trace Product", "https://example.test/trace", "MANUAL"),
  description: "Trace Product supports daily comfort.",
  usageInformation: ["Take one capsule daily with water."],
  ingredientsOrComponents: ["CLOSED_INGREDIENT_EVIDENCE_MARKER_BOSWELLIA"],
  manufacturer: "CLOSED_MANUFACTURER_EVIDENCE_MARKER_ACME",
  pricingInformation: "CLOSED_PRICING_EVIDENCE_MARKER_49",
  sourceSnippets: [
    {
      field: "ingredientsOrComponents",
      text: "CLOSED_HIDDEN_SNIPPET_MARKER",
      sourceUrl: "https://example.test/hidden",
      confidence: "HEURISTIC_EXTRACTION",
    },
  ],
  importWarnings: ["CLOSED_WARNING_MARKER"],
  confidence: {
    ...emptyProductFacts().confidence,
    productName: "MANUAL",
    description: "DIRECT_SOURCE",
    usageInformation: "DIRECT_SOURCE",
    ingredientsOrComponents: "HEURISTIC_EXTRACTION",
    manufacturer: "HEURISTIC_EXTRACTION",
    pricingInformation: "HEURISTIC_EXTRACTION",
  },
});

const input = { productName: facts.productName, facts, targetApproach: "REVIEW" as const };
const prompt = buildPrompt(input);
const bound = buildModelProviderBoundRequest(input);
const context = bound.rendered.modelProviderContext;
if (!context) throw new Error("missing provider context");

assert(bound.loaded.plan.generationRoute === "MODEL", "synthetic route is MODEL");
assert(bound.body.system === prompt.system, "SYSTEM_PROMPT_MATCH");
assert(bound.body.messages[0]?.content === prompt.user, "USER_PROMPT_MATCH");
assert(bound.body.model === ANTHROPIC_MODEL, "MODEL_NAME_MATCH");
assert(bound.body.max_tokens === 16384, "max tokens stay 16384");

const beforeBody = JSON.stringify(bound.body);
const beforeSchema = JSON.stringify(bound.schema);
const beforeSlots = JSON.stringify(bound.loaded.slotPlan);
const beforePropositions = JSON.stringify(context.propositionGroups);
const beforeOperations = JSON.stringify(context.authorities.map((item) => item.allowedOperations));

const apiKey = "sk-ant-test-DO_NOT_LEAK_991";
const authorization = "Bearer sk-ant-test-DO_NOT_LEAK_AUTH";
const cookie = "session=DO_NOT_LEAK_COOKIE_774";
const secret = "DO_NOT_LEAK_SECRET_442";
const runtimeMetadata = {
  ANTHROPIC_API_KEY: apiKey,
  Authorization: authorization,
  cookie,
  secret,
  "x-api-key": apiKey,
};
const dropped = excludedSecretMetadata(runtimeMetadata);
assert(dropped.includes("ANTHROPIC_API_KEY"), "api key metadata is excluded");
assert(dropped.includes("Authorization"), "authorization metadata is excluded");
assert(dropped.includes("cookie"), "cookie metadata is excluded");
assert(dropped.includes("secret"), "secret metadata is excluded");

const trace = captureModelInputTrace({
  body: bound.body,
  generationRoute: "MODEL",
  closedTopics: context.closedTopics,
  authorities: context.authorities,
  propositionGroups: context.propositionGroups,
  runtimeMetadata,
});

assert(JSON.stringify(bound.body) === beforeBody, "SYSTEM_PROMPT_CHANGED=NO and body unchanged");
assert(JSON.stringify(bound.schema) === beforeSchema, "OUTPUT_SCHEMA_CHANGED=NO");
assert(JSON.stringify(bound.loaded.slotPlan) === beforeSlots, "SLOT_PLAN_CHANGED=NO");
assert(JSON.stringify(context.propositionGroups) === beforePropositions, "PROPOSITION_BINDING_CHANGED=NO");
assert(JSON.stringify(context.authorities.map((item) => item.allowedOperations)) === beforeOperations, "MODEL_PARAMETERS operations unchanged");
assert(bound.body.model === ANTHROPIC_MODEL && bound.body.max_tokens === 16384, "MODEL_PARAMETERS_CHANGED=NO");

assert(trace.traceVersion === MODEL_INPUT_TRACE_VERSION, "TRACE_VERSION");
assert(trace.capturedFrom === "EXACT_PROVIDER_BOUND_VALUES", "captured from provider body");
assert(trace.postHocReconstruction === false, "POST_HOC_RECONSTRUCTION=NO");
assert(trace.exactSent.system === bound.body.system, "trace system is the body system");
assert(trace.exactSent.user === bound.body.messages[0]?.content, "trace user is the body user");
assert(trace.exactSent.model === bound.body.model, "trace model is the body model");
assert(trace.exactSent.generationRoute === "MODEL", "ROUTE_MATCH");
assert(trace.exactSent.outputContract.schemaId === "slotFillSchema", "schema id");
assert(trace.exactSent.outputContract.contractId === "PROPOSITION_BOUND_STRUCTURED_OUTPUT_V1", "OUTPUT_CONTRACT_MATCH");
assert(JSON.stringify(trace.exactSent.outputContract.schema) === beforeSchema, "trace schema equals the sent schema");

const expectedPropositionIds = context.propositionGroups.flatMap((group) =>
  group.propositions.map((item) => item.propositionId),
);
const tracePropositionIds = trace.structureReference.slots.flatMap((slot) => slot.propositionIds);
assert(tracePropositionIds.join("|") === expectedPropositionIds.join("|"), "PROPOSITION_IDS_MATCH");
assert(expectedPropositionIds.every((id) => trace.exactSent.user.includes(id)), "proposition ids are inside the sent user prompt");

const expectedClaimIds = context.authorities.flatMap((item) => item.allowedClaimIds);
const traceClaimIds = trace.structureReference.slots.flatMap((slot) => slot.claimIds);
assert(traceClaimIds.join("|") === expectedClaimIds.join("|"), "CLAIM_IDS_MATCH");
assert(expectedClaimIds.every((id) => trace.exactSent.user.includes(id)), "claim ids are inside the sent user prompt");

const expectedEvidenceIds = context.authorities.flatMap((item) => item.allowedEvidenceIds);
const traceEvidenceIds = trace.structureReference.slots.flatMap((slot) => slot.evidenceIds);
assert(traceEvidenceIds.join("|") === expectedEvidenceIds.join("|"), "EVIDENCE_IDS_MATCH");
assert(expectedEvidenceIds.every((id) => trace.exactSent.user.includes(id)), "evidence ids are inside the sent user prompt");

const serialized = JSON.stringify(trace);
assert(!serialized.includes(apiKey), "API_KEY_IN_TRACE=NO");
assert(!serialized.includes(authorization), "AUTH_HEADER_IN_TRACE=NO");
assert(!serialized.includes(cookie), "COOKIE_IN_TRACE=NO");
assert(!serialized.includes(secret), "SECRET_METADATA_IN_TRACE=NO");
assert(!serialized.includes("x-api-key"), "header name is absent");
assert(!serialized.includes("CLOSED_INGREDIENT_EVIDENCE_MARKER_BOSWELLIA"), "CLOSED_INGREDIENT_EVIDENCE_IN_TRACE=NO");
assert(!serialized.includes("CLOSED_MANUFACTURER_EVIDENCE_MARKER_ACME"), "CLOSED_MANUFACTURER_EVIDENCE_IN_TRACE=NO");
assert(!serialized.includes("CLOSED_PRICING_EVIDENCE_MARKER_49"), "CLOSED_PRICING_EVIDENCE_IN_TRACE=NO");
assert(!serialized.includes("CLOSED_HIDDEN_SNIPPET_MARKER"), "hidden snippet absent");
assert(!serialized.includes("CLOSED_WARNING_MARKER"), "RAW_PRODUCTFACTS_ADDED_TO_TRACE=NO");
assert(serialized.includes("Take one capsule daily with water."), "open usage text is the provider-visible text");
assert(trace.structureReference.closedTopics.includes("ingredients"), "closed topic name stays the plan label");
assert(trace.exactSent.user.includes(`CLOSED_TOPICS: ${context.closedTopics.join(", ")}`), "closed topics in the trace are the prompt line");
assert(!("productFacts" in trace), "trace has no ProductFacts field");

async function verifyPersistence() {
const dir = mkdtempSync(path.join(tmpdir(), "model-input-trace-"));
try {
  const blocker = path.join(dir, "not-a-directory");
  writeFileSync(blocker, "x");
  let providerCalled = false;
  let failed = false;
  try {
    await commitTracedProviderCall({
      trace,
      body: bound.body,
      traceRequest: { directory: path.join(blocker, "child"), required: true },
      send: async () => {
        providerCalled = true;
        return "sent";
      },
    });
  } catch (err) {
    failed = err instanceof ModelInputTraceError;
  }
  assert(failed, "controlled trace write failure throws");
  assert(providerCalled === false, "provider is not called when the trace write fails");

  const okDir = path.join(dir, "ok");
  let sent: unknown;
  await commitTracedProviderCall({
    trace,
    body: bound.body,
    traceRequest: { directory: okDir, required: true },
    send: async (body) => {
      sent = body;
      return "sent";
    },
  });
  assert(sent === bound.body, "send receives the same body object");
  const written = JSON.parse(readFileSync(path.join(okDir, MODEL_INPUT_TRACE_ARTIFACT), "utf8")) as {
    traceVersion: string;
    exactSent: { system: string; user: string };
  };
  assert(written.traceVersion === MODEL_INPUT_TRACE_VERSION, "artifact traceVersion");
  assert(written.exactSent.system === bound.body.system, "artifact system matches");
  assert(written.exactSent.user === bound.body.messages[0]?.content, "artifact user matches");

  let plain = false;
  await commitTracedProviderCall({
    trace,
    body: bound.body,
    send: async () => {
      plain = true;
      return "sent";
    },
  });
  assert(plain, "normal generation without a trace request still sends");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
}

verifyPersistence()
  .then(() => {
    console.log("ANTHROPIC_CALLS=0");
    console.log("MODEL_INPUT_TRACE_V1=PASS");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
