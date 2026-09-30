import { readFileSync } from "node:fs";
import { classifyAssetCandidate } from "../src/lib/assets/classify.ts";
import { judgeIngredientVisual, meaningfulEmbeddedText } from "../src/lib/assets/ingredient-visual-association.ts";
import { extractSameCardIngredientVisuals } from "../src/lib/import-product.ts";

let failed = 0;
function assert(cond: unknown, message: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL: " + message);
  } else {
    console.log("OK: " + message);
  }
}

const banner = classifyAssetCandidate({ url: "https://cdn.example.com/media/banner-img.png", alt: "" });
assert(!banner.rejected, "a filename containing banner is not a rejection by itself");
const hero = classifyAssetCandidate({ url: "https://cdn.example.com/section/hero-image.png", alt: "Northwind kettle" });
assert(!hero.rejected, "hero, section, and image in a filename do not reject a candidate");
const cta = classifyAssetCandidate({ url: "https://cdn.example.com/order-now-banner.png", alt: "ORDER NOW" });
assert(cta.rejected, "an order-now call to action is still rejected");

const html = `<section>
  <h2>Ingredients</h2>
  <h4>Morning group</h4>
  <div><img src="/bark.png" alt=""><h5>Red Bark</h5><p>Listed beside the image on the same card.</p></div>
  <div><img src="/pair.png" alt=""><h5>Blue Salt &amp; White Clay</h5><p>Two materials named on one card.</p></div>
  <div><img src="/shared.png" alt=""><h5>Ash Handle</h5><p>The first card that contains this image.</p></div>
  <div><img src="/shared.png" alt=""><h5>Tin Lid</h5><p>A later card reuses the same image.</p></div>
</section>
<h2>Pricing</h2>
<div><img src="/offer.png" alt=""><h3>STARTER</h3><p>2 Bottles</p></div>
<h2>Guarantee</h2>
<img src="/seal.png" alt="">`;

const visuals = extractSameCardIngredientVisuals(html, "https://seller.example/kettle");
const names = visuals.map((item) => item.associatedFactValue);
assert(names.join("|") === "Red Bark|Blue Salt & White Clay|Ash Handle|Tin Lid", "same-card headings are the ingredient facts");
assert(visuals.every((item) => item.associationMethod === "same-card" && item.associatedFactType === "ingredient"), "association is same-card ingredient evidence");
assert(!names.includes("STARTER") && !visuals.some((item) => item.assetUrl.endsWith("/seal.png")), "offer and guarantee images are not ingredient associations");
assert(visuals.find((item) => item.associatedFactValue === "Red Bark")?.sourceSection === "Morning group", "the nearest group heading is the source section");

const facts = names;
const red = judgeIngredientVisual({
  associatedFactValue: "Red Bark",
  embeddedText: "",
  factValuesSharingAsset: ["Red Bark"],
  allFactValues: facts,
});
assert(red.assetAuthority === "SOURCE" && red.embeddedTextStatus === "none", "a unique card with no visible text is safe");

const pair = judgeIngredientVisual({
  associatedFactValue: "Blue Salt & White Clay",
  embeddedText: "Salt",
  factValuesSharingAsset: ["Blue Salt & White Clay"],
  allFactValues: facts,
});
assert(pair.assetAuthority === "NONE" && pair.embeddedTextStatus === "conflicts", "text that covers only one part of a pair is not safe");

const ash = judgeIngredientVisual({
  associatedFactValue: "Ash Handle",
  embeddedText: "Ash Handle",
  factValuesSharingAsset: ["Ash Handle", "Tin Lid"],
  allFactValues: facts,
});
assert(ash.assetAuthority === "SOURCE" && ash.embeddedTextStatus === "matches", "shared pixels stay with the identity the text names");
const lid = judgeIngredientVisual({
  associatedFactValue: "Tin Lid",
  embeddedText: "Ash Handle",
  factValuesSharingAsset: ["Ash Handle", "Tin Lid"],
  allFactValues: facts,
});
assert(lid.assetAuthority === "NONE", "the other card does not inherit a conflicting image");

const noise = meaningfulEmbeddedText("ll eggs", "Red Bark", ["Red Bark"]);
assert(noise === "", "unrelated letters are not treated as an ingredient label");

const source = [
  readFileSync("src/lib/assets/ingredient-visual-association.ts", "utf8"),
  readFileSync("src/lib/import-product.ts", "utf8"),
  readFileSync("src/components/presell/presentation-blocks.tsx", "utf8"),
].join("\n");
assert(!/visiflora|astaxanthin|eyebright|getvisiflora/i.test(source), "the association path has no product branch");

if (failed) {
  console.error("INGREDIENT_VISUAL_ASSOCIATION=FAIL " + failed);
  process.exit(1);
}
console.log("INGREDIENT_VISUAL_ASSOCIATION=PASS");
