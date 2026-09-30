import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getCampaignBySlug } from "../src/lib/campaigns.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import type { Campaign } from "../src/lib/campaigns.ts";
import type { PresellPage } from "../src/lib/presell-page.ts";
import { buildVisualBrief } from "../src/lib/visual-concept/brief.ts";
import { composeSourcePackshot, decodePng, encodeRgbaPng, inspectPackshotFile } from "../src/lib/visual-concept/compose.ts";
import { visualConceptConfig } from "../src/lib/visual-concept/config.ts";
import { generateVisualConcepts, planVisualConceptGeneration } from "../src/lib/visual-concept/engine.ts";
import { directVisualArt } from "../src/lib/visual-concept/art-director.ts";
import { ART_DIRECTION_IS_EVIDENCE, reimportImageText, rejectVisualMutation } from "../src/lib/visual-concept/firewall.ts";
import { buildVisualConceptPrompt } from "../src/lib/visual-concept/prompt.ts";
import type { ConceptImageRequest, ImageProvider } from "../src/lib/visual-concept/provider.ts";
import { readRun } from "../src/lib/visual-concept/store.ts";
import { VISUAL_DIRECTIONS } from "../src/lib/visual-concept/types.ts";

let failed = 0;
function assert(cond: unknown, message: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL: " + message);
  } else {
    console.log("OK: " + message);
  }
}

const page: PresellPage = {
  version: 1,
  template: "BUYER_GUIDE",
  hero: {
    badge: "Buying guide",
    headline: "Sample Product",
    subheadline: "Sample Product supports a daily routine.",
    summary: "Sample Product supports a daily routine.",
    highlights: [],
    image: { src: "", alt: "", provenance: "NOT_FOUND" },
  },
  sections: [
    {
      id: "overview",
      title: "Overview",
      visible: true,
      paragraphs: ["Sample Product supports a daily routine."],
      bullets: [],
      cards: [],
      faq: [],
    },
  ],
  ctaLabel: "Learn More",
  omitted: [],
  guaranteeDaysDisplay: null,
};

const facts = emptyProductFacts("Sample Product", "https://seller.example/product", "MANUAL");
facts.features = ["Sample Product supports a daily routine."];
facts.confidence.features = "MANUAL";
facts.confidence.description = "HEURISTIC_EXTRACTION";
facts.description = "Secret seller claim that must stay out of the brief.";
facts.sourceSnippets = [
  {
    field: "description",
    text: "Doctor endorsed miracle rating 4.9 with 50 percent off today.",
    sourceUrl: "https://seller.example/product",
    confidence: "HEURISTIC_EXTRACTION",
  },
];
facts.importQuality = "PARTIAL";

const campaign: Campaign = {
  id: 42,
  name: "Sample",
  slug: "sample-product",
  headline: "Sample Product",
  body: "",
  ctaLabel: "Learn More",
  affiliateUrl: "https://example.hop.clickbank.net",
  headScript: null,
  adHeadline: null,
  publicationStatus: "draft",
  publishedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  pageComposition: JSON.stringify(page),
  sourceFactsJson: JSON.stringify(facts),
  productImageSrc: null,
  productImageProvenance: "NOT_FOUND",
};

const beforeFacts = campaign.sourceFactsJson;
const brief = buildVisualBrief(campaign);
assert(brief !== null, "visual brief is built from the validated page");
assert(brief!.allowedCopy.includes("Sample Product supports a daily routine."), "validated page copy enters allowedCopy");
assert(
  !brief!.allowedCopy.some((line) => line.includes("Doctor endorsed")),
  "raw seller snippet stays out of allowedCopy",
);
assert(
  !brief!.allowedCopy.some((line) => line.includes("Secret seller claim")),
  "non-eligible description stays out of allowedCopy",
);
assert(!JSON.stringify(brief).includes("hop.clickbank.net"), "affiliate hop is not part of the brief");
assert(brief!.forbiddenClaims.includes("testimonials") && brief!.forbiddenClaims.includes("medical claims"), "forbidden topics stay forbidden");
assert(brief!.categoryContext === null, "category is not invented from a product name");

const prompt = buildVisualConceptPrompt(brief!, "PREMIUM_EDITORIAL");
assert(prompt.includes("VISUAL OBJECTIVE") && prompt.includes("OUTPUT INTENT"), "prompt has the required sections");
assert(prompt.includes("PREMIUM_EDITORIAL"), "prompt carries the generic direction");
assert(!prompt.includes("Doctor endorsed"), "forbidden seller text is not in the prompt");
assert(prompt.includes("Do not invent testimonials"), "output intent forbids invented claims");
assert(prompt.includes("FULL-PAGE PREMIUM ECOMMERCE / DTC LANDING PAGE WEBSITE DESIGN MOCKUP"), "landing-page intent is present");
assert(prompt.includes("must not look like an advertisement") && prompt.includes("poster"), "poster and ad intent are explicitly forbidden");
assert(prompt.includes("01 HERO") && prompt.includes("08 FAQ SECTION") && prompt.includes("09 FOOTER / DISCLOSURE AREA"), "multiple website sections are requested");
assert(prompt.includes("DO NOT CREATE NEW SLOGANS."), "invented slogans are forbidden");
assert(prompt.includes("DO NOT CREATE NEW BENEFIT STATEMENTS."), "invented benefit copy is forbidden");
assert(prompt.includes("explicit physical outcome"), "lifestyle result implication is forbidden");
assert(prompt.includes("Do not invent joint-health symbols, medical crosses"), "unsafe benefit icons are forbidden");
assert(!/joint[\s-]?genesis/i.test(prompt), "the sample prompt has no product-specific hardcoding");
const identityPrompt = buildVisualConceptPrompt(
  {
    ...brief!,
    availableAssets: [
      {
        id: "packshot:example.png",
        role: "PRODUCT_PACKSHOT",
        provenance: "MANUAL",
        src: "/media/product/example.png",
        authoritativeForAppearance: true,
        isEvidence: false,
        imageTextReimportAllowed: false,
      },
    ],
  },
  "PREMIUM_PRODUCT",
  { reserveProductStage: true },
);
assert(identityPrompt.includes("remains authoritative") && identityPrompt.includes("Do not redesign the product label"), "product identity preservation is required");
assert(identityPrompt.includes("Leave a blank product stage"), "the real packshot stays outside the model redraw");
assert(identityPrompt.includes("not a premium product advertisement"), "the product direction is a website design");
assert(ART_DIRECTION_IS_EVIDENCE === false, "art direction is not evidence");
const editorialArt = directVisualArt(brief!, "PREMIUM_EDITORIAL");
const productArt = directVisualArt(brief!, "PREMIUM_PRODUCT");
const conversionArt = directVisualArt(brief!, "PREMIUM_CONVERSION");
assert(
  editorialArt.primaryArchetype === "EDITORIAL_LUXURY" &&
    productArt.primaryArchetype === "PRODUCT_LED_DTC" &&
    conversionArt.primaryArchetype === "STRUCTURED_CONVERSION",
  "direction families use different archetypes",
);
assert(
  new Set([editorialArt.visualNarrative, productArt.visualNarrative, conversionArt.visualNarrative]).size === 3,
  "direction families use different visual narratives",
);
assert(
  new Set([editorialArt.heroComposition, productArt.heroComposition, conversionArt.heroComposition]).size === 3,
  "direction families use different hero strategies",
);
assert(productArt.productStaging.includes("blank") && productArt.depthStrategy.length > 0 && productArt.imageryStrategy.length > 0, "product staging, depth, and imagery are explicit");
assert(
  productArt.sectionChoreography.some((line) => /full-bleed|asymmetric|quiet information|wide closing/i.test(line)) &&
    !productArt.sectionChoreography.every((line) => /^card$/i.test(line)),
  "section choreography is not card-only",
);
assert(productArt.avoidPatterns.includes("poster") && productArt.avoidPatterns.includes("advertisement"), "poster and ad remain forbidden in art direction");
const factsBeforeArt = JSON.stringify(facts);
directVisualArt(brief!, "PREMIUM_PRODUCT");
assert(JSON.stringify(facts) === factsBeforeArt && brief!.categoryContext === null, "art direction does not create ProductFacts");
const sleepArt = directVisualArt({ ...brief!, allowedCopy: ["Night Formula", "Learn More"], contentVersion: "sleep-context" }, "PREMIUM_EDITORIAL");
const oralArt = directVisualArt({ ...brief!, allowedCopy: ["Daily dental care", "Learn More"], contentVersion: "oral-context" }, "PREMIUM_EDITORIAL");
assert(sleepArt.visualContext === "sleep-atmosphere" && sleepArt.photographicLanguage.includes("night photography"), "category context influences visual decisions only");
assert(!/sleep better|fall asleep faster|wake refreshed/i.test(JSON.stringify(sleepArt)), "category context does not create consumer claims");
assert(oralArt.visualContext === "oral-care-atmosphere" && oralArt.photographicLanguage !== sleepArt.photographicLanguage, "different contexts choose different visual languages");
let variedTemplate = false;
for (let i = 0; i < 24; i++) {
  const candidate = directVisualArt({ ...brief!, contentVersion: "variant-" + i }, "PREMIUM_PRODUCT");
  if (candidate.secondaryInfluence !== productArt.secondaryInfluence || candidate.heroComposition !== productArt.heroComposition) variedTemplate = true;
}
assert(variedTemplate, "the same visual template is not blindly reused");
assert(identityPrompt.includes("visual-concept-prompt-v3") && identityPrompt.includes("The product stage is the visual anchor"), "v3 translates art direction without dropping website semantics");

const sameFacts = rejectVisualMutation(JSON.parse(beforeFacts!));
assert(JSON.stringify(sameFacts) === beforeFacts, "generated visual cannot mutate ProductFacts");
assert(reimportImageText("Doctor formulated 99 percent").allowed === false, "image text cannot re-enter the factual pipeline");

const calls: ConceptImageRequest[] = [];
const provider: ImageProvider = {
  async create(input) {
    calls.push(input);
    return Buffer.from("not-a-real-image");
  },
};
const root = mkdtempSync(path.join(tmpdir(), "visual-concept-"));
const deps = {
  root,
  provider,
  apiKeyConfigured: () => true,
  now: () => "2026-09-22T00:00:00.000Z",
  createId: () => "gen-test-1",
  env: { VISUAL_CONCEPT_MODEL: "gpt-image-2.5-flare", VISUAL_MASTER_MODEL: "gpt-image-2.5-sunburst" },
};

const plan = planVisualConceptGeneration(campaign, deps.env);
assert(plan?.model === "gpt-image-2.5-flare", "concept model comes from configuration");
assert(plan?.masterModel === "gpt-image-2.5-sunburst", "master model comes from configuration");
assert(plan?.quality === "low" && plan.size === "1024x1536", "exploration uses the documented portrait draft size");
assert(plan?.estimatedCallCount === 3 && calls.length === 0, "planning does not call the provider");
const singlePlan = planVisualConceptGeneration(campaign, deps.env, ["PREMIUM_PRODUCT"]);
assert(
  singlePlan?.estimatedCallCount === 1 && singlePlan.size === "1024x1536" && singlePlan.model === "gpt-image-2.5-flare",
  "a single direction plans one concept call",
);

async function main() {
const blocked = await generateVisualConcepts(
  { campaign, generationReason: "test", generationRequestId: "req-1", confirmGeneration: false },
  deps,
);
assert(blocked.status === "BLOCKED_NOT_CONFIRMED" && blocked.providerCalls === 0 && calls.length === 0, "unconfirmed generation makes no call");

const missingKey = await generateVisualConcepts(
  { campaign, generationReason: "test", generationRequestId: "req-1", confirmGeneration: true },
  { ...deps, apiKeyConfigured: () => false },
);
assert(missingKey.status === "BLOCKED_MISSING_API_KEY" && calls.length === 0, "missing API key is handled before any provider call");

const generated = await generateVisualConcepts(
  { campaign, generationReason: "operator asked", generationRequestId: "req-1", confirmGeneration: true },
  deps,
);
assert(generated.status === "GENERATED" && generated.providerCalls === 3 && calls.length === 3, "explicit generation makes one call per direction");
assert(calls.map((call) => call.model).every((model) => model === "gpt-image-2.5-flare"), "calls use the concept model");
assert(new Set(calls.map((call) => call.prompt)).size === 3, "the three prompts differ by direction");
assert(campaign.sourceFactsJson === beforeFacts, "generation leaves ProductFacts persistence unchanged");

const metadata = JSON.parse(
  readFileSync(path.join(root, "sample-product", "runs", "gen-test-1", "concepts", "a", "metadata.json"), "utf8"),
);
assert(metadata.model && metadata.quality && metadata.size && metadata.format, "metadata stores model, quality, size, and format");
assert(metadata.createdAt && metadata.campaignId === 42 && metadata.promptVersion && metadata.contentVersion, "metadata stores time, campaign, and versions");
assert(metadata.generatedVisualIsEvidence === false, "stored concept is not evidence");
assert(metadata.artDirectorVersion === "visual-art-director-v1", "metadata records the art director version");
const storedArts = JSON.parse(readFileSync(path.join(root, "sample-product", "runs", "gen-test-1", "art-direction.json"), "utf8")) as Array<{ primaryArchetype: string; artDirectorVersion: string }>;
assert(storedArts.length === 3 && new Set(storedArts.map((item) => item.primaryArchetype)).size === 3, "a run persists distinct art direction briefs");
assert(metadata.direction === "PREMIUM_EDITORIAL", "direction family is generic");

const reused = await generateVisualConcepts(
  { campaign, generationReason: "operator asked", generationRequestId: "req-1", confirmGeneration: true },
  deps,
);
assert(reused.status === "REUSED_REQUEST" && calls.length === 3, "the same request id does not generate again");

const duplicate = await generateVisualConcepts(
  { campaign, generationReason: "again", generationRequestId: "req-2", confirmGeneration: true },
  deps,
);
assert(duplicate.status === "BLOCKED_EXISTING" && calls.length === 3, "existing concepts are not regenerated without an explicit replace");

const singleCalls: ConceptImageRequest[] = [];
const singleRoot = mkdtempSync(path.join(tmpdir(), "visual-concept-single-"));
const single = await generateVisualConcepts(
  {
    campaign,
    generationReason: "one direction",
    generationRequestId: "req-single",
    confirmGeneration: true,
    directions: ["PREMIUM_PRODUCT"],
  },
  {
    ...deps,
    root: singleRoot,
    createId: () => "gen-single",
    provider: {
      async create(input) {
        singleCalls.push(input);
        return Buffer.from("one-direction");
      },
    },
  },
);
assert(single.status === "GENERATED" && single.providerCalls === 1 && singleCalls.length === 1, "a single direction makes one provider call");
assert(singleCalls[0]?.model === "gpt-image-2.5-flare" && singleCalls[0]?.quality === "low" && singleCalls[0]?.size === "1024x1536", "the single call uses the concept draft settings");
assert(singleCalls[0]?.prompt.includes("PREMIUM_PRODUCT") === true, "the single call uses the requested direction");
assert(!singleCalls[0]?.prompt.includes("PREMIUM_EDITORIAL") && !singleCalls[0]?.prompt.includes("PREMIUM_CONVERSION"), "the single call does not include the other directions");
assert(single.run?.concepts.length === 1 && single.run.concepts[0]?.key === "b", "only the requested direction is stored");
const reloaded = readRun(singleRoot, "sample-product", "gen-single");
assert(reloaded?.concepts.length === 1 && reloaded.concepts[0]?.metadata.direction === "PREMIUM_PRODUCT", "a one-direction run can be read back");

const media = mkdtempSync(path.join(tmpdir(), "visual-packshot-"));
const packRgba = Buffer.alloc(4 * 4 * 4, 0);
packRgba[0] = 10;
packRgba[1] = 200;
packRgba[2] = 20;
packRgba[3] = 255;
const packPng = encodeRgbaPng(4, 4, packRgba);
writeFileSync(path.join(media, "cutout.png"), packPng);
writeFileSync(path.join(media, "opaque.png"), encodeRgbaPng(4, 4, Buffer.alloc(4 * 4 * 4, 255)));
assert(inspectPackshotFile(path.join(media, "cutout.png")).usableTransparency === true, "a cutout packshot can be composited");
assert(inspectPackshotFile(path.join(media, "opaque.png")).usableTransparency === false, "an opaque packshot is not pasted as a rectangle");
const background = Buffer.alloc(32 * 48 * 4);
for (let pixel = 0; pixel < 32 * 48; pixel++) {
  background[pixel * 4] = 200;
  background[pixel * 4 + 1] = 20;
  background[pixel * 4 + 2] = 20;
  background[pixel * 4 + 3] = 255;
}
const backgroundPng = encodeRgbaPng(32, 48, background);
const composed = decodePng(composeSourcePackshot({ backgroundPng, packshotPng: packPng, direction: "PREMIUM_PRODUCT" }));
assert(composed.rgba[0] === 200, "canvas outside the product stage keeps the generated background");
const slot = (2 * 32 + 16) * 4;
assert(composed.rgba[slot] === 10 && composed.rgba[slot + 2] === 20, "the original packshot pixel is composited unchanged");
const previousMedia = process.env.PRESELL_OS_MEDIA;
process.env.PRESELL_OS_MEDIA = media;
try {
  const overlayCalls: ConceptImageRequest[] = [];
  const overlayRoot = mkdtempSync(path.join(tmpdir(), "visual-overlay-"));
  const overlay = await generateVisualConcepts(
    {
      campaign: { ...campaign, productImageSrc: "/media/product/cutout.png", productImageProvenance: "MANUAL" },
      generationReason: "overlay",
      generationRequestId: "req-overlay",
      confirmGeneration: true,
      directions: ["PREMIUM_PRODUCT"],
    },
    {
      ...deps,
      root: overlayRoot,
      createId: () => "gen-overlay",
      provider: {
        async create(input) {
          overlayCalls.push(input);
          return backgroundPng;
        },
      },
    },
  );
  assert(overlay.providerCalls === 1 && overlayCalls[0]?.operation === "generations" && !overlayCalls[0]?.referenceImagePath, "the model is not asked to redraw the packshot");
  assert(overlayCalls[0]?.outputFormat === "png", "the overlay path requests a png canvas");
  assert(overlay.run?.concepts[0]?.metadata.compositionStrategy === "SOURCE_OVERLAY_ON_RESERVED_STAGE", "metadata records deterministic composition");
  assert(overlay.run?.concepts[0]?.metadata.generatedVisualIsEvidence === false, "the composed visual remains non-evidence");
  const stored = decodePng(readFileSync(overlay.run!.concepts[0]!.imageFile));
  assert(stored.rgba[slot] === 10, "the stored concept keeps the source packshot pixel");
  const rawFile = path.join(path.dirname(overlay.run!.concepts[0]!.imageFile), "raw.png");
  assert(readFileSync(rawFile).equals(backgroundPng), "raw generated pixels are stored separately from the composited concept");
  assert(overlay.run?.concepts[0]?.metadata.generatedPixelsArtifact === "raw.png", "metadata distinguishes generated pixels");
  assert(overlay.run?.concepts[0]?.metadata.compositedArtifact === "concept.png", "metadata distinguishes the composited concept");
  assert(overlay.run?.concepts[0]?.metadata.sourcePackshotReference === "packshot:cutout.png", "metadata records the source packshot reference");
} finally {
  if (previousMedia === undefined) delete process.env.PRESELL_OS_MEDIA;
  else process.env.PRESELL_OS_MEDIA = previousMedia;
}
const realPackshot = path.join("data", "product-images", "6e84961241bdcd28c750ceff.png");
if (existsSync(realPackshot)) {
  const inspection = inspectPackshotFile(realPackshot);
  assert(inspection.inspected && inspection.usableTransparency, "the permitted packshot has usable transparency");
}

const defaults = visualConceptConfig({});
assert(defaults.conceptModel === "gpt-image-2.5-flare" && defaults.masterModel === "gpt-image-2.5-sunburst", "defaults match the documented models");
assert(VISUAL_DIRECTIONS.map((item) => item.family).join(",") === "PREMIUM_EDITORIAL,PREMIUM_PRODUCT,PREMIUM_CONVERSION", "directions are the generic families");

const engineSource = readdirSync(path.join("src", "lib", "visual-concept"))
  .map((name) => readFileSync(path.join("src", "lib", "visual-concept", name), "utf8"))
  .join("\n");
assert(!/joint[\s-]?genesis/i.test(engineSource), "the engine has no Joint Genesis hardcoding");

const surfaces = [
  "src/app/admin/preview/[slug]/page.tsx",
  "src/app/p/[slug]/page.tsx",
  "src/components/presell/presell-page-view.tsx",
  "src/app/admin/visual-concepts/[slug]/page.tsx",
].map((file) => readFileSync(file, "utf8")).join("\n");
assert(!surfaces.includes("createOpenAiImageProvider"), "preview, public, and gallery pages do not construct the provider");
assert(!surfaces.includes("generateVisualConcepts("), "pages do not call generation while rendering");

const stored = getCampaignBySlug("joint-genesis-controlled-ready-13");
if (stored) {
  const factsBefore = stored.sourceFactsJson;
  const presentationBefore = stored.productionPresentation;
  const liveBrief = buildVisualBrief(stored);
  assert(stored.sourceFactsJson === factsBefore, "reading the live campaign does not change ProductFacts");
  assert(stored.productionPresentation === presentationBefore, "reading the live campaign does not change the production candidate");
  assert(liveBrief !== null && liveBrief.allowedCopy.length > 0, "the live validated page supplies allowed copy");
  const livePlan = planVisualConceptGeneration(stored);
  const livePrompt = buildVisualConceptPrompt(liveBrief!, "PREMIUM_PRODUCT", {
    reserveProductStage: livePlan?.compositionStrategy === "SOURCE_OVERLAY_ON_RESERVED_STAGE",
  });
  assert(!livePrompt.includes(stored.affiliateUrl), "the live hop is not sent to the prompt");
  assert(livePlan?.estimatedCallCount === 3 && calls.length === 3, "planning the live campaign makes no additional provider call");
  assert(
    livePlan?.operation === "generations" && livePlan.compositionStrategy === "SOURCE_OVERLAY_ON_RESERVED_STAGE" && livePlan.format === "png",
    "the live packshot is reserved for source overlay",
  );
  assert(livePrompt.includes("Leave a blank product stage"), "the live prompt reserves the product stage");
}

if (failed) {
  console.error("VISUAL_CONCEPT_ENGINE_CHECKS=" + failed);
  process.exit(1);
}
console.log("VISUAL_CONCEPT_ENGINE_CHECKS=PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
