import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import type { Campaign } from "../src/lib/campaigns.ts";
import type { PresellPage } from "../src/lib/presell-page.ts";
import { buildVisualBrief } from "../src/lib/visual-concept/brief.ts";
import { encodeRgbaPng, decodePng } from "../src/lib/visual-concept/compose.ts";
import { visualConceptConfig } from "../src/lib/visual-concept/config.ts";
import { directVisualArt } from "../src/lib/visual-concept/art-director.ts";
import { directVisualMaster } from "../src/lib/visual-concept/master-art-director.ts";
import { buildVisualMasterPrompt } from "../src/lib/visual-concept/master-prompt.ts";
import { generateVisualMaster } from "../src/lib/visual-concept/master.ts";
import { rejectVisualMutation } from "../src/lib/visual-concept/firewall.ts";
import type { ConceptImageRequest } from "../src/lib/visual-concept/provider.ts";

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
      paragraphs: ["The seller publishes a 180-day return policy measured from the order date."],
      bullets: [],
      cards: [],
      faq: [],
    },
    {
      id: "faq",
      title: "Questions",
      visible: true,
      paragraphs: [],
      bullets: [],
      cards: [],
      faq: [
        {
          question: "Does the seller publish a return policy?",
          answer: "The seller publishes a 180-day return policy measured from the order date.",
        },
      ],
    },
  ],
  ctaLabel: "Learn More",
  omitted: [],
  guaranteeDaysDisplay: null,
};

const facts = emptyProductFacts("Sample Product", "https://seller.example/product", "MANUAL");
facts.features = ["Sample Product supports a daily routine."];
facts.confidence.features = "MANUAL";
facts.importQuality = "PARTIAL";

const media = mkdtempSync(path.join(tmpdir(), "visual-master-media-"));
const packRgba = Buffer.alloc(4 * 4 * 4, 0);
packRgba[0] = 10;
packRgba[1] = 200;
packRgba[2] = 20;
packRgba[3] = 255;
writeFileSync(path.join(media, "cutout.png"), encodeRgbaPng(4, 4, packRgba));
const previousMedia = process.env.PRESELL_OS_MEDIA;
process.env.PRESELL_OS_MEDIA = media;

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
  productImageSrc: "/media/product/cutout.png",
  productImageProvenance: "MANUAL",
};

const references = [
  { direction: "PREMIUM_EDITORIAL" as const, generationId: "editorial-ref" },
  { direction: "PREMIUM_PRODUCT" as const, generationId: "product-ref" },
  { direction: "PREMIUM_CONVERSION" as const, generationId: "conversion-ref" },
];

const background = Buffer.alloc(32 * 48 * 4);
for (let pixel = 0; pixel < 32 * 48; pixel++) {
  background[pixel * 4] = 200;
  background[pixel * 4 + 1] = 20;
  background[pixel * 4 + 2] = 20;
  background[pixel * 4 + 3] = 255;
}
const backgroundPng = encodeRgbaPng(32, 48, background);

async function main() {
  const defaults = visualConceptConfig({});
  assert(defaults.quality === "low" && defaults.masterQuality === "high", "concept stays low and the master uses high");
  assert(defaults.masterModel === "gpt-image-2.5-sunburst" && defaults.masterSize === "1024x1536", "master model and portrait size are configured");
  assert(visualConceptConfig({ VISUAL_CONCEPT_QUALITY: "low" }).masterQuality === "high", "concept quality does not downgrade the master");

  const brief = buildVisualBrief(campaign);
  assert(brief !== null, "master brief is built from the page");
  const art = directVisualMaster(brief!);
  const editorial = directVisualArt(brief!, "PREMIUM_EDITORIAL");
  const product = directVisualArt(brief!, "PREMIUM_PRODUCT");
  const conversion = directVisualArt(brief!, "PREMIUM_CONVERSION");
  assert(art.baseVisualLanguage === "A_EDITORIAL" && art.productLanguage === "B_PRODUCT" && art.conversionLanguage === "C_CONVERSION", "master records the three languages");
  assert(art.masterDirection === "HYBRID_A_B_C" && art.artDirectionIsEvidence === false, "master direction is hybrid and not evidence");
  assert(art.sectionChoreography.length === 9, "master choreography has nine regions");
  assert(art.sectionChoreography.join("\n") !== editorial.sectionChoreography.join("\n"), "master choreography is not the editorial list");
  assert(art.sectionChoreography.join("\n") !== product.sectionChoreography.join("\n"), "master choreography is not the product list");
  assert(art.sectionChoreography.join("\n") !== conversion.sectionChoreography.join("\n"), "master choreography is not the conversion list");
  assert(!art.heroStrategy.includes(product.heroComposition), "master hero does not copy the product hero");

  const prompt = buildVisualMasterPrompt(brief!, art);
  assert(prompt.includes("one coherent") && prompt.includes("not three layouts"), "prompt asks for one system");
  assert(prompt.includes("Leave one blank product stage"), "prompt reserves a blank stage");
  assert(prompt.includes("Do not remove, inpaint, or reconstruct"), "prompt keeps the source person untouched");
  assert(prompt.includes("Do not rewrite a return policy as a guarantee"), "prompt protects return-policy wording");
  assert(prompt.includes("The seller publishes a 180-day return policy measured from the order date."), "allowed return copy is the only return wording");
  assert(!prompt.includes("hop.clickbank.net"), "the hop is not in the master prompt");
  assert(!prompt.includes("gpt-image-2.5-flare"), "the master prompt does not name the exploration model");
  assert(!/joint[\s-]?genesis/i.test(prompt), "the sample master prompt has no product-specific hardcoding");

  const calls: ConceptImageRequest[] = [];
  const root = mkdtempSync(path.join(tmpdir(), "visual-master-"));
  const factsBefore = campaign.sourceFactsJson;
  const generated = await generateVisualMaster(
    { campaign, confirmGeneration: true, explorationReferences: references, now: () => "2026-09-23T00:00:00.000Z" },
    {
      root,
      apiKeyConfigured: () => true,
      provider: {
        async create(input) {
          calls.push(input);
          return backgroundPng;
        },
      },
    },
  );
  assert(generated.status === "GENERATED" && generated.providerCalls === 1 && calls.length === 1, "one mock master call");
  assert(
    calls[0]?.model === "gpt-image-2.5-sunburst" &&
      calls[0]?.quality === "high" &&
      calls[0]?.size === "1024x1536" &&
      calls[0]?.operation === "generations" &&
      !calls[0]?.referenceImagePath,
    "the mock call uses sunburst, high, portrait, and no packshot upload",
  );
  const masterDir = generated.stored?.directory ?? "";
  assert(existsSync(path.join(masterDir, "brief.json")), "brief is persisted");
  assert(existsSync(path.join(masterDir, "art-direction.json")), "art direction is persisted");
  assert(existsSync(path.join(masterDir, "prompt.txt")), "prompt is persisted");
  assert(existsSync(path.join(masterDir, "raw.png")), "raw master is persisted");
  assert(existsSync(path.join(masterDir, "master.png")), "composited master is persisted");
  assert(existsSync(path.join(masterDir, "metadata.json")), "metadata is persisted");
  const raw = readFileSync(path.join(masterDir, "raw.png"));
  const composited = readFileSync(path.join(masterDir, "master.png"));
  assert(!raw.equals(composited), "raw and composited masters differ");
  const pixels = decodePng(composited);
  assert(pixels.rgba[0] === 200, "generated background remains outside the stage");
  assert(pixels.rgba.includes(10), "a source packshot pixel is present after overlay");
  const metadata = JSON.parse(readFileSync(path.join(masterDir, "metadata.json"), "utf8"));
  assert(metadata.humanPublicationApproved === false && metadata.humanReview === "PENDING", "master is not auto-approved");
  assert(metadata.productOnlyDerivativeUsed === false && metadata.modelRecreatedPackshot === false && metadata.originalPackshotOverlay === true, "overlay uses the original packshot");
  assert(metadata.visualDirectionSelected === "HYBRID_A_B_C", "creative direction is recorded without publication approval");
  assert(!existsSync(path.join(root, "sample-product", "selection.json")), "master generation does not write a concept selection");
  assert(!existsSync(path.join(root, "sample-product", "runs")), "master generation does not write exploration runs");
  assert(campaign.sourceFactsJson === factsBefore && rejectVisualMutation(facts) === facts, "master generation does not mutate product facts");

  const again = await generateVisualMaster(
    { campaign, confirmGeneration: true, explorationReferences: references },
    {
      root,
      apiKeyConfigured: () => true,
      provider: {
        async create() {
          calls.push({} as ConceptImageRequest);
          return backgroundPng;
        },
      },
    },
  );
  assert(again.status === "BLOCKED_EXISTING" && again.providerCalls === 0 && calls.length === 1, "an existing master is not regenerated");

  const wrongModel = await generateVisualMaster(
    { campaign, confirmGeneration: true, explorationReferences: references },
    {
      root: mkdtempSync(path.join(tmpdir(), "visual-master-model-")),
      env: { VISUAL_MASTER_MODEL: "gpt-image-2.5-flare" },
      apiKeyConfigured: () => true,
      provider: {
        async create() {
          throw new Error("should not be called");
        },
      },
    },
  );
  assert(wrongModel.status === "BLOCKED_MODEL" && wrongModel.providerCalls === 0, "flare is not a paid master fallback");

  const surfaces = [
    "src/app/admin/preview/[slug]/page.tsx",
    "src/app/p/[slug]/page.tsx",
    "src/components/presell/presell-page-view.tsx",
    "src/app/admin/visual-concepts/[slug]/page.tsx",
    "src/app/admin/visual-concepts/actions.ts",
  ]
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  const pages = [
    "src/app/admin/preview/[slug]/page.tsx",
    "src/app/p/[slug]/page.tsx",
    "src/components/presell/presell-page-view.tsx",
    "src/app/admin/visual-concepts/[slug]/page.tsx",
  ]
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  assert(!surfaces.includes("generateVisualMaster("), "pages do not generate a master while rendering");
  assert(!pages.includes("createOpenAiImageProvider"), "pages do not construct the provider while rendering");

  if (previousMedia === undefined) delete process.env.PRESELL_OS_MEDIA;
  else process.env.PRESELL_OS_MEDIA = previousMedia;

  if (failed) {
    console.error("VISUAL_MASTER_CHECKS=FAIL " + failed);
    process.exit(1);
  }
  console.log("VISUAL_MASTER_CHECKS=PASS");
  console.log("NO_TEST_API_CALLS=PASS");
  console.log("NO_RENDER_SIDE_EFFECTS=PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
