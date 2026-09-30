/**
 * Component composers follow PresentationPlan.
 * Fictional products prove the rules. Stored fixtures prove the five plans differ.
 * A rich rendered page is not collapsed by a thin profile.
 */
import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { extractProductFacts } from "../src/lib/import-product.ts";
import { expandFirstPartySources } from "../src/lib/first-party-source-expansion.ts";
import type { ProductFacts } from "../src/lib/product-facts.ts";
import { analyzeProductProfile } from "../src/lib/product-profile.ts";
import { planPresentation, type PresentationPlan } from "../src/lib/presentation-plan.ts";
import { composeComponents, followsPresentationPlan } from "../src/lib/premium/component-composers.ts";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.log("FALHOU: " + msg);
    return;
  }
  console.log("OK: " + msg);
}

function direct(plan: PresentationPlan, extra: Partial<Parameters<typeof composeComponents>[0]> = {}) {
  return composeComponents({
    plan,
    identity: "Harbor Trail Flask",
    headline: "Harbor Trail Flask",
    subheadline: "",
    summary: "",
    description: "",
    featureUnits: [],
    legacyContentDensity: "standard",
    ...extra,
  });
}

{
  const hidden = direct(
    planPresentation({} as ProductFacts, {
      version: "product-profile-v1",
      density: "LOW",
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
    }),
  );
  assert(hidden.pricingVariant === "NONE", "absent pricing renders nothing");
  assert(hidden.faqVariant === null && hidden.featureVariant === null, "absent FAQ and features stay collapsed");
  assert(hidden.pageDensity === "low" && hidden.contentDensity === "compact", "LOW density is consumed");
  assert(hidden.spacingProfile === "COMPACT" && hidden.rhythmProfile === "FAST", "spacing and rhythm come from the plan");
}

{
  const chips = [
    "Glass Flask",
    "Steel Lid",
    "Wide Mouth",
    "Leakproof Seal",
  ];
  const dumped = direct(
    planPresentation({} as ProductFacts, {
      version: "product-profile-v1",
      density: "LOW",
      ingredientCount: 6,
      featureCount: 4,
      faqCount: 0,
      offerCount: 0,
      warningCount: 0,
      manufacturerPresent: false,
      pricingPresent: false,
      guaranteePresent: true,
      usagePresent: true,
      descriptionPresent: false,
      visualAssets: 1,
      confidence: 0.2,
    }),
    { headline: chips.join(" "), summary: chips.join(" "), featureUnits: chips },
  );
  assert(dumped.heroStrategy === "FEATURE_CHIPS", `chips strategy -> ${dumped.heroStrategy}`);
  assert(dumped.heroHeadline === "Harbor Trail Flask", "a feature list is not the headline");
  assert(!dumped.heroHeadline.includes("Glass Flask"), "the headline does not concatenate features");
  assert(dumped.heroChips.join("|") === chips.join("|"), "chips stay the authorized feature labels");
  assert(dumped.closing === "Harbor Trail Flask", "closing does not repeat the feature list");
  assert(dumped.featureVariant === "CHIPS", "chips stay in the hero");
  assert(dumped.ingredientVariant === "EDITORIAL", `low ingredient intent -> ${dumped.ingredientVariant}`);
  assert(dumped.usageVariant === "COMPACT" && dumped.guaranteeVariant === "EMPHASIS", "usage and guarantee follow the low plan");
  assert(!JSON.stringify(dumped).includes("supports joint"), "the composer adds no health claim");
}

{
  const one = direct(
    planPresentation({} as ProductFacts, {
      version: "product-profile-v1",
      density: "LOW",
      ingredientCount: 0,
      featureCount: 1,
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
    }),
    { featureUnits: ["A single short label"] },
  );
  assert(one.featureVariant === "HIGHLIGHT", `one feature is a highlight -> ${one.featureVariant}`);
}

{
  const richPlan = planPresentation({} as ProductFacts, {
    version: "product-profile-v1",
    density: "PREMIUM",
    ingredientCount: 15,
    featureCount: 6,
    faqCount: 4,
    offerCount: 3,
    warningCount: 0,
    manufacturerPresent: false,
    pricingPresent: true,
    guaranteePresent: true,
    usagePresent: true,
    descriptionPresent: false,
    visualAssets: 3,
    confidence: 0.8,
  });
  const rich = direct(richPlan, {
    identity: "Northwind Lamp",
    headline: "Northwind Lamp",
    subheadline: "An adjustable desk lamp for a reading desk.",
    featureUnits: ["Warm beam", "Steady arm", "USB port", "Downward shade", "Long cord", "Base switch"],
  });
  assert(rich.pageDensity === "rich" && rich.contentDensity === "standard", "premium stays a rich shell");
  assert(rich.heroStrategy === "BENEFIT" && rich.heroHeadline === "Northwind Lamp", "benefit hero keeps the authorized name");
  assert(rich.ingredientVariant === "DENSE" && rich.featureVariant === "MOSAIC", "rich sections use dense and mosaic");
  assert(rich.pricingVariant === "GRID" && rich.faqVariant === "EDITORIAL", `pricing and faq -> ${rich.pricingVariant}/${rich.faqVariant}`);
  assert(rich.spacingProfile === "AIRY" && rich.rhythmProfile === "EDITORIAL", "premium spacing and rhythm");
  assert(followsPresentationPlan(richPlan, "rich"), "a premium plan follows through on a rich page");
  const thin = planPresentation({} as ProductFacts, {
    version: "product-profile-v1",
    density: "LOW",
    ingredientCount: 0,
    featureCount: 2,
    faqCount: 0,
    offerCount: 0,
    warningCount: 0,
    manufacturerPresent: false,
    pricingPresent: false,
    guaranteePresent: false,
    usagePresent: false,
    descriptionPresent: true,
    visualAssets: 1,
    confidence: 0.25,
  });
  assert(!followsPresentationPlan(thin, "rich"), "a thin profile does not collapse a rich rendered page");
  assert(followsPresentationPlan(thin, "low"), "a thin profile still directs a low rendered page");
}

{
  const source = readFileSync("src/lib/premium/component-composers.ts", "utf8");
  assert(!/visiflora|neuro serge|joint genesis|prodentim|audifort/i.test(source), "composers have no product branch");
  assert(!/from ["']@\/lib\/product-facts|from ["']@\/components/.test(source), "composers do not read facts or draw components");
}

function loadFacts(file: string): ProductFacts {
  const parsed = JSON.parse(readFileSync(file, "utf8")) as ProductFacts | { facts: ProductFacts };
  return "facts" in parsed ? parsed.facts : parsed;
}

function line(plan: PresentationPlan): string {
  const direction = composeComponents({
    plan,
    identity: plan.density,
    headline: plan.density,
    subheadline: "",
    summary: "",
    description: "",
    featureUnits: [],
    legacyContentDensity: "standard",
  });
  return [
    `density=${direction.pageDensity}`,
    `hero=${direction.heroStrategy}`,
    `features=${direction.featureVariant ?? "NONE"}`,
    `ingredients=${direction.ingredientVariant ?? "NONE"}`,
    `pricing=${direction.pricingVariant}`,
    `faq=${direction.faqVariant ?? "NONE"}`,
    `usage=${direction.usageVariant ?? "NONE"}`,
    `guarantee=${direction.guaranteeVariant ?? "NONE"}`,
    `spacing=${direction.spacingProfile}`,
    `rhythm=${direction.rhythmProfile}`,
    `closing=${direction.collapseClosing ? "collapsed" : "open"}`,
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
const lines = {
  neuroSerge: line(plans.neuroSerge),
  jointGenesis: line(plans.jointGenesis),
  prodentim: line(plans.prodentim),
  audifort: line(plans.audifort),
};
assert(new Set(Object.values(lines)).size === 4, "stored fixtures produce different component directions");
assert(!followsPresentationPlan(plans.jointGenesis, "rich"), "joint genesis rich shell stays in place");
assert(followsPresentationPlan(plans.neuroSerge, "low"), "neuro serge low page follows the plan");

console.log("NEURO_SERGE_LAYOUT=" + lines.neuroSerge);
console.log("JOINT_GENESIS_LAYOUT=" + lines.jointGenesis);
console.log("PRODENTIM_LAYOUT=" + lines.prodentim);
console.log("AUDIFORT_LAYOUT=" + lines.audifort);

async function visiFloraLayout(): Promise<void> {
  const url = "https://getvisiflora.com/welcome/";
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  const html = await response.text();
  const primary = extractProductFacts(html, url, { operatorProductName: "VisiFlora" });
  const facts = (await expandFirstPartySources(primary, html, url)).facts;
  const plan = planPresentation(facts, analyzeProductProfile(facts));
  const layout = line(plan);
  console.log("VISIFLORA_LAYOUT=" + layout);
  assert(layout !== lines.neuroSerge, "VisiFlora does not reuse the Neuro Serge layout");
  assert(followsPresentationPlan(plan, "rich"), "VisiFlora rich shell follows the premium plan");
  const direction = composeComponents({
    plan,
    identity: "VisiFlora",
    headline: "VisiFlora",
    subheadline: "",
    summary: "",
    description: "",
    featureUnits: [],
    legacyContentDensity: "standard",
  });
  assert(direction.pageDensity === "rich" && direction.contentDensity === "standard", "VisiFlora stays rich");
  assert(direction.pricingVariant === "GRID" && direction.ingredientVariant === "DENSE", "VisiFlora pricing and ingredients stay rich variants");
}

visiFloraLayout()
  .then(() => {
    if (failures > 0) {
      console.log(`COMPONENT COMPOSERS V1: ${failures} FAILED`);
      process.exit(1);
    }
    console.log("ALL COMPONENT COMPOSER V1 TESTS PASSED");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
