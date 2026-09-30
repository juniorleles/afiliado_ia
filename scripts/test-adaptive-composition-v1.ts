/**
 * Adaptive composition — fictional products only.
 * Layout follows counts. Authorized wording is rearranged, never rewritten.
 */
import type { PresellSection } from "../src/lib/presell-page.ts";
import { composeAdaptivePresentation } from "../src/lib/premium/adaptive-composition.ts";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.log("FALHOU: " + msg);
    return;
  }
  console.log("OK: " + msg);
}

function section(
  id: PresellSection["id"],
  extra: Partial<PresellSection> = {},
): PresellSection {
  return {
    id,
    title: id,
    visible: true,
    paragraphs: [],
    bullets: [],
    cards: [],
    faq: [],
    ...extra,
  };
}

const hidden = (id: PresellSection["id"]): PresellSection => section(id, { visible: false });

const lowFeatures = ["Glass Flask", "Steel Lid", "Wide Mouth", "Leakproof Seal"];
const lowJoined = lowFeatures.join(" ");

const low = composeAdaptivePresentation({
  productName: "Harbor Trail Flask",
  headline: lowJoined,
  subheadline: "",
  summary: lowJoined,
  sections: [
    hidden("overview"),
    section("features", { title: "Key Features", paragraphs: [lowJoined] }),
    section("ingredients", {
      title: "Ingredients",
      cards: ["Red Bark", "Blue Salt", "Cedar Oil", "River Mint", "Stone Yeast", "Amber Resin"].map((title) => ({
        title,
        body: "",
      })),
    }),
    section("usage", { paragraphs: ["Fill the flask with cold water."] }),
    section("guarantee", { paragraphs: ["The seller publishes a 180-day return window."] }),
    hidden("faq"),
  ],
  structuredLists: [lowFeatures],
  offerCount: 0,
});

assert(low.mode === "low", `LOW density for a short authorized page -> ${low.mode}`);
assert(low.heroStrategy === "identity", `LOW hero uses identity -> ${low.heroStrategy}`);
assert(low.heroHeadline === "Harbor Trail Flask", `LOW headline is the product name -> ${low.heroHeadline}`);
assert(!low.heroHeadline.includes("Glass Flask"), "LOW headline is not the feature list");
assert(low.heroChips.join("|") === lowFeatures.join("|"), `LOW features become chips -> ${low.heroChips.join("|")}`);
assert(low.closing === "Harbor Trail Flask", `LOW closing does not repeat the feature list -> ${low.closing}`);
assert(low.ingredientPresentation === "editorial", `LOW ingredients use editorial cards -> ${low.ingredientPresentation}`);
assert(low.ingredientUnits.length === 6, "LOW keeps every ingredient");
assert(low.omitDecorativePause && low.omitSectionMoment, "LOW collapses absent offer space");
assert(!low.heroSupport.includes("Glass Flask"), "LOW does not reuse the feature list as the value line");

const one = composeAdaptivePresentation({
  productName: "Harbor Trail Flask",
  headline: "A full refund on the price of the bottles purchased is available after the return arrives at the facility.",
  subheadline: "",
  summary: "",
  sections: [
    section("features", {
      paragraphs: ["A full refund on the price of the bottles purchased is available after the return arrives at the facility."],
    }),
    section("usage", { paragraphs: ["Rinse the flask and let it dry."] }),
    section("guarantee", { paragraphs: ["Returns are accepted within 30 days."] }),
  ],
  structuredLists: [],
  offerCount: 0,
});
assert(one.mode === "low" && one.featurePresentation === "strip", `one feature is a strip -> ${one.mode}/${one.featurePresentation}`);
assert(one.heroHeadline === "Harbor Trail Flask", "one long feature is not the hero headline");
assert(one.featureUnits.length === 1 && one.featurePlacement === "section", "the single feature stays in its section");

const pair = composeAdaptivePresentation({
  productName: "Northwind Lamp",
  headline: "Warm LED USB Charging",
  subheadline: "",
  summary: "",
  sections: [section("features", { bullets: ["Warm LED", "USB Charging"] })],
  structuredLists: [["Warm LED", "USB Charging"]],
  offerCount: 0,
});
assert(pair.featurePresentation === "cards", `two short features are compact cards -> ${pair.featurePresentation}`);

const richFeatures = [
  "Northwind Lamp casts a warm beam across a desk.",
  "The arm holds a chosen angle during the workday.",
  "A USB port sits in the base of the lamp.",
  "The shade aims the beam downward onto the page.",
  "The cord reaches a nearby outlet without an added adapter.",
  "The switch is a single press on the base.",
];
const richIngredients = Array.from({ length: 15 }, (_, index) => `Component ${index + 1}`);
const rich = composeAdaptivePresentation({
  productName: "Northwind Lamp",
  headline: "Northwind Lamp",
  subheadline: "Northwind Lamp is an adjustable desk lamp for a reading desk.",
  summary: "Northwind Lamp is an adjustable desk lamp for a reading desk.",
  sections: [
    section("overview", { paragraphs: ["Northwind Lamp is an adjustable desk lamp for a reading desk and a late work session."] }),
    section("features", { bullets: richFeatures }),
    section("ingredients", { cards: richIngredients.map((title) => ({ title, body: "" })) }),
    section("usage", { paragraphs: ["Plug the lamp into a USB adapter."] }),
    section("guarantee", { paragraphs: ["The seller publishes a 60-day return window."] }),
    section("faq", {
      faq: [
        { question: "One?", answer: "Yes." },
        { question: "Two?", answer: "Yes." },
        { question: "Three?", answer: "Yes." },
      ],
    }),
  ],
  structuredLists: [richFeatures, richIngredients],
  offerCount: 3,
});
assert(rich.mode === "rich", `RICH density for a full page -> ${rich.mode}`);
assert(rich.heroStrategy === "given" && rich.heroHeadline === "Northwind Lamp", "RICH keeps the given headline");
assert(rich.heroSupport.includes("adjustable desk lamp"), "RICH keeps the authorized support line");
assert(rich.featurePresentation === "grid", `RICH features use a grid -> ${rich.featurePresentation}`);
assert(rich.ingredientPresentation === "dense" && rich.ingredientUnits.length === 15, "RICH ingredients stay a dense grid");
assert(!rich.omitDecorativePause && !rich.omitSectionMoment, "RICH keeps the surrounding rhythm");
assert(rich.closing === "Northwind Lamp", "RICH closing keeps the product name");

const reference = composeAdaptivePresentation({
  productName: "Fernwick Joint Tonic",
  headline: "Fernwick Joint Tonic",
  subheadline: "Fernwick Joint Tonic uses five targeted ingredients to support lubrication, flexibility and comfortable movement.",
  summary: "Fernwick Joint Tonic uses five targeted ingredients to support lubrication, flexibility and comfortable movement.",
  sections: [
    section("overview", {
      paragraphs: ["Fernwick Joint Tonic combines five targeted ingredients to support lubrication, flexibility and comfortable movement."],
    }),
    section("features", {
      bullets: [
        "Fernwick Joint Tonic is formulated for steady joint wellness rather than dramatic overnight promises.",
        "It links supporting synovial-fluid quality with a daily capsule.",
      ],
    }),
    section("usage", { paragraphs: ["Take one capsule daily with water, preferably in the morning."] }),
    section("guarantee", { paragraphs: ["The seller publishes a 180-day return policy measured from the order date."] }),
    section("faq", {
      faq: [
        { question: "A?", answer: "The seller publishes a 180-day return policy measured from the order date." },
        { question: "B?", answer: "Take one capsule daily with water." },
        { question: "C?", answer: "The listing names five ingredients." },
        { question: "D?", answer: "No pricing is stated." },
      ],
    }),
  ],
  structuredLists: [],
  offerCount: 0,
});
assert(reference.mode === "rich", `reference editorial page stays rich -> ${reference.mode}`);
assert(reference.heroStrategy === "given" && reference.heroHeadline === "Fernwick Joint Tonic", "reference hero is unchanged");
assert(reference.featurePresentation === "paragraphs", `reference features stay paragraphs -> ${reference.featurePresentation}`);
assert(reference.ingredientPresentation === "notes", "reference has no ingredient recomposition");
assert(reference.closing === "Fernwick Joint Tonic", "reference closing stays the headline");
assert(!reference.replacedFeatureHeadline, "reference does not treat the product name as a feature dump");

if (failures > 0) {
  console.log(`ADAPTIVE COMPOSITION V1: ${failures} FAILED`);
  process.exit(1);
}
console.log("ALL ADAPTIVE COMPOSITION V1 TESTS PASSED");
