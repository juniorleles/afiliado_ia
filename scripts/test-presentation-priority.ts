// npx tsx scripts/test-presentation-priority.ts
import { readFileSync } from "node:fs";
import { authorizedQuantityCount, heroBenefitSplit, presentSavings, quantityImageRepeats, shippingTone } from "../src/lib/premium/presentation-priority.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

assert(authorizedQuantityCount("2 Bottles") === 2, "an explicit count is visualizable");
assert(authorizedQuantityCount("6 Bottles") === 6, "six units stay six");
assert(authorizedQuantityCount("3 Jars") === 3, "the unit word is not hardcoded");
assert(authorizedQuantityCount(undefined) === null, "missing quantity adds no picture");
assert(authorizedQuantityCount("per bottle") === null, "a unit price is not a quantity");
assert(authorizedQuantityCount("a few tins") === null, "a vague phrase is not a count");
assert(quantityImageRepeats(6, null) === null, "an uncounted packshot is not repeated");
assert(quantityImageRepeats(6, 1) === 6, "a single-unit asset may be repeated to the authorized count");
assert(quantityImageRepeats(6, 2) === null, "a multi-unit asset is not repeated");
assert(quantityImageRepeats(2, 2) === null, "a two-unit asset is not shown as a quantity of two");
assert(quantityImageRepeats(3, 2) === null, "a count that the asset cannot match is omitted");

assert(presentSavings("Savings: $434") === "SAVE $434", "a savings line may be restated with the same amount");
assert(presentSavings("Savings: $40") === "SAVE $40", "a smaller authorized savings stays that amount");
assert(presentSavings("Savings: $12 after mail-in") === "Savings: $12 after mail-in", "extra savings words stay verbatim");
assert(presentSavings(undefined) === null, "missing savings adds nothing");
assert(!String(presentSavings("Savings: $10")).includes("%"), "no percentage is calculated");

assert(shippingTone("+ Free US Shipping") === "advantage", "explicit free shipping can be emphasized");
assert(shippingTone("+ small shipping fee") === "plain", "a fee is not a free-shipping treatment");
assert(shippingTone("Shipping calculated later") === "plain", "shipping without free stays plain");
assert(shippingTone(undefined) === null, "missing shipping adds nothing");

const line = "Northwind brings together listed minerals for ordinary daily use, helping you maintain steady comfort and daytime ease.";
const split = heroBenefitSplit(line);
assert(split?.benefit === "Help Maintain Steady Comfort & Daytime Ease", "the help clause leads in the same words");
assert(split?.support.startsWith("Northwind brings together"), "the composition clause stays supporting copy");
assert(!/improve|restore|recover|proven|safe/i.test(split?.benefit ?? ""), "the benefit does not gain a new claim");
assert(heroBenefitSplit("Joint Genesis supports lubrication and flexibility.") === null, "a sentence without that clause stays whole");
assert(heroBenefitSplit("Short, helping you rest.") === null, "a thin clause is not promoted");

const blocks = readFileSync("src/components/presell/presentation-blocks.tsx", "utf8");
const priority = readFileSync("src/lib/premium/presentation-priority.ts", "utf8");
assert(!/best seller|most popular|best value|our pick|recommended/i.test(priority), "priority does not invent a winner");
assert(!blocks.includes("offer.imageUrl"), "seller composites are not the quantity art");
assert(!blocks.includes("packshotSrc"), "the multi-unit packshot is not used as a quantity fan");
assert(blocks.includes("quantityImageRepeats"), "quantity art requires a known unit count");
const page = readFileSync("src/components/presell/presell-page-view.tsx", "utf8");
assert(!page.includes("packshotSrc"), "the page does not pass the hero photo into pricing");
assert(!page.includes("unitsDepicted"), "the page does not guess how many units a photo contains");
const marks = readFileSync("src/components/presell/decorative-marks.tsx", "utf8");
assert(!/\b(molecule|leaf|botanical|eyes?|shield|seal|star|badge|certificate)\b/i.test(marks), "icons stay geometric");
assert(!/astaxanthin|eyebright|visiflora/i.test(marks + blocks + priority), "icons are not named after a product or ingredient");

console.log("presentation priority ok");
