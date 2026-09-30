/**
 * PRODUCT VISUAL CONSTRUCTION
 * Downstream construction for content that is CONTENT_READY. Publication is a
 * separate decision and is never implied here.
 *
 * Deterministic discovery and planning only: no image generation, no vision
 * model, no provider call.
 *
 * npx tsx scripts/run-product-visual-construction-v1.ts --dir=data/generic-lp-engine/v1/<replay>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { classifyAssetCandidate } from "../src/lib/assets/classify.ts";
import { discoverSourceAssets } from "../src/lib/assets/discover.ts";
import { probeRemoteImage } from "../src/lib/assets/probe.ts";
import { MAX_ASSET_PROBES } from "../src/lib/assets/acquire.ts";
import { composePresellPage, consumerVisibleText, serializePresellPage, validateComposedPage } from "../src/lib/presell-page.ts";
import { applyGenericFaqRecovery } from "../src/lib/faq-field-promotion.ts";
import { presellPageFaqAuthorityBindings } from "../src/lib/ai/presell-faq-authority.ts";
import { composeContentReadiness, validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import { lintCampaign } from "../src/lib/policy-linter.ts";
import { resolvePublicationGate } from "../src/lib/publication.ts";
import { approachToTemplate } from "../src/lib/validation/pipeline.ts";
import { buildVisualBrief } from "../src/lib/visual-concept/brief.ts";
import { deriveVisualContext, directVisualArt } from "../src/lib/visual-concept/art-director.ts";
import { planVisualConceptGeneration } from "../src/lib/visual-concept/engine.ts";
import {
  deriveVisualAssetManifest,
  imageCallPlan,
  validateVisualAssetManifest,
  type VisualAssetNeed,
} from "../src/lib/visual-concept/asset-manifest.ts";
import { persistableProductVisualPlan, type AuditProductCandidate } from "../src/lib/product-visual/load.ts";
import { decodePng } from "../src/lib/visual-concept/compose.ts";
import { VALIDATION_SAFE_AFFILIATE } from "../src/lib/validation/constants.ts";
import type { Campaign } from "../src/lib/campaigns.ts";
import type { ProductFacts } from "../src/lib/product-facts.ts";
import type { VisualDirectionFamily } from "../src/lib/visual-concept/types.ts";

const replayDir = process.argv.find((item) => item.startsWith("--dir="))?.slice(6);
if (!replayDir) throw new Error("--dir is required");
const outDir = path.join(replayDir, "visual-construction-v1");
const assetDir = path.join(outDir, "product-assets");
mkdirSync(assetDir, { recursive: true });
/** Keeps discovered originals inside the replay, out of the campaign media store. */
process.env.PRESELL_OS_MEDIA = assetDir;
const write = (name: string, value: unknown) => writeFileSync(path.join(outDir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");

const readJson = <T,>(file: string) => JSON.parse(readFileSync(path.join(replayDir, file), "utf8")) as T;
const readOptional = <T,>(file: string): T | null => {
  try {
    return readJson<T>(file);
  } catch {
    return null;
  }
};

/**
 * Deterministic discovery cannot see pixels, so it leaves person, dominance,
 * and asset class UNKNOWN. A review artifact, when present, resolves them.
 */
type ReviewedAsset = {
  candidateId: string;
  containsProduct?: string;
  containsPerson?: string;
  containsExternalIcons?: string;
  productDominance?: string;
  assetClass?: string[];
  visualUsability?: string[];
};
const visualReview = readOptional<{ assets: ReviewedAsset[] }>("visual-construction-v1/visual-review.json");
const reviewOf = (candidateId: string) => visualReview?.assets.find((item) => item.candidateId === candidateId) ?? null;
const revalidation = readJson<{ contentReadiness: string; publicationGate: string }>("policy-semantics-v1/revalidation.json");
if (revalidation.contentReadiness !== "CONTENT_READY") {
  console.log(`STOP=CONTENT_NOT_READY readiness=${revalidation.contentReadiness}`);
  process.exit(0);
}

const facts = readJson<{ facts: ProductFacts }>("product-facts.json").facts;
const copy = readJson<{ headline: string; body: string; ctaLabel: string }>("policy-semantics-v1/copy.json");
const source = readJson<{ originalOperatorUrl: string; finalUrl: string }>("source-resolution.json");

const USER_AGENT = "AfiliadoIA-Import/1.0 (+internal tool, not a public crawler)";

async function main() {
  // ---- STAGE V1 — PRODUCT ASSET DISCOVERY ---------------------------------
  const pageUrl = source.finalUrl || source.originalOperatorUrl;
  const robotsUrl = new URL("/robots.txt", pageUrl).toString();
  const robots = await fetch(robotsUrl, { headers: { "user-agent": USER_AGENT } });
  const robotsBody = robots.ok ? await robots.text() : "";
  const disallowAll = /user-agent:\s*\*[\s\S]*?disallow:\s*\/\s*($|\n)/i.test(robotsBody);
  if (disallowAll) {
    write("asset-inventory.json", { robotsAllowed: false, reason: "robots.txt disallows crawling", candidates: [] });
    console.log("STOP=ROBOTS_DISALLOW");
    return;
  }
  const pageResponse = await fetch(pageUrl, { headers: { "user-agent": USER_AGENT }, redirect: "follow" });
  const html = await pageResponse.text();
  const discovered = discoverSourceAssets(html, pageUrl);

  const ranked = [...discovered]
    .filter((candidate) => !candidate.rejected)
    .sort((a, b) => b.packshotScore - a.packshotScore)
    .slice(0, MAX_ASSET_PROBES);

  const candidates: AuditProductCandidate[] = [];
  const inventory: Array<Record<string, unknown>> = [];
  for (const candidate of ranked) {
    const remote = await probeRemoteImage(candidate.url);
    if (!remote) continue;
    const classified = classifyAssetCandidate({
      url: candidate.url,
      alt: candidate.alt,
      title: candidate.title,
      width: remote.width,
      height: remote.height,
      tagHtml: candidate.tagHtml,
      className: candidate.className,
      parentHint: candidate.parentHint,
      source: candidate.source,
    });
    const hash = await import("node:crypto").then((crypto) => crypto.createHash("sha256").update(remote.buffer).digest("hex"));
    const ext = remote.mime.includes("png") ? "png" : remote.mime.includes("webp") ? "webp" : "jpg";
    const filename = `${hash.slice(0, 24)}.${ext}`;
    writeFileSync(path.join(assetDir, filename), remote.buffer);
    let hasAlpha = false;
    if (ext === "png") {
      try {
        const decoded = decodePng(remote.buffer);
        hasAlpha = decoded.rgba.some((value, index) => index % 4 === 3 && value < 255);
      } catch {
        hasAlpha = false;
      }
    }
    const productBearing = classified.role === "PRODUCT_PACKSHOT" || classified.role === "PRODUCT_LIFESTYLE";
    /** Deterministic metadata only. Anything that needs eyes on the pixels stays UNKNOWN. */
    const assetClass =
      classified.role === "PRODUCT_PACKSHOT"
        ? hasAlpha
          ? ["PRODUCT_ONLY", "TRANSPARENT_PACKSHOT"]
          : ["PRODUCT_ONLY"]
        : classified.role === "PRODUCT_LIFESTYLE"
          ? ["LIFESTYLE_IMAGE"]
          : classified.role === "BRAND_LOGO"
            ? ["LOGO"]
            : ["UNKNOWN"];
    const record = {
      candidateId: hash.slice(0, 16),
      sourceUrl: candidate.url,
      finalUrl: remote.finalUrl,
      discoveredFrom: candidate.source,
      localPath: path.join(assetDir, filename).replace(/\\/g, "/"),
      contentHash: hash,
      mimeType: remote.mime,
      width: remote.width,
      height: remote.height,
      bytes: remote.bytes,
      hasAlpha,
      role: classified.role,
      packshotScore: classified.packshotScore,
      rejected: classified.rejected,
      rejectReason: classified.rejectReason,
      classificationMethod: "DETERMINISTIC",
      provenance: "DIRECT_SOURCE",
      generated: false,
      factualAuthority: false,
      imageTextReimportAllowed: false,
      visionVerified: false,
    };
    const review = reviewOf(record.candidateId);
    inventory.push({ ...record, visionVerified: Boolean(review), reviewedProperties: review ?? null });
    const containsProduct = review?.containsProduct ?? (productBearing ? "LIKELY" : "UNKNOWN");
    if (!classified.rejected && containsProduct !== "NO" && (productBearing || review)) {
      candidates.push({
        candidateId: record.candidateId,
        localPath: record.localPath,
        width: remote.width,
        height: remote.height,
        hasAlpha,
        assetClass: (review?.assetClass ?? assetClass) as AuditProductCandidate["assetClass"],
        containsProduct: containsProduct as AuditProductCandidate["containsProduct"],
        containsPerson: (review?.containsPerson ?? "UNKNOWN") as AuditProductCandidate["containsPerson"],
        containsExternalIcons: (review?.containsExternalIcons ?? "UNKNOWN") as AuditProductCandidate["containsExternalIcons"],
        productDominance: (review?.productDominance ?? "UNKNOWN") as AuditProductCandidate["productDominance"],
        visualUsability: review?.visualUsability ?? (classified.role === "PRODUCT_PACKSHOT" ? ["HERO_PRIMARY"] : []),
      });
    }
  }

  const cleanPackshot =
    candidates.find((item) => !item.visualUsability.includes("NOT_RECOMMENDED") && item.visualUsability.includes("HERO_PRIMARY")) ?? null;
  write("asset-inventory.json", {
    inventoryVersion: "product-asset-inventory-v1",
    robotsAllowed: true,
    sourceUrl: pageUrl,
    pageStatus: pageResponse.status,
    antiBotBypassUsed: false,
    visionClassificationUsed: false,
    referencedImages: discovered.length,
    probed: inventory.length,
    usableProductAssets: candidates.length,
    candidates: inventory,
  });

  // ---- COMPOSITION --------------------------------------------------------
  const variant = { approach: "REVIEW" as const, headline: copy.headline, body: copy.body, ctaLabel: copy.ctaLabel };
  const page = composePresellPage({ variant, facts, template: approachToTemplate(variant.approach) });
  const composed = validateComposedPage(page, facts, VALIDATION_SAFE_AFFILIATE);

  const packshot = cleanPackshot ?? candidates[0] ?? null;
  const campaign = {
    id: 0,
    name: facts.productName,
    slug: path.basename(replayDir),
    headline: copy.headline,
    body: copy.body,
    ctaLabel: copy.ctaLabel,
    affiliateUrl: VALIDATION_SAFE_AFFILIATE,
    headScript: null,
    adHeadline: null,
    publicationStatus: "draft",
    publishedAt: null,
    createdAt: "",
    updatedAt: "",
    pageTemplate: approachToTemplate(variant.approach),
    pageComposition: serializePresellPage(page),
    productImageSrc: packshot ? `/media/product/${path.basename(packshot.localPath)}` : null,
    productImageProvenance: packshot ? "DIRECT_SOURCE" : null,
    subheadline: null,
    sourceFactsJson: JSON.stringify(facts),
  } as unknown as Campaign;

  /** The composed page carries CODE-owned FAQ questions, so it is graded with the same authority bindings publication uses. */
  const recovered = applyGenericFaqRecovery(facts);
  const composedGrounding = validateGrounding(consumerVisibleText(page), recovered, {
    faqAuthorities: presellPageFaqAuthorityBindings(page, recovered),
  });
  const composedPolicy = lintCampaign(campaign);
  const composedReadiness = composeContentReadiness({ grounding: composedGrounding.status, policyFindings: composedPolicy.findings });
  write("composition.json", {
    sections: page.sections.filter((section) => section.visible).map((section) => section.id),
    factualFirewall: composed.factualFirewall.status,
    groundingWithoutFaqAuthority: composed.grounding.status,
    grounding: composedGrounding.status,
    unsupportedClaims: composedGrounding.unsupportedClaims,
    policyGate: composedPolicy.gate,
    contentReadiness: composedReadiness,
    publicationGate: resolvePublicationGate(campaign),
  });

  // ---- STAGE V2 — VISUAL INTELLIGENCE AND BRIEF ---------------------------
  const brief = buildVisualBrief(campaign);
  if (!brief) {
    console.log("STOP=NO_VISUAL_BRIEF");
    return;
  }
  const visualContext = deriveVisualContext(brief.allowedCopy);
  /** Product-led when the source supplies a usable product asset, editorial when it does not. */
  const direction: VisualDirectionFamily = packshot ? "PREMIUM_PRODUCT" : "PREMIUM_EDITORIAL";
  const art = directVisualArt(brief, direction);
  const conceptPlan = planVisualConceptGeneration(campaign, { ...process.env, OPENAI_API_KEY: "" });
  write("visual-brief.json", { ...brief, visualContext });
  write("art-direction.json", art);
  write("concept-plan.json", { ...conceptPlan, executed: false, providerCalls: 0 });

  // ---- STAGE V3 — ASSET REQUIREMENTS --------------------------------------
  const material = art.materialVocabulary.join(", ");
  const needs: VisualAssetNeed[] = [
    {
      assetId: "hero-atmosphere",
      semanticRole: "HERO_ATMOSPHERE",
      sectionId: "hero",
      placeholderSlot: "hero-photography",
      purpose: "Photographic field behind the opening headline, with clear space for the separate packshot overlay.",
      desktopAspectRatio: "16:9",
      mobileAspectRatio: "4:5",
      recommendedGenerationSize: "1536x1024",
      generationGroup: "hero-field",
      focalPoint: "open-right",
      visualDescription: `A wide studio sweep built from layered planes of ${material}. A seamless backdrop curves away behind a low horizontal surface, one soft directional light grazes it from the upper left, and the shadow falls long and controlled. ${art.photographicLanguage}. The right third is an empty surface.`,
      compositionIntent: "Leave the product stage blank for the source packshot. Do not draw a package, label, logo, or person.",
    },
    {
      assetId: "editorial-material",
      semanticRole: "EDITORIAL_MATERIAL",
      sectionId: "overview",
      placeholderSlot: "overview-material",
      purpose: "Material still beside the overview copy.",
      desktopAspectRatio: "3:2",
      mobileAspectRatio: "1:1",
      recommendedGenerationSize: "1536x1024",
      generationGroup: "material-still",
      focalPoint: "center",
      visualDescription: `An overhead tabletop of matte ${material}: two or three torn paper planes overlapping at shallow angles, fibre and grain visible up close, a single soft window of studio light crossing them. ${art.photographicLanguage}. Nothing is placed on the surface.`,
      compositionIntent: "Support large type beside the image. No package, no person, no lettering.",
    },
    {
      assetId: "feature-visual",
      semanticRole: "FEATURE_VISUAL",
      sectionId: "features",
      placeholderSlot: "feature-material",
      purpose: "Closer material crop beside the feature copy.",
      desktopAspectRatio: "4:3",
      mobileAspectRatio: "1:1",
      recommendedGenerationSize: "1536x1024",
      generationGroup: "material-still",
      focalPoint: "texture",
      visualDescription: `The same tabletop seen closer, so the edge of one paper plane and its soft shadow fill the frame. ${art.photographicLanguage}. Materials: ${material}.`,
      compositionIntent: "An editorial image beside text. Not a card, icon, or product shot.",
    },
    {
      assetId: "photographic-pause",
      semanticRole: "PHOTOGRAPHIC_PAUSE",
      sectionId: "visual-story",
      placeholderSlot: "editorial-pause",
      purpose: "Full-bleed pause between information sections.",
      desktopAspectRatio: "21:9",
      mobileAspectRatio: "16:9",
      recommendedGenerationSize: "1536x1024",
      generationGroup: "pause",
      focalPoint: "horizon",
      visualDescription: `A wide, almost empty field: light falling across a single seamless ${art.materialVocabulary[0]} plane, the gradient running from soft highlight to quiet shadow, ${art.materialVocabulary[3] ?? "fine grain"} visible in the falloff. ${art.photographicLanguage}. No objects at all.`,
      compositionIntent: "A visual breath. Do not add a headline, caption, or symbol.",
    },
    {
      assetId: "decision-background",
      semanticRole: "DECISION_BACKGROUND",
      sectionId: "decision",
      placeholderSlot: "closing-photography",
      purpose: "Closing ground behind the final action.",
      desktopAspectRatio: "16:9",
      mobileAspectRatio: "3:2",
      recommendedGenerationSize: "1536x1024",
      generationGroup: "hero-field",
      focalPoint: "center-light",
      visualDescription: `The same studio sweep read wider and calmer for the closing band, with the light centred instead of raking. ${art.photographicLanguage}. Materials: ${material}.`,
      compositionIntent: "A quiet closing ground. No second product, no person, no promotional line.",
    },
  ];
  const manifest = deriveVisualAssetManifest({
    campaignSlug: campaign.slug,
    contentVersion: brief.contentVersion,
    art: {
      photographicLanguage: art.photographicLanguage,
      materialVocabulary: art.materialVocabulary,
      depthIntent: art.depthStrategy,
      lightingDirection: art.photographicLanguage,
    },
    needs,
  });
  const manifestErrors = validateVisualAssetManifest(manifest);
  write("asset-requirements.json", {
    manifest,
    errors: manifestErrors,
    imageCallPlan: imageCallPlan(manifest),
    generated: [],
    /** Roles that a section could carry but that no generated file funds. Recorded so the omission stays a decision, not a gap. */
    omittedRoles: [
      { semanticRole: "USAGE_VISUAL", reason: "text-led section; no generated file is necessary to read it" },
      { semanticRole: "RETURN_POLICY_VISUAL", reason: "contrast comes from the band itself; a photograph would add nothing the copy states" },
      { semanticRole: "DECORATIVE_TEXTURE", reason: "not required by the section rhythm" },
    ],
  });

  // ---- STAGE V4 — PRODUCT VISUAL PLAN -------------------------------------
  const productPlan = persistableProductVisualPlan(candidates, "visual-construction-v1/asset-inventory.json");
  write("product-visual-plan.json", productPlan);

  console.log(
    `ASSETS discovered=${discovered.length} probed=${inventory.length} usable=${candidates.length} cleanPackshot=${cleanPackshot ? "YES" : "NO"}`,
  );
  console.log(
    `COMPOSITION grounding=${composedGrounding.status} readiness=${composedReadiness} publicationGate=${resolvePublicationGate(campaign)} firewall=${composed.factualFirewall.status}`,
  );
  console.log(`VISUAL context=${visualContext} direction=${direction} primary=${art.primaryArchetype} secondary=${art.secondaryInfluence}`);
  console.log(`VOCABULARY ${art.materialVocabulary.join(" | ")}`);
  console.log(`MANIFEST assets=${manifest.assets.length} errors=${manifestErrors.length} minimumImageCalls=${imageCallPlan(manifest).minimumImageCalls}`);
  console.log(
    `PRODUCT_VISUAL_PLAN roles=${Object.keys(productPlan.roles).join(",") || "none"} omitted=${productPlan.omitted.map((item) => item.role).join(",") || "none"}`,
  );
  console.log("OPENAI_IMAGE_CALLS=0 ANTHROPIC_CONTENT_CALLS=0");
}

void main();
