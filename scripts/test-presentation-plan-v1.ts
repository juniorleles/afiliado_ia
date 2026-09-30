/**
 * Presentation planner — fictional rules, then the same stored fixtures
 * the profile analyzer replays. The planner does not render.
 */
import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { extractProductFacts } from "../src/lib/import-product.ts";
import { expandFirstPartySources } from "../src/lib/first-party-source-expansion.ts";
import { emptyProductFacts, type ProductFacts } from "../src/lib/product-facts.ts";
import { analyzeProductProfile, PRODUCT_PROFILE_VERSION, type ProductProfile } from "../src/lib/product-profile.ts";
import { planPresentation, type PresentationPlan } from "../src/lib/presentation-plan.ts";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.log("FALHOU: " + msg);
    return;
  }
  console.log("OK: " + msg);
}

function profile(partial: Partial<ProductProfile> & Pick<ProductProfile, "density">): ProductProfile {
  return {
    version: PRODUCT_PROFILE_VERSION,
    ingredientCount: 0,
    featureCount: 0,
    faqCount: 0,
    offerCount: 0,
    warningCount: 0,
    manufacturerPresent: false,
    pricingPresent: false,
    guaranteePresent: false,
    usagePresent: false,
    descriptionPresent: false,
    visualAssets: 0,
    confidence: 0,
    ...partial,
  };
}

const blank = emptyProductFacts("Harbor Flask", "https://harbor.example/product", "MANUAL");

{
  const plan = planPresentation(
    blank,
    profile({ density: "LOW", featureCount: 0, faqCount: 0, pricingPresent: false, offerCount: 0 }),
  );
  assert(!plan.sectionVisibility.features && !plan.sectionOrder.includes("features"), "absent features stay hidden");
  assert(!plan.sectionVisibility.faq && !plan.sectionOrder.includes("faq"), "absent FAQ stays hidden");
  assert(!plan.sectionVisibility.pricing && plan.sectionVariants.pricing === "NONE", "absent pricing stays hidden");
  assert(plan.density === "LOW" && plan.spacingProfile === "COMPACT" && plan.rhythmProfile === "FAST", "LOW density is consumed, not recomputed");
}

{
  const forced = planPresentation(
    blank,
    profile({
      density: "LOW",
      ingredientCount: 15,
      featureCount: 6,
      offerCount: 3,
      pricingPresent: true,
    }),
  );
  assert(forced.density === "LOW", "a large count does not override the profile density");
  assert(forced.heroStrategy === "FEATURE_CHIPS", `low density with features uses chips -> ${forced.heroStrategy}`);
  assert(forced.sectionVariants.ingredients === "DENSE", "many ingredients stay a dense intent");
  assert(forced.sectionVariants.pricing === "GRID", "three offers are a pricing grid");
}

{
  const rich = planPresentation(
    blank,
    profile({
      density: "PREMIUM",
      descriptionPresent: true,
      featureCount: 6,
      ingredientCount: 12,
      offerCount: 3,
      pricingPresent: true,
      usagePresent: true,
      guaranteePresent: true,
      faqCount: 4,
    }),
  );
  assert(rich.heroStrategy === "BENEFIT", `description plus features on a premium profile is BENEFIT -> ${rich.heroStrategy}`);
  assert(rich.sectionOrder[0] === "hero" && rich.sectionOrder.includes("closing"), "premium order opens on hero and can close");
  assert(rich.sectionOrder.indexOf("features") < rich.sectionOrder.indexOf("pricing"), "features precede pricing when both exist");
  assert(rich.spacingProfile === "AIRY" && rich.rhythmProfile === "EDITORIAL", "premium spacing and rhythm follow density");
  assert(rich.emphasisProfile.includes("hero") && rich.emphasisProfile.includes("ingredients"), "emphasis names primary sections only");
  assert(!JSON.stringify(rich).includes("Harbor"), "the plan contains no product wording");
}

{
  const source = readFileSync("src/lib/presentation-plan.ts", "utf8");
  assert(!/visiflora|neuro serge|joint genesis|prodentim|audifort/i.test(source), "the planner has no product branch");
  assert(!/from ["']@\/components|visual-master|presell-page/.test(source), "the planner is not coupled to rendering");
}

function loadFacts(file: string): ProductFacts {
  const parsed = JSON.parse(readFileSync(file, "utf8")) as ProductFacts | { facts: ProductFacts };
  return "facts" in parsed ? parsed.facts : parsed;
}

function line(plan: PresentationPlan): string {
  return [
    `density=${plan.density}`,
    `hero=${plan.heroStrategy}`,
    `order=${plan.sectionOrder.join(">")}`,
    `ingredients=${plan.sectionVariants.ingredients}`,
    `features=${plan.sectionVariants.features}`,
    `pricing=${plan.sectionVariants.pricing}`,
    `spacing=${plan.spacingProfile}`,
    `rhythm=${plan.rhythmProfile}`,
    `emphasis=${plan.emphasisProfile.join("+")}`,
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

const plans = {
  neuroSerge: planPresentation(stored.neuroSerge, analyzeProductProfile(stored.neuroSerge)),
  jointGenesis: planPresentation(stored.jointGenesis, analyzeProductProfile(stored.jointGenesis)),
  prodentim: planPresentation(stored.prodentim, analyzeProductProfile(stored.prodentim)),
  audifort: planPresentation(stored.audifort, analyzeProductProfile(stored.audifort)),
};

const signatures = Object.values(plans).map((plan) => line(plan));
assert(new Set(signatures).size === signatures.length, "stored fixtures produce different plans");

console.log("NEURO_SERGE_PLAN=" + line(plans.neuroSerge));
console.log("JOINT_GENESIS_PLAN=" + line(plans.jointGenesis));
console.log("PRODENTIM_PLAN=" + line(plans.prodentim));
console.log("AUDIFORT_PLAN=" + line(plans.audifort));

async function visiFloraPlan(): Promise<void> {
  const url = "https://getvisiflora.com/welcome/";
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  const html = await response.text();
  const primary = extractProductFacts(html, url, { operatorProductName: "VisiFlora" });
  const facts = (await expandFirstPartySources(primary, html, url)).facts;
  const plan = planPresentation(facts, analyzeProductProfile(facts));
  console.log("VISIFLORA_PLAN=" + line(plan));
  assert(line(plan) !== line(plans.neuroSerge), "VisiFlora does not reuse the Neuro Serge plan");
  assert(plan.sectionVisibility.pricing && plan.sectionVariants.pricing === "GRID", "authorized offers stay a pricing grid");
  assert(!plan.sectionVisibility.faq, "an empty authorized FAQ stays hidden");
}

visiFloraPlan()
  .then(() => {
    if (failures > 0) {
      console.log(`PRESENTATION PLAN V1: ${failures} FAILED`);
      process.exit(1);
    }
    console.log("ALL PRESENTATION PLAN V1 TESTS PASSED");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
