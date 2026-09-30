/** Read-only probe: current prompt size against the 16000-character budget. */
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { buildPrompt } from "../src/lib/ai/generate-variants.ts";

const facts = emptyProductFacts("Joint Genesis", "https://jointgenesisofficial.com/", "IMPORTED");
facts.description =
  "See how Joint Genesis supports lubrication, flexibility and comfortable movement with five targeted ingredients, daily use and a 180-day vendor";
facts.confidence.description = "DIRECT_SOURCE";
facts.features = [
  "Joint Genesis is designed for steady joint wellness rather than dramatic overnight promises. Its strongest benefit story connects a clearly defined mechanism—supporting synovial-fluid quality—with practical goals such as bending, walking, exercising and handling daily tasks with greater confidence.",
  "The ingredients also give the formula broader support through antioxidants, botanical inflammatory-response compounds and enhanced nutrient absorption. Together, those features create a multi-angle daily formula that is still simple enough to take once each morning.",
];
facts.confidence.features = "DIRECT_SOURCE";
facts.confidence.ingredientsOrComponents = "NOT_FOUND";
facts.confidence.usageInformation = "NOT_FOUND";
facts.confidence.cautions = "NOT_FOUND";
facts.confidence.pricingInformation = "NOT_FOUND";
facts.guaranteeInformation = "Read the full refund policy";
facts.confidence.guaranteeInformation = "HEURISTIC_EXTRACTION";
facts.confidence.manufacturer = "NOT_FOUND";
facts.importQuality = "PARTIAL";

const prompt = buildPrompt({ productName: facts.productName, sourceUrl: facts.sourceUrl, facts });
console.log("PROMPT_SIZE=" + (prompt.system.length + prompt.user.length));
console.log("BUDGET=16000");
