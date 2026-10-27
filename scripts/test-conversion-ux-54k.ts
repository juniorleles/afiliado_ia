// npx tsx scripts/test-conversion-ux-54k.ts
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { buildProductContract, type ContractInput } from "../src/lib/product-contract/build.ts";
import { buildConversionBrief } from "../src/lib/conversion-strategy/build.ts";
import { buildPageBlueprint } from "../src/lib/page-blueprint/blueprint.ts";
import { applyPresellMode, composeIntentHeadline, isIntentAlignedHeadline } from "../src/lib/search-intent/index.ts";
import { classifyContextualFit, galleryAllowedForContext } from "../src/lib/real-product-assets/context-fit.ts";
import { overlayApprovedAssets } from "../src/lib/real-product-assets/overlay.ts";
import { writeContextReviews } from "../src/lib/real-product-assets/context-fit.ts";
import { emptyCatalog, writeCatalog } from "../src/lib/real-product-assets/store.ts";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
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
facts.guaranteeInformation = "60-day money-back guarantee.";
facts.confidence.guaranteeInformation = "MANUAL";
facts.features = ["Natural Formula", "Easy To Use", "Non-GMO", "Gluten Free"];
facts.confidence.features = "MANUAL";
const contract = buildProductContract(inputOf(facts)).contract;
const brief = buildConversionBrief(contract);
const page = buildPageBlueprint({ contract, brief });
const editorial = applyPresellMode({ query: "what is Novalis Core", contract, brief, copy: page.copy });
const bofu = applyPresellMode({ query: "buy Novalis Core", contract, brief, copy: page.copy });

assert(isIntentAlignedHeadline(editorial.headline, contract), "natural editorial headline stays aligned");
assert(/what this dietary supplement lists/i.test(editorial.headline), "editorial headline is a natural sentence");
assert(!/Dietary supplement and Ingredients/i.test(editorial.headline), "editorial headline is not a field concatenation");
assert(/seller-stated terms|listed ingredients to review|review this/i.test(bofu.headline), "BOFU headline is decision-oriented");
assert(editorial.headline !== bofu.headline, "editorial and BOFU headlines differ");

const editorialTypes = editorial.copy.sections.map((item) => item.sectionType);
const bofuTypes = bofu.copy.sections.map((item) => item.sectionType);
assert(editorialTypes.indexOf("specifications") < editorialTypes.indexOf("differentiators"), "editorial leads with listed composition");
assert(bofuTypes.indexOf("guarantee") < bofuTypes.indexOf("differentiators"), "BOFU leads with seller-stated terms");
assert(editorial.copy.sections.find((item) => item.sectionType === "guarantee")?.body[0]?.text.startsWith("The seller states:") ?? false, "guarantee stays attributed to the seller");
assert(!editorial.copy.cta.href, "editorial has no commercial CTA");

assert(classifyContextualFit({ id: "a", url: "https://cdn.example/order-now.png", fileName: "order-now.png", probableKind: "other", policyBlock: null, alt: null }) === "COMMERCIAL_PROMOTIONAL", "order-now is commercial promotional");
assert(classifyContextualFit({ id: "b", url: "https://cdn.example/bottle.png", fileName: "bottle.png", probableKind: "packshot", policyBlock: null, alt: null }) === "EDITORIAL_SAFE", "a clean packshot is editorial-safe");
assert(classifyContextualFit({ id: "x", url: "https://cdn.example/x.png", fileName: "x.png", probableKind: "packshot", policyBlock: null, alt: null }, { imageId: "x", fit: "COMMERCIAL_PROMOTIONAL", observedClaims: ["BEST VALUE"], recordedAt: "2026-10-25T00:00:00.000Z", actor: "lab" }) === "COMMERCIAL_PROMOTIONAL", "an observed commercial seal is not treated as a verified claim");
assert(!galleryAllowedForContext("COMMERCIAL_PROMOTIONAL", "PRESELL_EDITORIAL"), "promotional seals are omitted from editorial");
assert(!galleryAllowedForContext("COMMERCIAL_PROMOTIONAL", "PRESELL_BOFU"), "unsupported promotional seals are omitted from BOFU");

const tmp = mkdtempSync(path.join(os.tmpdir(), "rpa-54k-"));
const catalog = emptyCatalog("novalis-core", "Novalis Core");
const bottle: DiscoveredImage = {
  id: "hero-ok",
  productKey: "novalis-core",
  productName: "Novalis Core",
  url: "https://cdn.novalis.example/core-bottle.jpg",
  sourcePage: "https://shop.novalis.example/p",
  fileName: "core-bottle.jpg",
  alt: null,
  width: 800,
  height: 800,
  format: "jpeg",
  byteLength: 1200,
  probableKind: "packshot",
  relevant: true,
  match: "CONFIRMED",
  policyBlock: null,
  status: "USER_APPROVED",
  visualRole: "UNASSIGNED",
  localFile: "C:\\tmp\\ok.png",
  sha256: "x",
  discoveredAt: "2026-10-25T00:00:00.000Z",
};
const promo = { ...bottle, id: "promo-seal", fileName: "six-pack.png", url: "https://cdn.novalis.example/six-pack.png", probableKind: "packshot" as const, match: "PLAUSIBLE" as const };
catalog.images = [bottle, promo];
writeCatalog(catalog, tmp);
writeContextReviews(
  "novalis-core",
  [{ imageId: "promo-seal", fit: "COMMERCIAL_PROMOTIONAL", observedClaims: ["BEST VALUE"], recordedAt: "2026-10-25T00:00:00.000Z", actor: "lab" }],
  tmp,
);
const s5 = buildV4Model("s5")!;
const over = overlayApprovedAssets(s5, { ...catalog, productKey: "novalis-core" }, { mode: "PRESELL_EDITORIAL", root: tmp });
assert(over.commercialImage?.src.includes("hero-ok"), "the scored packshot remains the hero");
assert(!(over.galleryImages ?? []).some((item) => item.src.includes("promo-seal")), "the reviewed promotional seal is omitted from the gallery");

const rebuilt = buildPageBlueprint({ contract, brief, copy: editorial.copy });
const html = renderToStaticMarkup(createElement(V4Page, { model: { ...s5, copy: rebuilt.copy, blueprint: rebuilt.blueprint } }));
assert(html.includes("v4-feature-chips") || html.includes("ds-feature"), "short attributes can use a compact feature presentation");

const femicoreCatalog = path.join(process.cwd(), "data", "real-product-assets", "femicore", "catalog.json");
const femicoreHop = path.join(process.cwd(), "data", "affiliate-hops", "femicore", "hop.json");
const before = { catalog: fileHash(femicoreCatalog), hop: fileHash(femicoreHop) };
const after = { catalog: fileHash(femicoreCatalog), hop: fileHash(femicoreHop) };
assert(before.catalog === after.catalog && before.hop === after.hop, "FemiCore files stay untouched");

const libFiles = [
  "src/lib/search-intent/headline.ts",
  "src/lib/search-intent/modes.ts",
  "src/lib/real-product-assets/context-fit.ts",
  "src/lib/page-blueprint/copy.ts",
];
for (const file of libFiles) {
  const text = readFileSync(path.join(process.cwd(), file), "utf8");
  assert(!/prodentim|femicore|getfemicore/i.test(text), `${file} has no product-specific strings`);
}

console.log(`PASS test-conversion-ux-54k.ts (${passed} OK)`);
