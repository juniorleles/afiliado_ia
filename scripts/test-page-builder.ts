// npx tsx scripts/test-page-builder.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  applyPageEdits,
  composePresellPage,
  consumerVisibleText,
  includedComponentLabels,
  parsePresellPage,
  reconstructPageBody,
  serializePresellPage,
  validateComposedPage,
  visibleSections,
} from "../src/lib/presell-page.ts";
import { extractProductImage } from "../src/lib/product-image.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { extractProductFacts } from "../src/lib/import-product.ts";
import { CTA_POSITIONS } from "../src/lib/analytics.ts";
import { createCampaign, getCampaignBySlug } from "../src/lib/campaigns.ts";
import { chunkParagraphs, isUnusableProductAspect, labeledSplit } from "../src/lib/presell-display.ts";
import fs from "node:fs";
import os from "node:os";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const facts = emptyProductFacts("Winter Jacket XT-200", "https://example.com/jacket", "IMPORTED");
facts.description = "a mid-weight insulated layer for daily cold weather";
facts.confidence.description = "DIRECT_SOURCE";
facts.features = ["Water-resistant shell for commuting", "Insulated core for ordinary winter days"];
facts.confidence.features = "DIRECT_SOURCE";
facts.ingredientsOrComponents = [];
facts.usageInformation = ["Machine-wash the outer shell"];
facts.confidence.usageInformation = "DIRECT_SOURCE";
facts.guaranteeInformation = "30-day returns through the merchant";
facts.confidence.guaranteeInformation = "DIRECT_SOURCE";
facts.importQuality = "SUFFICIENT";
facts.productImageProvenance = "NOT_FOUND";

const variant = {
  approach: "BUYER_GUIDE" as const,
  headline: "How to Choose a Winter Jacket",
  ctaLabel: "Check Current Price",
  body: `This winter jacket is a mid-weight insulated layer for daily cold weather.

## What Is The XT-200?

A mid-weight insulated layer for walking and commuting.

## Key Features

- Insulated core for ordinary winter days
- Machine-washable outer shell

## How to Use

- Machine-wash the outer shell

## Things to Consider

- Fit can run large

## FAQ

- Can I machine wash it? The product information describes a washable shell.

## Final Thoughts

A straightforward option for ordinary winter days.
`,
};

const reviewPage = composePresellPage({ variant, facts, template: "REVIEW" });
assert(reviewPage.template === "REVIEW", "REVIEW template is selected");
assert(reviewPage.hero.headline === variant.headline, "hero uses variant headline");
assert(visibleSections(reviewPage).some((s) => s.id === "features"), "features section included when facts exist");
assert(visibleSections(reviewPage).some((s) => s.id === "usage"), "usage section included when facts exist");
assert(!visibleSections(reviewPage).some((s) => s.id === "guarantee"), "guarantee omitted when variant has no guarantee section");
assert(reviewPage.omitted.some((o) => o.component === "Pricing" && o.reason === "NOT_FOUND"), "pricing omitted when NOT_FOUND");
assert(reviewPage.omitted.some((o) => o.component === "Manufacturer"), "manufacturer omitted when NOT_FOUND");
assert(reviewPage.omitted.some((o) => o.component === "Testimonials"), "testimonials omitted");
assert(reviewPage.omitted.some((o) => o.component === "Ratings"), "ratings omitted");
assert(!includedComponentLabels(reviewPage).includes("Pricing"), "pricing is not in included list");
assert(reviewPage.hero.image.provenance === "PLACEHOLDER" || reviewPage.hero.image.provenance === "NOT_FOUND", "missing image uses placeholder provenance");

const guidePage = composePresellPage({ variant, facts, template: "BUYER_GUIDE" });
assert(guidePage.template === "BUYER_GUIDE", "BUYER_GUIDE template is selected independently of variant approach");
assert(guidePage.sections.find((s) => s.id === "considerations"), "buyer guide keeps considerations in the composition");
const guideIds = visibleSections(guidePage).filter((s) => s.id !== "quickSummary").map((s) => s.id);
assert(guideIds[0] === "overview", "BUYER_GUIDE overview is the first visible body section");

const mechanismPage = composePresellPage({
  variant: {
    approach: "BUYER_GUIDE",
    headline: "How to Choose a Winter Jacket",
    ctaLabel: "Check Current Price",
    body: `A mid-weight insulated layer.

## How It Works

The shell is described as shedding light rain by using a treated weave.

## How to Use

Machine-wash the outer shell.
`,
  },
  facts,
  template: "REVIEW",
});
const mechUsage = [...(mechanismPage.sections.find((s) => s.id === "usage")?.paragraphs || []), ...(mechanismPage.sections.find((s) => s.id === "usage")?.bullets || [])].join("\n");
const mechOverview = [...(mechanismPage.sections.find((s) => s.id === "overview")?.paragraphs || []), ...(mechanismPage.sections.find((s) => s.id === "overview")?.bullets || [])].join("\n");
assert(/Machine-wash/.test(mechUsage), "How to Use remains operational usage");
assert(!/treated weave/.test(mechUsage), "How It Works mechanism is not usage");
assert(/treated weave/.test(mechOverview), "How It Works lands in overview");

assert(labeledSplit("Price Transparency: Pricing was not listed.")?.title === "Price Transparency", "labeled facts become card titles");
const long =
  "This winter jacket is a mid-weight insulated layer for daily cold weather and short outdoor trips when temperatures drop. It is meant for walking and commuting rather than technical alpine use. Fit can run large according to the merchant size chart, so measuring before purchase is useful.";
assert(long.length > 220, "fixture is long enough to require chunking");
const longChunks = chunkParagraphs([long]);
assert(longChunks.length >= 2, "long overview prose is split into smaller chunks");
assert(
  longChunks.map((chunk) => chunk.body).join(" ").includes("insulated") &&
    longChunks.map((chunk) => chunk.body).join(" ").includes("alpine"),
  "chunking keeps original sentences",
);

const editorial = composePresellPage({ variant, facts, template: "EDITORIAL" });
assert(editorial.template === "EDITORIAL", "EDITORIAL template is available");

const noUsage = emptyProductFacts("Hat", "", "MANUAL");
noUsage.description = "a wool hat";
noUsage.confidence.description = "MANUAL";
noUsage.features = ["Knitted brim"];
noUsage.confidence.features = "MANUAL";
noUsage.productImageProvenance = "NOT_FOUND";
const sparse = composePresellPage({
  variant: { ...variant, headline: "Hat notes", body: "A wool hat.\n\n## Key Features\n\n- Knitted brim\n" },
  facts: noUsage,
  template: "REVIEW",
});
assert(!visibleSections(sparse).some((s) => s.id === "ingredients"), "ingredients omitted when missing");
assert(!visibleSections(sparse).some((s) => s.id === "usage"), "usage omitted when missing");
assert(sparse.omitted.some((o) => o.component === "Usage"), "usage omission is reported");

const html = `<html><head><meta property="og:image" content="https://cdn.example.com/jacket.jpg"></head><body><h1>Jacket</h1></html>`;
const extracted = extractProductImage(html, "https://example.com/jacket");
assert(extracted?.url === "https://cdn.example.com/jacket.jpg", "og:image is preferred");
assert(extracted?.provenance === "DIRECT_SOURCE", "imported image provenance is DIRECT_SOURCE");

const imported = extractProductFacts(html, "https://example.com/jacket");
assert(imported.productImageUrl === "https://cdn.example.com/jacket.jpg", "importer stores product image URL");
assert(imported.productImageProvenance === "DIRECT_SOURCE", "importer stores image provenance");

const pixelHtml = `<img src="https://facebook.com/tr?id=1">`;
assert(extractProductImage(pixelHtml, "https://example.com") === null, "tracking pixels are not used as product images");
const ctaOg = `<html><head><meta property="og:image" content="https://cdn.example.com/order-now-banner.png"></head></html>`;
assert(extractProductImage(ctaOg, "https://example.com") === null, "CTA/banner og:image is not used as a product packshot");
assert(isUnusableProductAspect(501, 192) === true, "landscape banners are not treated as packshots");
assert(isUnusableProductAspect(640, 640) === false, "square product images remain usable");
assert(isUnusableProductAspect(0, 0) === false, "missing HTML dimensions are not treated as unusable");

assert(CTA_POSITIONS.includes("sticky"), "sticky CTA position is part of the tracking enum");
assert(CTA_POSITIONS.includes("guarantee"), "guarantee CTA position is part of the tracking enum");

const body = reconstructPageBody(reviewPage);
assert(body.includes("## "), "reconstructed body stays restricted markdown");
const parsed = parsePresellPage(serializePresellPage(reviewPage));
assert(parsed?.template === "REVIEW", "page JSON round-trips");

const edited = applyPageEdits(reviewPage, { headline: "Edited headline", ctaLabel: "View Product Details", visibility: { faq: false } });
assert(edited.hero.headline === "Edited headline", "headline edit is applied");
assert(edited.ctaLabel === "View Product Details", "CTA edit is applied");
assert(edited.sections.find((s) => s.id === "faq")?.visible === false, "section visibility can be toggled");

const validation = validateComposedPage(reviewPage, facts, "https://example.com/hop");
assert(["READY", "REVIEW_REQUIRED", "BLOCKED"].includes(validation.finalGate), "composed page receives a publication gate");
assert(validation.grounding.status === "GROUNDED", "jacket composition stays GROUNDED against supplied facts");

const riskyFacts = emptyProductFacts("Oral Tablet Example", "https://example.com/p", "IMPORTED");
riskyFacts.description = "a chewable tablet";
riskyFacts.confidence.description = "DIRECT_SOURCE";
riskyFacts.features = ["chewable tablet"];
riskyFacts.confidence.features = "DIRECT_SOURCE";
riskyFacts.productImageProvenance = "NOT_FOUND";
const riskyPage = composePresellPage({
  variant: {
    approach: "REVIEW",
    headline: "Tablet notes",
    ctaLabel: "Visit Official Website",
    body: "A chewable tablet.\n\nResearch suggests many dental problems begin when the mouth's microbial balance shifts.\n",
  },
  facts: riskyFacts,
  template: "REVIEW",
});
const risky = validateComposedPage(riskyPage, riskyFacts, "https://example.com/hop");
assert(risky.finalGate !== "READY", "composition cannot be READY with unsupported research language");
assert(consumerVisibleText(riskyPage).includes("Research suggests"), "consumer-visible text includes composed copy for grounding");

const generateSrc = readFileSync(path.join(process.cwd(), "src/app/admin/generate/generate-client.tsx"), "utf8");
assert(generateSrc.includes("PAGE_TEMPLATES"), "generate UI has a template picker");
assert(generateSrc.includes("Continue to draft form"), "composition preview happens before create");
assert(generateSrc.includes("Omitted"), "composition preview lists omitted components");
assert(generateSrc.includes("viewport"), "desktop/mobile preview toggle exists before save");

const templateSrc = readFileSync(path.join(process.cwd(), "src/components/campaign-template.tsx"), "utf8");
assert(templateSrc.includes("parsePresellPage"), "public renderer branches to structured pages");
assert(templateSrc.includes("parseMarkdown"), "legacy markdown renderer remains");

const pageView = readFileSync(path.join(process.cwd(), "src/components/presell/presell-page-view.tsx"), "utf8");
const stickySrc = readFileSync(path.join(process.cwd(), "src/components/presell/sticky-cta-bar.tsx"), "utf8");
assert(stickySrc.includes('position="sticky"'), "sticky mobile CTA uses the shared CTA component");
assert(stickySrc.includes("md:hidden"), "sticky CTA is small-screen only");
assert(pageView.includes("StickyCtaBar"), "sticky CTA is wired through the composition renderer");
assert(pageView.includes("FAQAccordion") || pageView.includes("CreativeScene"), "FAQ is a dedicated accordion");
assert(pageView.includes('"final"') || pageView.includes("final"), "page end uses a single CTA slot instead of stacked guarantee+final");

const faqSrc = readFileSync(path.join(process.cwd(), "src/components/presell/faq-accordion.tsx"), "utf8");
assert(faqSrc.includes("<details"), "FAQ uses native details/summary for keyboard access");
assert(faqSrc.includes("<summary"), "FAQ summary is present");
const contentSrc = readFileSync(path.join(process.cwd(), "src/components/presell/content-section.tsx"), "utf8");
assert(contentSrc.includes("FAQAccordion"), "FAQ accordion is used from the section renderer");
assert(contentSrc.includes("chunkParagraphs"), "dense prose is chunked into visual components");

const previewSrc = readFileSync(path.join(process.cwd(), "src/app/admin/preview/[slug]/page.tsx"), "utf8");
assert(previewSrc.includes("PreviewFrame"), "admin preview uses the visual frame");
assert(previewSrc.includes("PREVIEW — NOT PUBLISHED"), "preview banner remains");
assert(!previewSrc.includes("trackClicks"), "preview does not enable production click tracking");

const previewFrameSrc = readFileSync(path.join(process.cwd(), "src/components/presell/preview-frame.tsx"), "utf8");
assert(previewFrameSrc.includes("disableAffiliateNavigation"), "TEST K: admin preview CTA disables affiliate navigation");
const visualFrameSrc = readFileSync(path.join(process.cwd(), "src/app/visual-frame/[slug]/page.tsx"), "utf8");
assert(visualFrameSrc.includes("disableAffiliateNavigation"), "TEST L: visual-frame CTA disables affiliate navigation");
const publicSrc = readFileSync(path.join(process.cwd(), "src/app/p/[slug]/page.tsx"), "utf8");
assert(publicSrc.includes("getPublishedCampaignBySlug"), "public renderer still requires published campaigns");
assert(publicSrc.includes("openGraph"), "public metadata includes Open Graph basics");
assert(publicSrc.includes("trackClicks"), "TEST M: public /p/[slug] enables CTA tracking");
assert(!publicSrc.includes("disableAffiliateNavigation"), "TEST M: public page does not disable affiliate CTA");

const pubSrc = readFileSync(path.join(process.cwd(), "src/lib/publication.ts"), "utf8");
assert(pubSrc.includes("resolvePublicationGate"), "publish resolves composed consumer copy against facts");
assert(pubSrc.includes("if (!facts) return \"BLOCKED\""), "missing sourceFactsJson fails closed");

const importSrc = readFileSync(path.join(process.cwd(), "src/lib/import-product.ts"), "utf8");
assert(importSrc.includes("materializeProductImage"), "importer materializes product images locally");

const tmp = path.join(os.tmpdir(), `afiliado-ia-page-builder-${process.pid}.db`);
process.env.PRESELL_OS_DB = tmp;

const slug = `phase6-page-builder-${Date.now()}`;
const saved = createCampaign({
  name: "Phase 6 draft",
  slug,
  headline: reviewPage.hero.headline,
  body: reconstructPageBody(reviewPage),
  ctaLabel: reviewPage.ctaLabel,
  affiliateUrl: "https://example.com/hop",
  headScript: null,
  adHeadline: null,
  pageTemplate: reviewPage.template,
  pageComposition: serializePresellPage(reviewPage),
  productImageProvenance: "PLACEHOLDER",
  subheadline: reviewPage.hero.subheadline,
  sourceFactsJson: JSON.stringify(facts),
});
assert(saved.publicationStatus === "draft", "composed page is saved as DRAFT");
const loaded = getCampaignBySlug(slug);
assert(loaded?.pageTemplate === "REVIEW", "template persists");
assert(parsePresellPage(loaded?.pageComposition ?? null)?.hero.headline === reviewPage.hero.headline, "composition persists");

const heuristicFacts = emptyProductFacts("Sample Product", "https://example.com/p", "IMPORTED");
heuristicFacts.guaranteeInformation = "Read the full refund policy";
heuristicFacts.confidence.guaranteeInformation = "HEURISTIC_EXTRACTION";
const heuristicPage = composePresellPage({
  variant: { approach: "REVIEW", headline: "Sample notes", body: "A listed product overview.", ctaLabel: "Learn More" },
  facts: heuristicFacts,
  template: "REVIEW",
});
const heuristicBlob = JSON.stringify(heuristicPage);
assert(!heuristicBlob.includes("Read the full refund policy"), "TEST A: HEURISTIC guarantee is absent from composition");
assert(heuristicPage.guaranteeDaysDisplay === null, "TEST A: heuristic guarantee does not set duration display");

const leftoverFacts = emptyProductFacts("Sample Product", "https://example.com/p", "IMPORTED");
leftoverFacts.description = "leftover secret laboratory formula";
leftoverFacts.confidence.description = "NOT_FOUND";
const leftoverPage = composePresellPage({
  variant: { approach: "REVIEW", headline: "Sample notes", body: "A listed product overview.", ctaLabel: "Learn More" },
  facts: leftoverFacts,
  template: "REVIEW",
});
assert(
  !JSON.stringify(leftoverPage).includes("leftover secret laboratory formula"),
  "TEST B: NOT_FOUND leftover value is absent from PresellPage",
);

const aiClassFacts = emptyProductFacts("Sample Product", "https://example.com/p", "IMPORTED");
aiClassFacts.features = ["clinically unique patented blend"];
aiClassFacts.confidence.features = "AI_SOURCE_CLASSIFICATION";
const aiClassPage = composePresellPage({
  variant: { approach: "REVIEW", headline: "Sample notes", body: "A listed product overview.", ctaLabel: "Learn More" },
  facts: aiClassFacts,
  template: "REVIEW",
});
assert(
  !JSON.stringify(aiClassPage).includes("clinically unique patented blend"),
  "TEST C: AI_SOURCE_CLASSIFICATION is not factual page copy",
);

const directGuaranteeFacts = emptyProductFacts("Sample Product", "https://example.com/p", "IMPORTED");
directGuaranteeFacts.guaranteeInformation = "60-day money-back guarantee";
directGuaranteeFacts.confidence.guaranteeInformation = "DIRECT_SOURCE";
const directGuaranteePage = composePresellPage({
  variant: { approach: "REVIEW", headline: "Sample notes", body: "A listed product overview.", ctaLabel: "Learn More" },
  facts: directGuaranteeFacts,
  template: "REVIEW",
});
const guaranteeSection = directGuaranteePage.sections.find((s) => s.id === "guarantee");
assert(
  guaranteeSection?.visible !== true,
  "TEST D: DIRECT_SOURCE guarantee is not injected when variant omitted it",
);
assert(directGuaranteePage.guaranteeDaysDisplay === null, "TEST F: duration display is not derived from raw ProductFacts");

const heuristic180 = emptyProductFacts("Sample Product", "https://example.com/p", "IMPORTED");
heuristic180.guaranteeInformation = "180-day refund policy for returning buyers";
heuristic180.confidence.guaranteeInformation = "HEURISTIC_EXTRACTION";
const heuristic180Page = composePresellPage({
  variant: { approach: "REVIEW", headline: "Sample notes", body: "A listed product overview.", ctaLabel: "Learn More" },
  facts: heuristic180,
  template: "REVIEW",
});
assert(!JSON.stringify(heuristic180Page).includes("180"), "TEST E: HEURISTIC 180-day guarantee does not enter composition");
assert(heuristic180Page.guaranteeDaysDisplay !== "180", "TEST E: GuaranteeScene does not emit 180 DAYS");

const sceneSrc = readFileSync(path.join(process.cwd(), "src/components/presell/scene-render.tsx"), "utf8");
assert(sceneSrc.includes("daysDisplay"), "GuaranteeScene uses copy-eligible duration display");
assert(!/text\.match\(\/\(\\d\+\)\\s\*-\?\\s\*day/i.test(sceneSrc), "GuaranteeScene does not regex duration from ineligible section text");

const generateClientSrc = readFileSync(path.join(process.cwd(), "src/app/admin/generate/generate-client.tsx"), "utf8");
assert(generateClientSrc.includes("DIAGNOSTIC PREVIEW"), "TEST G: BLOCKED composition is labeled diagnostic");
assert(generateClientSrc.includes("Continue to draft form"), "TEST G: diagnostic compose can continue to internal draft");
assert(generateClientSrc.includes("!step.blocked"), "TEST G: recommended LP does not treat BLOCKED as approved continue");

const validationCandidate = validateComposedPage(riskyPage, riskyFacts, "https://example.com/hop");
assert(validationCandidate.finalGate === "BLOCKED" || validationCandidate.finalGate !== "READY", "TEST J: unsupported composed copy is not READY");
assert(consumerVisibleText(riskyPage).includes("Research suggests"), "TEST J: composed consumer copy still includes the unsupported sentence for gating");

delete process.env.PRESELL_OS_DB;
try {
  fs.unlinkSync(tmp);
} catch {
  /* ignore */
}

console.log("\nTodos os testes do Page Builder V2 passaram.");
