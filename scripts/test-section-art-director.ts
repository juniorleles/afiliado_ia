// npx tsx scripts/test-section-art-director.ts
import { readFileSync } from "node:fs";
import { offerAssetAssociation, quantityImageRepeats } from "../src/lib/premium/presentation-priority.ts";
import { directSectionArt, LAYOUT_ARCHETYPES } from "../src/lib/premium/section-art-director.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const clarity = directSectionArt({
  authorizedCopy: "Harbor supports clear vision and daily comfort with listed nutrients.",
  packshotReady: true,
  sections: [
    { id: "overview-bridge", itemCount: 0 },
    { id: "ingredients", itemCount: 15 },
    { id: "usage", itemCount: 1 },
    { id: "features", itemCount: 6 },
    { id: "guarantee", itemCount: 1 },
    { id: "offer", itemCount: 3 },
    { id: "closing", itemCount: 1 },
    { id: "faq", itemCount: 3 },
  ],
});

const movement = directSectionArt({
  authorizedCopy: "Northwind supports flexibility and comfortable movement with five targeted ingredients.",
  packshotReady: true,
  sections: [
    { id: "features", itemCount: 2 },
    { id: "usage", itemCount: 1 },
    { id: "faq", itemCount: 2 },
  ],
});

assert(clarity.version === "section-art-director-v2", "the director has a version");
assert(clarity.factualAuthority === "NONE", "art direction is not evidence");
assert(clarity.motif === "clarity", "vision wording selects a clarity atmosphere");
assert(movement.motif === "movement", "movement wording selects its own atmosphere");
assert(clarity.motif !== movement.motif, "two products do not share one motif");
assert(clarity.sections.find((item) => item.sectionRole === "ingredients")?.layoutArchetype === "DENSE_FACT_GRID", "a large ingredient list uses a dense grid");
assert(clarity.sections.find((item) => item.sectionRole === "features")?.layoutArchetype === "FEATURE_MOSAIC", "several features use a mosaic");
assert(movement.sections.find((item) => item.sectionRole === "features")?.layoutArchetype === "EDITORIAL_SPLIT", "two features stay an editorial split");
assert(clarity.sections.find((item) => item.sectionRole === "usage")?.layoutArchetype === "CONTENT_CLUSTER", "usage is an instruction cluster");
assert(clarity.sections.find((item) => item.sectionRole === "guarantee")?.layoutArchetype === "GUARANTEE_BAND", "a guarantee is a reassurance band");
assert(clarity.sections.find((item) => item.sectionRole === "offer")?.layoutArchetype === "OFFER_STAGE", "several offers become a stage");
assert(!movement.sections.some((item) => item.sectionRole === "offer"), "missing offers are not invented");
assert(clarity.sections.find((item) => item.sectionRole === "offer")?.assetStrategy === "NONE", "offer quantity art is not assumed");
assert(clarity.sections.every((item) => item.factualAuthority === "NONE"), "no section plan creates authority");
assert(
  clarity.sections.filter((item) => item.decorativeAsset).every((item) => item.decorativeAsset?.provider === "local-css" && item.decorativeAsset.factualAuthority === "NONE"),
  "decorative assets are local and not evidence",
);
const surfaces = clarity.sections.map((item) => item.surfaceTreatment);
assert(surfaces.every((surface, index) => index === 0 || surface !== surfaces[index - 1]), "adjacent sections do not share one surface");
assert(LAYOUT_ARCHETYPES.includes("CLOSING_STAGE"), "closing is an available archetype");
assert(!clarity.sections.every((item) => item.layoutArchetype === clarity.sections[0]?.layoutArchetype), "one product does not use a single layout");

assert(offerAssetAssociation({ associatedBy: "none", embeddedUnsupportedClaim: null, unitsDepicted: 2, authorizedQuantity: 6 }) === "omit", "a two-unit photo is not a quantity picture");
assert(offerAssetAssociation({ associatedBy: "url-only", embeddedUnsupportedClaim: null, unitsDepicted: null, authorizedQuantity: 3 }) === "omit", "a loose image url is not an offer asset");
assert(offerAssetAssociation({ associatedBy: "same-card", embeddedUnsupportedClaim: null, unitsDepicted: null, authorizedQuantity: 3 }) === "omit", "an unknown sticker check omits the package");
assert(offerAssetAssociation({ associatedBy: "same-card", embeddedUnsupportedClaim: true, unitsDepicted: null, authorizedQuantity: 3 }) === "omit", "an embedded sticker omits the package");
assert(offerAssetAssociation({ associatedBy: "same-card", embeddedUnsupportedClaim: false, unitsDepicted: null, authorizedQuantity: 3 }) === "package", "a clean associated package may render");
assert(quantityImageRepeats(6, 1) === 6, "one depicted unit may be repeated to the authorized count");

const source = readFileSync("src/lib/premium/section-art-director.ts", "utf8");
assert(!/visiflora|joint genesis|astaxanthin|eyebright/i.test(source), "the director has no product branch");
assert(!/testimonial|doctor|certification|before\/after/i.test(source), "the director does not plan fabricated trust");

console.log("section art director ok");
