// npx tsx scripts/test-lp-builder-media-manager.ts
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { analyzeProductProfile } from "../src/lib/product-profile.ts";
import { planPresentation } from "../src/lib/presentation-plan.ts";
import { composePresellPage } from "../src/lib/presell-page.ts";
import { validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import { lintCampaign } from "../src/lib/policy-linter.ts";
import { emptyProductFacts, type ProductFacts } from "../src/lib/product-facts.ts";
import { VALIDATION_SAFE_AFFILIATE } from "../src/lib/validation/constants.ts";
import { NO_PRESELL_RENDER_ASSETS } from "../src/lib/presell-render-assets.ts";
import { contentDocument, projectContentFields } from "../src/lib/lp-builder/content.ts";
import { AFFILIATE_DISCLOSURE_TEXT, TRUST_EDITORIAL } from "../src/lib/public-site.ts";
import { mediaSeedsFor, presentMedia } from "../src/lib/lp-media-render.ts";
import {
  buildMediaSlots,
  emptyMediaFields,
  mediaWarnings,
  previewAssignments,
  presentationSrc,
  resolveMedia,
} from "../src/lib/lp-builder/media.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FALHOU: ${message}`);
  console.log(`OK: ${message}`);
}

const dbFile = path.join(os.tmpdir(), `lp-media-${Date.now()}.db`);
process.env.PRESELL_OS_DB = dbFile;

function loadFacts(file: string): ProductFacts | null {
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, "utf8")) as { facts?: ProductFacts; productName?: string };
  if (raw.facts?.productName) return raw.facts;
  if (raw.productName) return raw as ProductFacts;
  return null;
}

function walkFacts(dir: string, acc: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".next" || name === "visual-qa-tmp") continue;
    const full = path.join(dir, name);
    let info;
    try {
      info = statSync(full);
    } catch {
      continue;
    }
    if (info.isDirectory()) walkFacts(full, acc);
    else if (/facts/i.test(name) && name.endsWith(".json")) acc.push(full);
  }
  return acc;
}

function storedFacts(label: string): ProductFacts {
  const needle = label.toLowerCase();
  for (const file of walkFacts("data")) {
    const facts = loadFacts(file);
    if (facts?.productName?.toLowerCase().includes(needle)) return facts;
  }
  return emptyProductFacts(label, "https://example.test/replay", "IMPORTED");
}

function campaignFrom(facts: ProductFacts) {
  return {
    id: 0,
    name: facts.productName,
    slug: "lp-media",
    headline: facts.productName || "Headline",
    body: facts.description || facts.productName || "Body",
    ctaLabel: "Learn More",
    affiliateUrl: VALIDATION_SAFE_AFFILIATE,
    headScript: null,
    adHeadline: null,
    publicationStatus: "draft" as const,
    publishedAt: null,
    createdAt: "",
    updatedAt: "",
    pageTemplate: null,
    pageComposition: null,
    productImageSrc: null,
    productImageProvenance: null,
    subheadline: null,
    sourceFactsJson: null,
  };
}

function contentFor(facts: ProductFacts) {
  const page = composePresellPage({
    variant: { headline: facts.productName || "Headline", body: facts.description || facts.productName || "Body", ctaLabel: "Learn More" },
    facts,
    template: "REVIEW",
  });
  return { page, document: contentDocument(projectContentFields(page, {
    disclosure: AFFILIATE_DISCLOSURE_TEXT,
    footer: TRUST_EDITORIAL.paragraphs[0],
    pricing: [],
    shipping: "",
  })) };
}

function replay(label: string) {
  const facts = storedFacts(label);
  const beforeFacts = JSON.stringify(facts);
  const plan = JSON.stringify(planPresentation(facts, analyzeProductProfile(facts)));
  const { page, document } = contentFor(facts);
  const pageJson = JSON.stringify(page);
  const documentJson = JSON.stringify(document);
  const grounding = JSON.stringify(validateGrounding(facts.description || facts.productName || "Body", facts));
  const policy = JSON.stringify(lintCampaign(campaignFrom(facts)).findings.map((item) => [item.ruleId, item.status]));
  const idle = presentMedia(page, NO_PRESELL_RENDER_ASSETS, []);
  const slots = buildMediaSlots(mediaSeedsFor(page, NO_PRESELL_RENDER_ASSETS));
  const resolved = resolveMedia({ content: document, slots, assignments: [] });
  const hero = slots.find((slot) => slot.id === "heroImage");
  const replaced = presentMedia(page, NO_PRESELL_RENDER_ASSETS, hero ? [{
    slotId: "heroImage",
    removed: false,
    reason: "replace",
    fields: { ...hero.generated, src: "https://cdn.example.test/pack.png", alt: "Pack photo", origin: "uploaded", source: "https://cdn.example.test/pack.png" },
  }] : []);
  assert(JSON.stringify(facts) === beforeFacts, `${label}: ProductFacts stay unchanged`);
  assert(JSON.stringify(planPresentation(facts, analyzeProductProfile(facts))) === plan, `${label}: presentation plan stays unchanged`);
  assert(JSON.stringify(page) === pageJson, `${label}: generated page stays unchanged`);
  assert(idle.page === page && idle.assets === NO_PRESELL_RENDER_ASSETS, `${label}: no media overrides leave the generated page object in place`);
  assert(JSON.stringify(resolved.document.sections) === JSON.stringify(document.sections), `${label}: no media overrides leave the generated sections identical`);
  assert(JSON.stringify(document) === documentJson, `${label}: content document stays unchanged`);
  assert(replaced.page.hero.headline === page.hero.headline, `${label}: a media override leaves the generated headline`);
  assert(replaced.page.hero.image.src === "https://cdn.example.test/pack.png", `${label}: a media override changes the effective hero image`);
  assert(JSON.stringify(replaced.page.sections) === JSON.stringify(page.sections), `${label}: a media override leaves the content sections unchanged`);
  assert(JSON.stringify(validateGrounding(facts.description || facts.productName || "Body", facts)) === grounding, `${label}: grounding stays unchanged`);
  assert(JSON.stringify(lintCampaign(campaignFrom(facts)).findings.map((item) => [item.ruleId, item.status])) === policy, `${label}: policy stays unchanged`);
}

async function main() {
  const slots = buildMediaSlots();
  assert(slots.length === 13, "every supported media role has a slot");
  const idle = resolveMedia({ slots, assignments: [] });
  assert(idle.document.assets.every((asset, index) => asset.src === slots[index]?.generated.src), "an empty override set keeps the generated assets");
  assert(idle.warnings.some((warning) => warning.code === "missing-asset"), "a missing generated asset warns");

  const hero = slots.find((slot) => slot.id === "heroImage");
  if (!hero) throw new Error("missing hero slot");
  const live = previewAssignments(slots, [], {
    heroImage: { fields: { src: "https://cdn.example.test/hero.webp", alt: "Bottle", origin: "imported", source: "https://cdn.example.test/hero.webp" } },
  });
  const liveResolved = resolveMedia({ slots, assignments: live });
  assert(liveResolved.slots.find((slot) => slot.slot.id === "heroImage")?.effective.src.endsWith("hero.webp"), "a draft updates the effective asset immediately");
  const broken = resolveMedia({
    slots,
    assignments: [{ slotId: "heroImage", removed: false, reason: "replace", fields: { ...hero.generated, src: "javascript:alert(1)", alt: "" } }],
  });
  const brokenHero = broken.slots.find((slot) => slot.slot.id === "heroImage");
  assert(brokenHero?.effective.src === "javascript:alert(1)", "a broken URL still stays on the assignment");
  assert(brokenHero?.warnings.some((warning) => warning.code === "broken-url") === true, "a broken URL warns");
  assert(presentationSrc("javascript:alert(1)") === "", "an unsafe URL is not used as the presentation address");
  assert(mediaWarnings("heroImage", { ...emptyMediaFields("heroImage"), src: "https://cdn.example.test/huge.bmp", alt: "Huge" }, []).some((warning) => warning.code === "unsupported-format"), "an unsupported format warns");
  const duplicate = resolveMedia({
    slots,
    assignments: [
      { slotId: "heroImage", removed: false, reason: "replace", fields: { ...hero.generated, src: "https://cdn.example.test/same.png", alt: "Same" } },
      { slotId: "footerLogo", removed: false, reason: "replace", fields: { ...emptyMediaFields("footerLogo"), src: "https://cdn.example.test/same.png", alt: "Same" } },
    ],
  });
  assert(duplicate.warnings.filter((warning) => warning.code === "duplicate-assignment").length === 2, "a repeated assignment warns on each slot");
  const faded = resolveMedia({
    slots,
    assignments: [{ slotId: "heroImage", removed: false, reason: "replace", fields: { ...hero.generated, src: "https://cdn.example.test/quiet.png", alt: "", bytes: 2_000_000, width: 8 } }],
  });
  assert(faded.slots.find((slot) => slot.slot.id === "heroImage")?.effective.src.endsWith("quiet.png"), "accessibility and size warnings do not remove the asset");
  assert(faded.warnings.some((warning) => warning.code === "missing-alt"), "missing alt text warns");
  assert(faded.warnings.some((warning) => warning.code === "large-image"), "a large image warns");
  assert(faded.warnings.some((warning) => warning.code === "image-dimensions"), "small dimensions warn");

  const { resetDbForTests } = await import("../src/lib/db.ts");
  resetDbForTests();
  const store = await import("../src/lib/lp-builder/media-store.ts");
  const fields = { ...emptyMediaFields("heroImage"), name: "Pack", src: "https://cdn.example.test/pack.png", alt: "Pack", origin: "uploaded" as const, source: "upload" };
  store.saveMediaLibraryItem({ campaignId: 4, libraryId: "library-pack", fields, actor: "admin", at: "2026-09-29T00:00:00.000Z", reason: "duplicate" });
  store.saveMediaOverride({ campaignId: 4, slotId: "heroImage", libraryId: "library-pack", removed: false, reason: "replace", fields, actor: "admin", at: "2026-09-29T00:00:01.000Z", originalAsset: "" });
  store.saveMediaOverride({ campaignId: 4, slotId: "ingredientImage.0", removed: false, reason: "replace", fields: { ...emptyMediaFields("ingredientImage"), src: "https://cdn.example.test/leaf.png", alt: "Leaf" }, actor: "admin", at: "2026-09-29T00:00:02.000Z", originalAsset: "" });
  assert(store.listMediaLibrary(4).length === 1, "a saved asset is stored in the library");
  assert(store.listMediaOverrides(4).length === 2, "slot overrides are stored");
  store.deleteMediaOverrides({ campaignId: 4, slotIds: ["heroImage"], actor: "admin", at: "2026-09-29T00:00:03.000Z", reason: "restore-generated" });
  assert(store.listMediaOverrides(4).every((row) => row.slotId !== "heroImage"), "reset asset removes that slot");
  store.deleteMediaOverrides({ campaignId: 4, slotIds: ["ingredientImage.0"], actor: "admin", at: "2026-09-29T00:00:04.000Z", reason: "reset-section" });
  assert(store.listMediaOverrides(4).length === 0, "reset section removes the section slots");
  store.saveMediaOverride({ campaignId: 4, slotId: "closingHero", removed: false, reason: "replace", fields: { ...emptyMediaFields("closingHero"), src: "https://cdn.example.test/close.png", alt: "Close" }, actor: "admin", at: "2026-09-29T00:00:05.000Z", originalAsset: "generated" });
  store.deleteMediaOverrides({ campaignId: 4, actor: "admin", at: "2026-09-29T00:00:06.000Z", reason: "reset-all" });
  assert(store.listMediaOverrides(4).length === 0, "reset all media clears the campaign");
  const audit = store.listMediaAudit(4);
  assert(audit.some((row) => row.reason === "reset-all" && row.originalAsset === "https://cdn.example.test/close.png" && row.replacementAsset === null), "reset writes the original asset and an empty replacement");
  assert(audit.some((row) => row.createdBy === "admin" && row.version >= 1), "audit records the actor and version");

  const moduleSource = readFileSync(path.join(process.cwd(), "src/lib/lp-builder/media.ts"), "utf8");
  assert(!/visiflora|prime biome|neuro serge|joint genesis|prodentim|audifort/i.test(moduleSource), "the media engine has no product names");
  assert(!/anthropic|openai|product-facts|presentation-plan|grounding-validator|policy-linter|publication|analytics-store|lp-builder\/content|lp-builder\/theme/i.test(moduleSource), "the media engine does not call facts, content, theme, presentation, grounding, policy, publication, or tracking");
  const publicPage = readFileSync(path.join(process.cwd(), "src/app/p/[slug]/page.tsx"), "utf8");
  assert(publicPage.includes("isReleasePublication") && publicPage.includes("recordVisit"), "publication approval and visit tracking stay on the public page");

  for (const label of ["VisiFlora", "Joint Genesis", "Prime Biome", "Neuro Serge", "Prodentim", "Audifort", "Unknown Product"]) replay(label);
  console.log("LP_BUILDER_MEDIA_MANAGER_TESTS=PASS");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
