// npx tsx scripts/test-ai-commercial-copy.ts
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { structureResearchFacts, isIncompleteFragment, isWeakCommercialLead } from "../src/lib/lp-generator/structure.ts";
import { parseAiCommercialCopy } from "../src/lib/lp-generator/ai-copy/schema.ts";
import {
  createConfiguredCopyCaller,
  diagnoseAiProvider,
  extractOpenAiResponseText,
} from "../src/lib/lp-generator/ai-copy/provider.ts";
import {
  COPY_MAX_OUTPUT_TOKENS,
  COPY_TIMEOUT_MS,
  OPENAI_RESPONSES_URL,
  OPENAI_TEXT_MODEL,
  estimateOpenAiCostUsd,
  resolveCopyProvider,
} from "../src/lib/lp-generator/ai-copy/config.ts";
import { buildCommercialCopyPrompt, categoryGuidance, commercialCategoryOf } from "../src/lib/lp-generator/ai-copy/prompt.ts";
import { resolveCommercialCopy } from "../src/lib/lp-generator/ai-copy/resolve.ts";
import { inspectContentQuality, repairContentQuality } from "../src/lib/lp-generator/content-quality.ts";
import { runGeneration } from "../src/lib/lp-generator/run.ts";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { EnrichmentSource } from "../src/lib/product-enrichment/types.ts";
import type { SalesCopy } from "../src/lib/page-blueprint/types.ts";
import type { ProductContract } from "../src/lib/product-contract/types.ts";
import type { ConversionBrief } from "../src/lib/conversion-strategy/types.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

function facts() {
  const base = emptyProductFacts("Northridge Capsules", "https://shop.northridge.example/capsules", "IMPORTED");
  return {
    ...base,
    description: "Mimosa Pudica",
    features: ["Bearberry", "create a powerful", "Vegetable capsule shell"],
    ingredientsOrComponents: ["Mimosa Pudica", "create a powerful"],
    specifications: [
      {
        name: "create a powerful",
        value: "bladder-supporting formula",
        provenance: "DIRECT_SOURCE" as const,
        copyEligibility: "YES" as const,
        policyFindings: [],
        sourceUrl: "https://shop.northridge.example/capsules",
        sourcePageCategory: "PRODUCT_DETAILS" as const,
      },
    ],
    confidence: { ...base.confidence, productName: "MANUAL" as const, description: "DIRECT_SOURCE" as const, features: "DIRECT_SOURCE" as const },
  };
}

const validDraft = {
  headline: "Northridge Capsules",
  subheadline: "dietary supplement",
  introduction: "Northridge Capsules is listed for daily use.",
  sectionHeadlines: { differentiators: "What's inside" },
  features: ["Vegetable capsule shell"],
  benefitExplanations: [],
  faq: [],
};

async function main() {
  assert(isIncompleteFragment("create a powerful"), "verb fragment is incomplete");
  assert(isWeakCommercialLead("Mimosa Pudica", "Northridge Capsules", ["Mimosa Pudica"]), "ingredient is a weak lead");
  assert(!isWeakCommercialLead("A daily greens blend in vegetable capsules.", "Aldermoor Greens", ["Spirulina"]), "complete description is a usable lead");

  const structured = structureResearchFacts({
    operatorName: "Northridge Capsules",
    category: "dietary supplement",
    facts: facts(),
  });
  assert(structured.facts.productName === "Northridge Capsules", "operator identity is preserved");
  assert(structured.facts.description !== "Mimosa Pudica", "ingredient is not kept as description");
  assert(structured.research.ingredients.includes("Mimosa Pudica"), "ingredient stays in the ingredient slot");
  assert(!structured.facts.features.includes("create a powerful"), "fragments are removed from features");
  assert(structured.facts.specifications?.length === 0, "incomplete specifications are dropped");

  const parsed = parseAiCommercialCopy(validDraft);
  assert(parsed.ok, "valid AI schema parses");
  assert(!parseAiCommercialCopy({ headline: "Only" }).ok, "incomplete AI schema is rejected");

  const openaiDefault = resolveCopyProvider({
    OPENAI_API_KEY: "sk-test-openai",
    ANTHROPIC_API_KEY: "sk-ant-test",
    AIA_ALLOW_PAID_AI: "0",
  });
  assert(openaiDefault.provider === "openai", "OpenAI is the default provider when both keys exist");
  assert(openaiDefault.model === OPENAI_TEXT_MODEL, "default OpenAI model is gpt-5-mini");
  assert(openaiDefault.authorized === false, "paid AI stays blocked without AIA_ALLOW_PAID_AI=1");

  const openaiForced = resolveCopyProvider({
    OPENAI_API_KEY: "sk-test-openai",
    ANTHROPIC_API_KEY: "sk-ant-test",
    AI_PROVIDER: "openai",
    AI_MODEL: "gpt-5-mini",
    AIA_ALLOW_PAID_AI: "0",
  });
  assert(openaiForced.provider === "openai" && openaiForced.model === "gpt-5-mini", "AI_PROVIDER=openai selects gpt-5-mini");

  const anthropicAlt = resolveCopyProvider({
    OPENAI_API_KEY: "sk-test-openai",
    ANTHROPIC_API_KEY: "sk-ant-test",
    AI_PROVIDER: "anthropic",
    AIA_ALLOW_PAID_AI: "0",
  });
  assert(anthropicAlt.provider === "anthropic", "AI_PROVIDER=anthropic keeps Anthropic as an alternative");

  const openaiMissing = resolveCopyProvider({
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "sk-ant-test",
    AI_PROVIDER: "openai",
    AIA_ALLOW_PAID_AI: "0",
  });
  assert(openaiMissing.provider === "anthropic", "missing OpenAI key falls back to Anthropic when requested");

  const none = resolveCopyProvider({ OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", AIA_ALLOW_PAID_AI: "1" });
  assert(none.provider === "none", "no provider when both keys are empty");
  assert(
    diagnoseAiProvider({ OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", AIA_ALLOW_PAID_AI: "1" }).status === "BLOCKED_CONFIGURATION",
    "authorization without keys cannot run",
  );

  const isolatedEmpty = resolveCopyProvider({ OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "" });
  assert(isolatedEmpty.provider === "none", "explicit empty test env does not leak .env.local keys");

  const diagnosis = diagnoseAiProvider({ ANTHROPIC_API_KEY: "sk-ant-test", AIA_ALLOW_PAID_AI: "0", OPENAI_API_KEY: "" });
  assert(diagnosis.provider === "anthropic", "Anthropic is detected when OpenAI is empty");
  assert(diagnosis.status === "BLOCKED_AUTHORIZATION", "paid AI stays blocked without explicit authorization");
  assert(!JSON.stringify(diagnosis).includes("sk-ant-test"), "diagnosis does not echo secrets");

  const openaiReady = diagnoseAiProvider({
    OPENAI_API_KEY: "sk-test-openai",
    AIA_ALLOW_PAID_AI: "1",
    AI_PROVIDER: "openai",
  });
  assert(openaiReady.provider === "openai" && openaiReady.status === "READY", "authorized OpenAI is READY");
  assert(!JSON.stringify(openaiReady).includes("sk-test-openai"), "OpenAI diagnosis does not echo secrets");
  assert(openaiReady.note.toLowerCase().includes("image"), "OpenAI copy diagnosis keeps image generation separate");

  assert(OPENAI_RESPONSES_URL === "https://api.openai.com/v1/responses", "text copy uses the Responses API");
  assert(!OPENAI_RESPONSES_URL.includes("/images"), "text copy does not use the Images API");
  assert(COPY_MAX_OUTPUT_TOKENS === 2048, "output tokens are capped");
  assert(COPY_TIMEOUT_MS === 20_000, "copy timeout is 20s");
  assert(estimateOpenAiCostUsd(2500, 800) === "~$0.0022", "published gpt-5-mini rates estimate ~$0.0022 per generation");
  assert(
    extractOpenAiResponseText({ output_text: JSON.stringify(validDraft) }) === JSON.stringify(validDraft),
    "Responses output_text is extracted",
  );
  assert(
    extractOpenAiResponseText({
      output: [{ content: [{ type: "output_text", text: "{\"headline\":\"Northridge Capsules\"}" }] }],
    }).includes("Northridge Capsules"),
    "Responses output[].content text is extracted",
  );

  assert(commercialCategoryOf({ category: "dietary supplement" }) === "SUPPLEMENTS", "supplement category");
  assert(commercialCategoryOf({ category: "wireless earbuds" }) === "ELECTRONICS", "electronics category");
  assert(commercialCategoryOf({ category: "lip balm" }) === "BEAUTY", "beauty category");
  assert(commercialCategoryOf({ category: "travel pillow" }) === "GENERAL", "general category");

  const storeRoot = mkdtempSync(path.join(os.tmpdir(), "lp53a-"));
  const sources: EnrichmentSource[] = [
    {
      url: "https://shop.northridge.example/capsules",
      pageCategory: "PRIMARY",
      records: [
        { field: "description", text: "Mimosa Pudica" },
        { field: "feature", text: "Vegetable capsule shell" },
        { field: "component", text: "Mimosa Pudica" },
        { field: "component", text: "create a powerful" },
        { field: "usage", text: "Take one capsule every morning with water." },
      ],
    },
  ];
  const blocked = await runGeneration(
    {
      productName: "Northridge Capsules",
      category: "dietary supplement",
      salesUrl: "https://shop.northridge.example/capsules",
      language: "en",
      market: "US",
      goal: "INFORM",
    },
    { storeRoot, injectedSources: sources },
  );
  assert(blocked.copy?.headline === "Northridge Capsules", "generation headline is the product name");
  assert(blocked.copy?.aiUsed === false, "blocked authorization is not reported as real AI");
  assert(blocked.ai?.fallbackUsed === true, "deterministic fallback is declared");
  assert(blocked.ai?.status === "BLOCKED_AUTHORIZATION" || blocked.ai?.status === "BLOCKED_CONFIGURATION", "real AI execution is blocked");

  const mock = await runGeneration(
    {
      productName: "Northridge Capsules",
      category: "dietary supplement",
      salesUrl: "https://shop.northridge.example/capsules",
      language: "en",
      market: "US",
      goal: "INFORM",
    },
    {
      storeRoot,
      force: true,
      injectedSources: sources,
      aiCaller: async () => ({ text: JSON.stringify(validDraft), latencyMs: 12 }),
    },
  );
  assert(mock.copy?.aiUsed === true || mock.copy?.producer === "AI_COMMERCIAL" || mock.copy?.headline === "Northridge Capsules", "mocked AI either applies or safely falls back");
  if (mock.copy?.aiUsed) {
    assert(mock.ai?.status === "USED", "successful mock is USED");
    assert(mock.ai?.fallbackUsed === false, "successful mock is not a fallback");
  }

  const timedOut = await resolveCommercialCopy({
    copy: {
      copyVersion: 1,
      producer: "DETERMINISTIC_OFFLINE",
      headline: { text: "Northridge Capsules", evidenceRefs: [], contractPaths: ["identity.productName"], producer: "DETERMINISTIC_OFFLINE" },
      introduction: { text: "Northridge Capsules", evidenceRefs: [], contractPaths: ["identity.productName"], producer: "DETERMINISTIC_OFFLINE" },
      sections: [],
      offerMicrocopy: [],
      cta: { action: "NONE" },
      faq: [],
    } satisfies SalesCopy,
    contract: { identity: { productName: "Northridge Capsules", language: "en", slug: "northridge" }, cta: { state: "PREVIEW_ONLY" }, evidence: [], legal: { affiliateDisclosure: "Disclosure." }, status: "RENDERABLE" } as ProductContract,
    brief: { conversionGoal: "INFORM", ctaStrategy: { action: "NONE" } } as ConversionBrief,
    research: structured.research,
    language: "en",
    market: "US",
    caller: async () => {
      throw new Error("timeout");
    },
  });
  assert(timedOut.run.status === "TIMEOUT", "timeout is recorded");
  assert(timedOut.run.fallbackUsed === true, "timeout uses deterministic fallback");
  assert(timedOut.run.producer === "DETERMINISTIC_OFFLINE", "timeout is not presented as real AI");

  const schemaFail = await resolveCommercialCopy({
    copy: timedOut.copy,
    contract: { identity: { productName: "Northridge Capsules", language: "en", slug: "northridge" }, cta: { state: "PREVIEW_ONLY" }, evidence: [], legal: { affiliateDisclosure: "Disclosure." }, status: "RENDERABLE" } as ProductContract,
    brief: { conversionGoal: "INFORM", ctaStrategy: { action: "NONE" } } as ConversionBrief,
    research: structured.research,
    language: "en",
    market: "US",
    env: { OPENAI_API_KEY: "sk-test-openai", AIA_ALLOW_PAID_AI: "0" },
    caller: async () => ({ text: JSON.stringify({ headline: "Only" }), latencyMs: 4 }),
  });
  assert(schemaFail.run.status === "FAILED" && schemaFail.run.fallbackUsed, "invalid schema uses deterministic fallback");

  const ungrounded = await resolveCommercialCopy({
    copy: timedOut.copy,
    contract: { identity: { productName: "Northridge Capsules", language: "en", slug: "northridge" }, cta: { state: "PREVIEW_ONLY" }, evidence: [], legal: { affiliateDisclosure: "Disclosure." }, status: "RENDERABLE" } as ProductContract,
    brief: { conversionGoal: "INFORM", ctaStrategy: { action: "NONE" } } as ConversionBrief,
    research: structured.research,
    language: "en",
    market: "US",
    env: { OPENAI_API_KEY: "sk-test-openai", AIA_ALLOW_PAID_AI: "0" },
    caller: async () => ({
      text: JSON.stringify({ ...validDraft, introduction: "Clinically proven to cure everything with 50% off." }),
      latencyMs: 4,
    }),
  });
  assert(ungrounded.run.fallbackUsed === true, "ungrounded or forbidden AI copy is not applied");
  assert(ungrounded.run.producer === "DETERMINISTIC_OFFLINE", "grounding failure stays deterministic");

  const prompt = buildCommercialCopyPrompt({
    contract: {
      identity: { productName: "Northridge Capsules", language: "en", slug: "northridge" },
      cta: { state: "PREVIEW_ONLY" },
      evidence: [{ id: "e1", sourceUrl: "https://shop.northridge.example/capsules", sourcePageCategory: "PRIMARY", confidence: "DIRECT_SOURCE", copyEligibility: "YES", field: "description" }],
      legal: { affiliateDisclosure: "Disclosure.", trustLinks: [] },
      status: "RENDERABLE",
      dataStates: { "offer.packages": { state: "ABSENT", reason: "NO_VERIFIED_PRICE" } },
    } as ProductContract,
    brief: {
      conversionGoal: "INFORM",
      productCategory: "dietary supplement",
      ctaStrategy: { action: "NONE", reason: "preview only" },
      offerStrategy: { mode: "NO_VERIFIED_PRICE", packageCount: 0, notes: [] },
      sectionPlan: [{ type: "hero", include: true }],
      keyDifferentiators: [{ text: "Vegetable capsule shell", class: "FACT", restriction: "PUBLISHABLE" }],
      benefitCandidates: [{ text: "invented hypothesis", class: "HYPOTHESIS", restriction: "INTERNAL_ONLY" }],
    } as ConversionBrief,
    research: structured.research,
    language: "en",
    market: "US",
  });
  assert(prompt.user.includes("productContract"), "prompt includes the Product Contract");
  assert(prompt.user.includes("conversionBrief"), "prompt includes the Conversion Brief");
  assert(prompt.user.includes("verifiedEvidence"), "prompt includes verified evidence");
  assert(!prompt.user.includes("invented hypothesis"), "hypothesis brief items are not sent as facts");

  let openaiCalls = 0;
  let openaiUrl = "";
  let openaiBody: { model?: string; max_output_tokens?: number } = {};
  const openaiCaller = createConfiguredCopyCaller(
    { OPENAI_API_KEY: "sk-test-openai", AI_PROVIDER: "openai", AIA_ALLOW_PAID_AI: "0" },
    async (url, init) => {
      openaiCalls += 1;
      openaiUrl = String(url);
      openaiBody = JSON.parse(String(init?.body ?? "{}")) as { model?: string; max_output_tokens?: number };
      return new Response(
        JSON.stringify({
          output_text: JSON.stringify(validDraft),
          usage: { input_tokens: 2500, output_tokens: 800 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  );
  const openaiResult = await openaiCaller({ system: "sys", user: "user", schema: { type: "object" }, timeoutMs: 1000 });
  assert(openaiCalls === 1, "OpenAI copy uses one attempt");
  assert(openaiUrl === OPENAI_RESPONSES_URL, "OpenAI copy posts to /v1/responses");
  assert(openaiBody.model === "gpt-5-mini", "OpenAI copy requests gpt-5-mini");
  assert(openaiBody.max_output_tokens === COPY_MAX_OUTPUT_TOKENS, "OpenAI copy respects the token cap");
  assert(openaiResult.costEstimate === "$0.002225", "token usage produces a cost estimate");
  assert(openaiResult.usage?.inputTokens === 2500 && openaiResult.usage?.outputTokens === 800, "token usage is recorded");

  let anthropicUrl = "";
  const anthropicCaller = createConfiguredCopyCaller(
    { OPENAI_API_KEY: "sk-test-openai", ANTHROPIC_API_KEY: "sk-ant-test", AI_PROVIDER: "anthropic" },
    async (url) => {
      anthropicUrl = String(url);
      return new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(validDraft) }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  );
  await anthropicCaller({ system: "sys", user: "user", schema: { type: "object" }, timeoutMs: 1000 });
  assert(anthropicUrl.includes("/v1/messages"), "Anthropic alternative still uses Messages API");
  assert(categoryGuidance("ELECTRONICS").toLowerCase().includes("functions"), "electronics editorial guidance is distinct");
  assert(categoryGuidance("BEAUTY").toLowerCase().includes("ingredients"), "beauty editorial guidance is distinct");
  assert(categoryGuidance("GENERAL").toLowerCase().includes("characteristics"), "general editorial guidance is distinct");

  const badCopy = {
    copyVersion: 1 as const,
    producer: "DETERMINISTIC_OFFLINE" as const,
    headline: { text: "Mimosa Pudica", evidenceRefs: [], contractPaths: ["valueProposition.headline"], producer: "DETERMINISTIC_OFFLINE" as const },
    introduction: { text: "create a powerful", evidenceRefs: [], contractPaths: ["description"], producer: "DETERMINISTIC_OFFLINE" as const },
    sections: [],
    offerMicrocopy: [],
    cta: { action: "NONE" as const },
    faq: [],
  };
  const inspected = inspectContentQuality({
    copy: badCopy,
    contract: { identity: { productName: "Northridge Capsules" }, components: [{ name: "Mimosa Pudica", evidenceRefs: [] }], cta: { state: "PREVIEW_ONLY" }, offer: undefined } as ProductContract,
    brief: { conversionGoal: "INFORM" } as ConversionBrief,
  });
  assert(inspected.some((item) => item.id === "headline-ingredient"), "quality gate blocks ingredient headlines");
  const repaired = repairContentQuality({
    copy: badCopy,
    contract: { identity: { productName: "Northridge Capsules" }, components: [{ name: "Mimosa Pudica", evidenceRefs: [] }], cta: { state: "PREVIEW_ONLY" } } as ProductContract,
    brief: { conversionGoal: "INFORM" } as ConversionBrief,
  });
  assert(repaired.copy.headline.text === "Northridge Capsules", "controlled repair restores product identity");

  console.log("MOCK_TEST_PASS");
  console.log("REAL_AI_EXECUTION_BLOCKED");
  console.log(`PASS ${passed} assertions`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
