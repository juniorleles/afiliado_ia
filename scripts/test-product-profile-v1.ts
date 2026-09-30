/**
 * Product profile analyzer — fictional rules, then stored fixtures.
 * The analyzer reads ProductFacts only.
 */
import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { extractProductFacts } from "../src/lib/import-product.ts";
import { expandFirstPartySources } from "../src/lib/first-party-source-expansion.ts";
import { emptyProductFacts, type ProductFacts } from "../src/lib/product-facts.ts";
import { analyzeProductProfile, type ProductProfile } from "../src/lib/product-profile.ts";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.log("FALHOU: " + msg);
    return;
  }
  console.log("OK: " + msg);
}

function facts(name: string): ProductFacts {
  const next = emptyProductFacts(name, "https://harbor.example/product", "MANUAL");
  next.confidence.productName = "MANUAL";
  return next;
}

{
  const empty = facts("Harbor Flask");
  const profile = analyzeProductProfile(empty);
  assert(profile.density === "LOW" && profile.confidence === 0, `empty authorized facts are LOW/0 -> ${profile.density}/${profile.confidence}`);
  assert(profile.ingredientCount === 0 && profile.featureCount === 0 && profile.offerCount === 0, "empty counts stay zero");
}

{
  const sparse = facts("Harbor Flask");
  sparse.features = ["Glass wall", "Steel lid"];
  sparse.confidence.features = "HEURISTIC_EXTRACTION";
  sparse.usageInformation = ["Fill with cold water."];
  sparse.confidence.usageInformation = "DIRECT_SOURCE";
  sparse.guaranteeInformation = "Returns are accepted for 30 days.";
  sparse.confidence.guaranteeInformation = "DIRECT_SOURCE";
  const profile = analyzeProductProfile(sparse);
  assert(profile.featureCount === 0, "heuristic features are not authorized");
  assert(profile.usagePresent && profile.guaranteePresent, "direct usage and guarantee count");
  assert(profile.density === "LOW", `two authorized sections stay LOW -> ${profile.density}`);
}

{
  const rich = facts("Northwind Lamp");
  rich.description = "Northwind Lamp is an adjustable desk lamp.";
  rich.confidence.description = "DIRECT_SOURCE";
  rich.features = Array.from({ length: 6 }, (_, index) => `Feature ${index + 1}`);
  rich.confidence.features = "DIRECT_SOURCE";
  rich.ingredientsOrComponents = Array.from({ length: 12 }, (_, index) => `Component ${index + 1}`);
  rich.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
  rich.usageInformation = ["Plug the lamp into a USB adapter."];
  rich.confidence.usageInformation = "DIRECT_SOURCE";
  rich.guaranteeInformation = "The seller publishes a 60-day return window.";
  rich.confidence.guaranteeInformation = "DIRECT_SOURCE";
  rich.cautions = ["Keep the lamp away from standing water."];
  rich.confidence.cautions = "DIRECT_SOURCE";
  rich.offerFacts = [1, 2, 3].map((index) => ({
    packageName: `${index} lamps`,
    unitPrice: `$${index * 40}`,
    sourceUrl: "https://harbor.example/offers",
    confidence: "DIRECT_SOURCE" as const,
    imageUrl: `https://harbor.example/offer-${index}.png`,
  }));
  rich.productImageUrl = "https://harbor.example/lamp.png";
  rich.productImageProvenance = "DIRECT_SOURCE";
  rich.manufacturer = "Northwind Works";
  rich.confidence.manufacturer = "DIRECT_SOURCE";
  const profile = analyzeProductProfile(rich);
  assert(profile.density === "PREMIUM" || profile.density === "HIGH", `a full authorized set is dense -> ${profile.density}`);
  assert(profile.ingredientCount === 12 && profile.featureCount === 6 && profile.offerCount === 3, "rich counts follow authorized lists");
  assert(profile.pricingPresent && profile.visualAssets === 4, `offers and images count -> assets=${profile.visualAssets}`);
  assert(profile.confidence > 0.7, `completeness rises with authorized fields -> ${profile.confidence}`);
}

{
  const source = readFileSync("src/lib/product-profile.ts", "utf8");
  assert(!/visiflora|neuro serge|joint genesis|prodentim|audifort/i.test(source), "the analyzer has no product branch");
  assert(!/from ["']@\/components|from ["']@\/lib\/premium|visual-master|presell-page/.test(source), "the analyzer is not coupled to rendering");
}

function loadFacts(file: string): ProductFacts {
  const parsed = JSON.parse(readFileSync(file, "utf8")) as ProductFacts | { facts: ProductFacts };
  return "facts" in parsed ? parsed.facts : parsed;
}

function line(profile: ProductProfile): string {
  return [
    `density=${profile.density}`,
    `confidence=${profile.confidence}`,
    `ingredients=${profile.ingredientCount}`,
    `features=${profile.featureCount}`,
    `offers=${profile.offerCount}`,
    `faq=${profile.faqCount}`,
    `warnings=${profile.warningCount}`,
    `usage=${profile.usagePresent}`,
    `guarantee=${profile.guaranteePresent}`,
    `pricing=${profile.pricingPresent}`,
    `description=${profile.descriptionPresent}`,
    `manufacturer=${profile.manufacturerPresent}`,
    `visuals=${profile.visualAssets}`,
  ].join(" ");
}

const stored = {
  neuroSerge: loadFacts("data/multi-product-validation/neuro-serge/import-facts.json"),
  prodentim: loadFacts("data/generic-lp-engine/v1/prodentim-replay-04/product-facts.json"),
  audifort: loadFacts("data/generic-lp-engine/v1/audifort-final-controlled-v1/product-facts.json"),
  jointGenesis: loadFacts("data/controlled-ready-13/2026-09-21-controlled-visual-13/import-facts.json"),
};

const db = new Database("data/presell-os.db", { readonly: true, fileMustExist: true });
const campaign = db
  .prepare("SELECT sourceFactsJson FROM campaigns WHERE slug = ?")
  .get("joint-genesis-controlled-ready-13") as { sourceFactsJson: string } | undefined;
if (campaign?.sourceFactsJson) stored.jointGenesis = JSON.parse(campaign.sourceFactsJson) as ProductFacts;
db.close();

const profiles = {
  neuroSerge: analyzeProductProfile(stored.neuroSerge),
  jointGenesis: analyzeProductProfile(stored.jointGenesis),
  prodentim: analyzeProductProfile(stored.prodentim),
  audifort: analyzeProductProfile(stored.audifort),
};

const signatures = Object.values(profiles).map((profile) => line(profile));
assert(new Set(signatures).size === signatures.length, "stored fixtures produce different profiles");

console.log("NEURO_SERGE_PROFILE=" + line(profiles.neuroSerge));
console.log("JOINT_GENESIS_PROFILE=" + line(profiles.jointGenesis));
console.log("PRODENTIM_PROFILE=" + line(profiles.prodentim));
console.log("AUDIFORT_PROFILE=" + line(profiles.audifort));

async function visiFloraProfile(): Promise<void> {
  const url = "https://getvisiflora.com/welcome/";
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  const html = await response.text();
  const primary = extractProductFacts(html, url, { operatorProductName: "VisiFlora" });
  const facts = (await expandFirstPartySources(primary, html, url)).facts;
  const profile = analyzeProductProfile(facts);
  console.log("VISIFLORA_PROFILE=" + line(profile));
  assert(line(profile) !== line(profiles.neuroSerge), "VisiFlora does not collapse onto the Neuro Serge profile");
  assert(profile.ingredientCount >= 10 && profile.offerCount >= 2, `VisiFlora keeps its authorized volume -> ingredients=${profile.ingredientCount} offers=${profile.offerCount}`);
}

visiFloraProfile()
  .then(() => {
    if (failures > 0) {
      console.log(`PRODUCT PROFILE V1: ${failures} FAILED`);
      process.exit(1);
    }
    console.log("ALL PRODUCT PROFILE V1 TESTS PASSED");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
