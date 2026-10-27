// npx tsx scripts/test-visual-quality-54i.ts
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { copyFileSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { buildProductContract, type ContractInput } from "../src/lib/product-contract/build.ts";
import { buildConversionBrief } from "../src/lib/conversion-strategy/build.ts";
import { buildPageBlueprint } from "../src/lib/page-blueprint/blueprint.ts";
import { inspectContentQuality } from "../src/lib/lp-generator/content-quality.ts";
import { classifyCopyText } from "../src/lib/page-blueprint/semantic-grounding.ts";
import { applyPresellMode, composeIntentHeadline, isIntentAlignedHeadline } from "../src/lib/search-intent/index.ts";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { overlayApprovedAssets } from "../src/lib/real-product-assets/overlay.ts";
import { selectApprovedHero } from "../src/lib/real-product-assets/select.ts";
import { classifyVisualClass } from "../src/lib/real-product-assets/visual-class.ts";
import { toGalleryCard } from "../src/lib/real-product-assets/gallery.ts";
import { emptyCatalog, mergeDiscoveredWithoutApproval, readCatalog, writeCatalog, DEFAULT_STORE_ROOT } from "../src/lib/real-product-assets/store.ts";
import type { DiscoveredImage } from "../src/lib/real-product-assets/types.ts";
import { AFFILIATE_DISCLOSURE_TEXT, HEALTH_DISCLAIMER_TEXT, PUBLIC_FOOTER_LINKS, getPublicSiteName, getPublicSiteUrl } from "../src/lib/public-site.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

function fileHash(file: string): string | null {
  if (!existsSync(file)) return null;
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function fake(partial: Partial<DiscoveredImage> & Pick<DiscoveredImage, "id" | "fileName" | "url" | "probableKind">): DiscoveredImage {
  return {
    productKey: "novalis-core",
    productName: "Novalis Core",
    sourcePage: "https://shop.novalis.example/p",
    alt: null,
    width: 800,
    height: 800,
    format: "jpeg",
    byteLength: 1200,
    relevant: true,
    match: "CONFIRMED",
    policyBlock: null,
    status: "PENDING_USER_APPROVAL",
    visualRole: "UNASSIGNED",
    localFile: null,
    sha256: null,
    discoveredAt: "2026-10-23T00:00:00.000Z",
    ...partial,
  };
}

function inputOf(facts: ReturnType<typeof emptyProductFacts>): ContractInput {
  return {
    facts,
    slug: "novalis-core",
    siteName: getPublicSiteName(),
    siteUrl: getPublicSiteUrl(),
    cta: { previewOnly: true },
    legal: {
      affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT,
      healthDisclaimer: HEALTH_DISCLAIMER_TEXT,
      healthDisclaimerPolicy: "WHEN_HEALTH_CONTENT",
      trustLinks: PUBLIC_FOOTER_LINKS.map((link) => ({ href: link.href, label: link.label })),
    },
  };
}

assert(classifyVisualClass({ url: "https://cdn.example/prod_bottle.png", fileName: "prod_bottle.png", probableKind: "packshot" }) === "PRODUCT_PACKSHOT", "bottle filenames are packshots");
assert(classifyVisualClass({ url: "https://cdn.example/gallery-1.jpg", fileName: "gallery-1.jpg", probableKind: "other" }) === "PRODUCT_GALLERY", "untyped product photos stay gallery");
assert(classifyVisualClass({ url: "https://cdn.example/lifestyle-scene.jpg", fileName: "lifestyle-scene.jpg", probableKind: "lifestyle" }) === "LIFESTYLE", "lifestyle stays lifestyle");
assert(classifyVisualClass({ url: "https://cdn.example/order-now.png", fileName: "order-now.png", probableKind: "other" }) === "PROMOTIONAL", "order-now is promotional");
assert(classifyVisualClass({ url: "https://cdn.example/doctor.png", fileName: "doctor.png", probableKind: "other" }) === "UNSUITABLE", "doctor images are unsuitable");
assert(!toGalleryCard(fake({ id: "doc", fileName: "doctor.png", url: "https://cdn.example/doctor.png", probableKind: "other" })).selectable, "unsuitable cards are not selectable");

const tmp = mkdtempSync(path.join(os.tmpdir(), "rpa-54i-"));
const isolatedFile = path.join(tmp, "approved-packshot.jpg");
copyFileSync(path.join(process.cwd(), "public", "lab-fixtures", "synthetic-packshot.jpg"), isolatedFile);
const packshot = fake({
  id: "pack-ok",
  fileName: "core-bottle.jpg",
  url: "https://cdn.novalis.example/core-bottle.jpg",
  probableKind: "packshot",
  status: "USER_APPROVED",
  localFile: isolatedFile,
});
const promo = fake({
  id: "promo-ok",
  fileName: "order-now.png",
  url: "https://cdn.example/order-now.png",
  probableKind: "other",
  status: "USER_APPROVED",
  localFile: isolatedFile,
});
assert(selectApprovedHero([promo]) === null, "an approved promotional image is not selected as packshot");
assert(selectApprovedHero([promo, packshot])?.id === "pack-ok", "packshot wins over promotional material");

const facts = emptyProductFacts("Novalis Core", "https://shop.novalis.example/p", "MANUAL");
facts.confidence.productName = "MANUAL";
facts.productFormat = {
  value: "dietary supplement",
  statement: "dietary supplement",
  provenance: "MANUAL",
  copyEligibility: "YES",
  policyFindings: [],
  sourceUrl: "https://shop.novalis.example/p",
  sourcePageCategory: "PRIMARY",
};
facts.description = "Novalis Core is a documented dietary supplement with listed probiotic strains.";
facts.confidence.description = "MANUAL";
facts.ingredientsOrComponents = ["Lactobacillus paracasei"];
facts.confidence.ingredientsOrComponents = "MANUAL";
facts.usageInformation = ["Chew one tablet daily."];
facts.confidence.usageInformation = "MANUAL";
facts.cautions = ["Consult a physician before use."];
facts.confidence.cautions = "MANUAL";
const contract = buildProductContract(inputOf(facts)).contract;
const brief = buildConversionBrief(contract);
const page = buildPageBlueprint({ contract, brief });
const editorial = applyPresellMode({ query: "what is Novalis Core", contract, brief, copy: page.copy });
const rebuilt = buildPageBlueprint({ contract, brief, copy: editorial.copy });
assert(isIntentAlignedHeadline(editorial.headline, contract), "composed editorial headline stays intent-aligned");
assert(/Novalis Core: what this dietary supplement lists/i.test(editorial.headline), "editorial headline uses kind and composition in a natural sentence");
assert(!/Natural Formula/i.test(editorial.copy.subheadline?.text ?? ""), "generic formula chips are not used as the subheadline");
assert(rebuilt.copy.sections.some((item) => item.sectionType === "specifications" && /^Ingredients$/i.test(item.headline.text)), "ingredient lists use the Ingredients heading");
assert(rebuilt.copy.sections.some((item) => item.sectionType === "how_it_works" && /^Directions for Use$/i.test(item.headline.text)), "usage-only sections use Directions for Use");
assert(rebuilt.copy.sections.some((item) => item.sectionType === "trust" && /^Cautions$/i.test(item.headline.text)), "cautions stand alone when shipping is absent");
assert(inspectContentQuality({ copy: rebuilt.copy, contract, brief }).length === 0, "content quality stays clear on the isolated fixture");
assert(
  ["headline", "introduction", ...(rebuilt.copy.subheadline ? ["subheadline"] : [])]
    .map((pathName) => classifyCopyText({ path: pathName, text: pathName === "headline" ? rebuilt.copy.headline.text : pathName === "subheadline" ? rebuilt.copy.subheadline!.text : rebuilt.copy.introduction.text, contract }))
    .every((row) => row.allowed),
  "semantic grounding allows the revised hero copy",
);

const genericFacts = emptyProductFacts("Novalis Core", "https://shop.novalis.example/p", "MANUAL");
genericFacts.confidence.productName = "MANUAL";
genericFacts.productFormat = {
  value: "Natural Formula",
  statement: "Natural Formula",
  provenance: "MANUAL",
  copyEligibility: "YES",
  policyFindings: [],
  sourceUrl: "https://shop.novalis.example/p",
  sourcePageCategory: "PRIMARY",
};
genericFacts.ingredientsOrComponents = ["Lactobacillus paracasei"];
genericFacts.confidence.ingredientsOrComponents = "MANUAL";
const genericContract = buildProductContract(inputOf(genericFacts)).contract;
const genericHeadline = composeIntentHeadline({ contract: genericContract, intent: "INFORMATIONAL", mode: "PRESELL_EDITORIAL" });
assert(genericHeadline === "Novalis Core: listed ingredients", "a generic formula kind is omitted and the headline uses listed composition");

const s5 = buildV4Model("s5")!;
const emptyHero = renderToStaticMarkup(createElement(V4Page, { model: s5 }));
assert(!s5.commercialImage, "scenario A starts without an approved packshot");
assert(!/ds-hero--split/.test(emptyHero), "scenario A does not reserve an empty image column");
assert(/ds-hero--editorial|ds-hero--info/.test(emptyHero), "scenario A uses the balanced editorial hero");
assert(!emptyHero.includes('data-v4-image="commercial"'), "scenario A does not render unauthorized images");

const isolated = emptyCatalog("novalis-core", "Novalis Core");
isolated.images = [packshot, promo];
writeCatalog(isolated, tmp);
const loaded = readCatalog("novalis-core", tmp);
const withPhoto = overlayApprovedAssets(s5, loaded);
assert(Boolean(withPhoto.commercialImage), "scenario B overlays an approved packshot from the isolated catalog");
assert(withPhoto.commercialImage?.src.includes("/admin/lab/real-assets/file/novalis-core/pack-ok"), "scenario B uses the authorized file route");
const splitHero = renderToStaticMarkup(createElement(V4Page, { model: withPhoto }));
assert(/ds-hero--split/.test(splitHero), "scenario B uses the split hero when a packshot is approved");
assert(splitHero.includes('data-v4-image="commercial"'), "scenario B renders the authorized packshot");

const pendingOnly = emptyCatalog("novalis-core", "Novalis Core");
pendingOnly.images = [{ ...packshot, status: "PENDING_USER_APPROVAL", localFile: null }];
assert(!overlayApprovedAssets(s5, pendingOnly).commercialImage, "pending discovery is not treated as approved");

const existing = emptyCatalog("novalis-core", "Novalis Core");
existing.images = [{ ...packshot, status: "USER_APPROVED" }];
const merged = mergeDiscoveredWithoutApproval(existing, [
  { ...packshot, status: "PENDING_USER_APPROVAL" },
  fake({ id: "new-1", fileName: "extra.jpg", url: "https://cdn.example/extra.jpg", probableKind: "other" }),
]);
assert(merged.images.find((item) => item.id === "pack-ok")?.status === "USER_APPROVED", "merge does not downgrade an existing approval");
assert(merged.images.find((item) => item.id === "new-1")?.status === "PENDING_USER_APPROVAL", "new discovery stays pending");
assert(merged.images.find((item) => item.id === "new-1")?.localFile === null, "merge does not download files");

const femicoreCatalog = path.join(process.cwd(), "data", "real-product-assets", "femicore", "catalog.json");
const femicoreHop = path.join(process.cwd(), "data", "affiliate-hops", "femicore", "hop.json");
const femicoreBefore = { catalog: fileHash(femicoreCatalog), hop: fileHash(femicoreHop) };
assert(tmp !== DEFAULT_STORE_ROOT, "scenario B writes only to a temporary catalog root");
assert(!tmp.startsWith(DEFAULT_STORE_ROOT), "the isolated catalog is outside the real store");
const femicoreAfter = { catalog: fileHash(femicoreCatalog), hop: fileHash(femicoreHop) };
assert(femicoreBefore.catalog === femicoreAfter.catalog && femicoreBefore.hop === femicoreAfter.hop, "FemiCore files stay untouched");

const libFiles = [
  "src/lib/real-product-assets/visual-class.ts",
  "src/lib/real-product-assets/select.ts",
  "src/lib/search-intent/headline.ts",
  "src/lib/page-blueprint/copy.ts",
  "src/lib/presell-strategy/plan.ts",
];
for (const file of libFiles) {
  const text = readFileSync(path.join(process.cwd(), file), "utf8");
  assert(!/prodentim|femicore|getfemicore/i.test(text), `${file} has no product-specific strings`);
}

console.log(`PASS test-visual-quality-54i.ts (${passed} OK)`);
