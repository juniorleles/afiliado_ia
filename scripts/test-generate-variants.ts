// npx tsx scripts/test-generate-variants.ts
import {
  buildPrompt,
  parseVariantsResponse,
  VariantParseError,
  VARIANT_APPROACHES,
  VARIANT_JSON_SCHEMA,
} from "../src/lib/ai/generate-variants.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const schemaJson = JSON.stringify(VARIANT_JSON_SCHEMA);
assert(!schemaJson.includes("minItems"), "Anthropic schema omits unsupported minItems");
assert(!schemaJson.includes("maxItems"), "Anthropic schema omits unsupported maxItems");
assert(schemaJson.includes('"additionalProperties":false'), "Anthropic schema sets additionalProperties false");

const p1 = buildPrompt({ productName: "Winter Jacket XT-200" });
assert(p1.user.includes("Winter Jacket XT-200"), "prompt inclui o nome do produto");
assert(!p1.user.includes("https://"), "sem sourceUrl, não menciona URL nenhuma");
assert(p1.system.includes("native English"), "system prompt reforça inglês nativo");
assert(p1.system.includes("Never claim"), "system prompt proíbe alegar aprovação do Google");
assert(p1.system.includes("fake scarcity"), "system prompt proíbe escassez/countdown inventados");
assert(p1.system.includes("unsupported medical claims") || p1.system.includes("medical outcomes"), "system prompt reforça claims médicos sem evidência");
assert(p1.system.includes("AUTHORIZED_BLOCKS") || p1.user.includes("AUTHORIZED_BLOCKS"), "prompt states authorized blocks");
assert(p1.system.includes("Do not add blocks"), "model cannot add block types");
assert(p1.system.includes("Zero FAQs is valid") || p1.user.includes("OPTIONAL_BLOCKS"), "zero FAQs remain valid");
assert(p1.system.includes("REVIEW"), "system pede abordagem REVIEW");
assert(p1.system.includes("EDUCATIONAL"), "system pede abordagem EDUCATIONAL");
assert(p1.system.includes("BUYER_GUIDE"), "system pede abordagem BUYER_GUIDE");
assert(p1.system.includes("world knowledge") || p1.system.includes("Do NOT use model world"), "system prompt forbids model world knowledge");
assert(p1.system.includes("DIRECT_SOURCE"), "system prompt distinguishes seller provenance from verified fact");
assert(p1.system.includes("research suggests") || p1.system.includes("research shows"), "system prompt forbids unsourced research language");
assert(p1.system.includes("may support"), "system prompt forbids strengthening seller hedges");
assert(p1.system.includes("drug interactions") || p1.system.includes("evaluation timelines"), "system prompt forbids inferred safety and timelines");
assert(p1.system.includes("encyclopedia") || p1.system.includes("category science"), "EDUCATIONAL must not invent category science");
assert(p1.system.includes("Learn More"), "system prompt prefers Learn More CTA");
assert(p1.system.includes("View Product Details"), "system prompt still allows View Product Details");
assert(p1.system.includes("Check Current Details"), "system prompt prefers Check Current Details over official-authority CTAs");
assert(
  /Do NOT use[\s\S]{0,80}Visit Official Website/i.test(p1.system),
  "Visit Official Website is forbidden without official brand identity",
);

const grounded = emptyProductFacts("Winter Jacket XT-200", "", "MANUAL");
grounded.features = ["Water-resistant shell for commuting"];
grounded.confidence.features = "DIRECT_SOURCE";
const pFacts = buildPrompt({ productName: "Winter Jacket XT-200", facts: grounded });
assert(pFacts.user.includes("Water-resistant shell for commuting"), "only supplied features are sent");
assert(pFacts.user.includes("Ingredients / components: NOT_FOUND"), "missing ingredients are not invented");
assert(pFacts.user.includes("Pricing: NOT_FOUND"), "missing price is not invented");
assert(pFacts.user.includes("Guarantee: NOT_FOUND"), "missing guarantee is not invented");
assert(pFacts.user.includes("Manufacturer: NOT_FOUND"), "missing manufacturer stays NOT_FOUND");
assert(pFacts.user.includes("omit"), "NOT_FOUND fields are explicitly omitted");
assert(pFacts.user.includes("NOT independent scientific verification") || pFacts.system.includes("independently scientifically verified"), "prompt states DIRECT_SOURCE is not scientific verification");
assert(pFacts.user.includes("world knowledge") || pFacts.system.includes("world knowledge"), "facts prompt forbids world knowledge");
assert(!pFacts.user.includes("Vitamin"), "no leftover invented ingredient names");
assert(pFacts.system.includes("typical CFU") || pFacts.system.includes("category-wide ranges"), "prompt forbids inferred category statistics");

const heuristicFacts = emptyProductFacts("Sample Product", "", "IMPORTED");
heuristicFacts.guaranteeInformation = "Read the full refund policy";
heuristicFacts.confidence.guaranteeInformation = "HEURISTIC_EXTRACTION";
const pHeuristic = buildPrompt({ productName: "Sample Product", facts: heuristicFacts });
assert(!pHeuristic.user.includes("Read the full refund policy"), "TEST N: heuristic guarantee text is not copy-eligible in the prompt");
assert(pHeuristic.user.includes("NOT COPY-ELIGIBLE (HEURISTIC_EXTRACTION)"), "TEST N: heuristic fields are labeled not copy-eligible");
assert(pHeuristic.system.includes("Learn More"), "safe CTA remains in system prompt");

const p2 = buildPrompt({ productName: "Hat", sourceUrl: "https://example.com/hat" });
assert(p2.user.includes("https://example.com/hat"), "com sourceUrl, o prompt inclui a URL");

const validJson = JSON.stringify([
  { headline: "H1", body: "## Benefits\n\n- Warm", ctaLabel: "Check price" },
  { headline: "H2", body: "## Benefits\n\n- Warm", ctaLabel: "Check price" },
  { headline: "H3", body: "## Benefits\n\n- Warm", ctaLabel: "Check price" },
]);
const variants = parseVariantsResponse(validJson);
assert(variants.length === 3, "3 variantes parseadas");
assert(variants[0].headline === "H1", "campo headline preservado");
assert(
  variants.map((v) => v.approach).join(",") === VARIANT_APPROACHES.join(","),
  "fallback assigns REVIEW, EDUCATIONAL, BUYER_GUIDE",
);

const labeled = parseVariantsResponse(
  JSON.stringify([
    { approach: "BUYER_GUIDE", headline: "G", body: "B", ctaLabel: "View Product Details" },
    { approach: "REVIEW", headline: "R", body: "B", ctaLabel: "Check Current Price" },
    { approach: "EDUCATIONAL", headline: "E", body: "B", ctaLabel: "Visit Official Website" },
  ]),
);
assert(labeled[0].approach === "REVIEW" && labeled[1].approach === "EDUCATIONAL" && labeled[2].approach === "BUYER_GUIDE", "approaches are ordered REVIEW / EDUCATIONAL / BUYER_GUIDE");

const fenced = "```json\n" + validJson + "\n```";
assert(parseVariantsResponse(fenced).length === 3, "code fence é removido antes de tentar parsear");

const fencedWithProse = `Sure, here is the JSON:\n\`\`\`json\n${validJson}\n\`\`\`\nLet me know if you need edits.`;
assert(parseVariantsResponse(fencedWithProse).length === 3, "JSON fence with surrounding prose is extracted");

const wrapped = JSON.stringify({
  variants: [
    { approach: "REVIEW", headline: "H1", body: "B1", ctaLabel: "C1" },
    { approach: "EDUCATIONAL", headline: "H2", body: "B2", ctaLabel: "C2" },
    { approach: "BUYER_GUIDE", headline: "H3", body: "B3", ctaLabel: "C3" },
  ],
});
assert(parseVariantsResponse(wrapped)[0].approach === "REVIEW", "structured-output object wrapper is accepted");

const proseArray = `Here you go:\n${validJson}\nThanks.`;
assert(parseVariantsResponse(proseArray).length === 3, "JSON array embedded in prose is extracted");

function expectParseError(input: string, mustInclude: string, label: string) {
  try {
    parseVariantsResponse(input);
    throw new Error(`FALHOU: ${label} deveria ter lançado erro`);
  } catch (err) {
    assert(err instanceof VariantParseError, `${label}: erro é VariantParseError`);
    assert(
      (err as Error).message.includes(mustInclude),
      `${label}: mensagem menciona "${mustInclude}" (veio: "${(err as Error).message}")`,
    );
  }
}

expectParseError("isto não é json", "JSON válido", "JSON quebrado");
expectParseError('{"not": "an array"}', "array", "objeto em vez de array");
expectParseError(
  '[{"approach":"REVIEW","headline":"H","body":"B","ctaLabel":"C"},{"approach":"EDUCATIONAL","headline":"H2","body":"B2","ctaLabel":"C2"}',
  "truncada",
  "JSON truncado não é aceito silenciosamente",
);
expectParseError(
  JSON.stringify([{ headline: "H1", body: "B1", ctaLabel: "C1" }]),
  "3 variante",
  "só 1 variante em vez de 3",
);
expectParseError(
  JSON.stringify([
    { headline: "H1", body: "B1", ctaLabel: "C1" },
    { headline: "", body: "B2", ctaLabel: "C2" },
    { headline: "H3", body: "B3", ctaLabel: "C3" },
  ]),
  'campo "headline"',
  "campo vazio numa das variantes",
);
expectParseError(
  JSON.stringify([
    { headline: "H1", body: "B1" },
    { headline: "H2", body: "B2", ctaLabel: "C2" },
    { headline: "H3", body: "B3", ctaLabel: "C3" },
  ]),
  'campo "ctaLabel"',
  "campo totalmente ausente numa das variantes",
);

console.log("\nTodos os testes das funções puras de geração passaram.");
