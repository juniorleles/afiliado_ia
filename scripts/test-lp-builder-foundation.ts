// npx tsx scripts/test-lp-builder-foundation.ts
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { analyzeProductProfile } from "../src/lib/product-profile.ts";
import { planPresentation } from "../src/lib/presentation-plan.ts";
import { composePresellPage } from "../src/lib/presell-page.ts";
import { validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import { lintCampaign } from "../src/lib/policy-linter.ts";
import { emptyProductFacts, type ProductFacts } from "../src/lib/product-facts.ts";
import { VALIDATION_SAFE_AFFILIATE } from "../src/lib/validation/constants.ts";
import {
  LP_SECTION_TARGETS,
  createOverrideAudit,
  resolveLandingPage,
  type LandingPageDocument,
  type LandingPageOverride,
  type LpSectionTarget,
} from "../src/lib/lp-builder/index.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FALHOU: ${message}`);
  console.log(`OK: ${message}`);
}

const AUDIT = createOverrideAudit({ actor: "operator", at: "2026-09-29T00:00:00.000Z", version: 1 });

function component(id: string, role: LandingPageDocument["sections"][number]["components"][number]["role"], text: string, assetId: string | null = null) {
  return { id, role, text, items: role === "list" ? [{ id: `${id}-item`, text }] : [], assetId, visible: true };
}

function section(target: LpSectionTarget, heading: string, components: LandingPageDocument["sections"][number]["components"]): LandingPageDocument["sections"][number] {
  return { id: target, target, heading, visible: true, components };
}

function samplePage(): LandingPageDocument {
  return {
    sections: [
      section("hero", "Hero", [component("hero-headline", "headline", "Generated headline"), component("hero-image", "image", "", "hero-photo")]),
      section("cta", "Offer", [component("cta-button", "button", "View details")]),
      section("features", "Features", [component("features-list", "list", "Generated feature")]),
      section("ingredients", "Ingredients", [component("ingredients-list", "list", "Generated ingredient")]),
      section("faq", "FAQ", [component("faq-list", "list", "Generated question")]),
      section("pricing", "Pricing", [component("pricing-text", "text", "Generated price")]),
      section("guarantee", "Guarantee", [component("guarantee-text", "text", "Generated guarantee")]),
      section("warnings", "Warnings", [component("warnings-text", "text", "Generated warning")]),
      section("shipping", "Shipping", [component("shipping-text", "text", "Generated shipping")]),
      section("returns", "Returns", [component("returns-text", "text", "Generated returns")]),
      section("manufacturer", "Manufacturer", [component("manufacturer-text", "text", "Generated manufacturer")]),
      section("footer", "Footer", [component("footer-text", "text", "Generated footer")]),
    ],
    theme: {
      colors: { canvas: "#ffffff", ink: "#111111", action: "#2255aa" },
      typography: { body: "serif", heading: "sans" },
      spacing: { section: "32px", block: "16px" },
    },
    assets: [{ id: "hero-photo", src: "/generated/hero.jpg", alt: "Generated photograph" }],
    layout: { width: "720px", alignment: "start" },
  };
}

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
    slug: "lp-builder-foundation",
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

function replay(label: string) {
  const facts = storedFacts(label);
  const beforeFacts = JSON.stringify(facts);
  const plan = JSON.stringify(planPresentation(facts, analyzeProductProfile(facts)));
  const composed = JSON.stringify(
    composePresellPage({
      variant: { headline: facts.productName || "Headline", body: facts.description || facts.productName || "Body", ctaLabel: "Learn More" },
      facts,
      template: "REVIEW",
    }),
  );
  const grounding = JSON.stringify(validateGrounding(facts.description || facts.productName || "Body", facts));
  const policy = JSON.stringify(lintCampaign(campaignFrom(facts)).findings.map((item) => [item.ruleId, item.status]));
  const generated = samplePage();
  const generatedJson = JSON.stringify(generated);
  const effective = resolveLandingPage(generated, {});
  assert(JSON.stringify(facts) === beforeFacts, `${label}: ProductFacts stay unchanged`);
  assert(JSON.stringify(planPresentation(facts, analyzeProductProfile(facts))) === plan, `${label}: presentation plan stays unchanged`);
  assert(
    JSON.stringify(
      composePresellPage({
        variant: { headline: facts.productName || "Headline", body: facts.description || facts.productName || "Body", ctaLabel: "Learn More" },
        facts,
        template: "REVIEW",
      }),
    ) === composed,
    `${label}: generated page rendering stays unchanged`,
  );
  assert(JSON.stringify(validateGrounding(facts.description || facts.productName || "Body", facts)) === grounding, `${label}: grounding stays unchanged`);
  assert(JSON.stringify(lintCampaign(campaignFrom(facts)).findings.map((item) => [item.ruleId, item.status])) === policy, `${label}: policy stays unchanged`);
  assert(JSON.stringify(effective) === generatedJson, `${label}: empty overrides leave the generated LP identical`);
  assert(JSON.stringify(generated) === generatedJson, `${label}: resolution does not mutate the generated LP`);
}

function readModule(relative: string): string {
  return readFileSync(path.join(process.cwd(), relative), "utf8");
}

async function main() {
  assert(AUDIT.createdAt === AUDIT.updatedAt && AUDIT.createdBy === "operator" && AUDIT.updatedBy === "operator" && AUDIT.version === 1, "audit records actor, time, and version");
  assert(LP_SECTION_TARGETS.length === 12, "section targets cover the editable page regions");

  const generated = samplePage();
  const snapshot = JSON.stringify(generated);
  assert(JSON.stringify(resolveLandingPage(generated)) === snapshot, "a missing override set returns the generated page");
  assert(JSON.stringify(resolveLandingPage(generated, { sections: [], components: [], assets: [], visibility: [] })) === snapshot, "empty override collections are a no-op");
  assert(JSON.stringify(resolveLandingPage(generated, { theme: { ...AUDIT }, layout: { ...AUDIT }, order: { ...AUDIT, sectionIds: [] } })) === snapshot, "audit-only overrides do not change content");
  assert(JSON.stringify(generated) === snapshot, "resolution never writes back into the generated page");

  const hidden: LandingPageOverride = { visibility: [{ ...AUDIT, sectionId: "pricing", visible: false }] };
  const hiddenPage = resolveLandingPage(generated, hidden);
  assert(hiddenPage.sections.find((item) => item.id === "pricing")?.visible === false, "visibility override hides the chosen section");
  assert(hiddenPage.sections.find((item) => item.id === "features")?.visible === true, "visibility override leaves other sections visible");
  assert(JSON.stringify(generated) === snapshot, "visibility override leaves the generated page stored as-is");

  const ordered = resolveLandingPage(generated, { order: { ...AUDIT, sectionIds: ["faq", "features", "missing"] } });
  assert(ordered.sections.slice(0, 2).map((item) => item.id).join(",") === "faq,features", "order override places listed sections first");
  assert(ordered.sections.map((item) => item.id).includes("hero"), "order override keeps sections that were not listed");
  assert(ordered.sections.length === generated.sections.length, "order override does not drop or duplicate sections");

  const edited = resolveLandingPage(generated, {
    sections: [{ ...AUDIT, sectionId: "hero", heading: "Updated hero" }],
    components: [{ ...AUDIT, componentId: "cta-button", text: "Continue" }],
    assets: [{ ...AUDIT, assetId: "hero-photo", src: "/override/hero.jpg", alt: "Updated photograph" }],
    theme: { ...AUDIT, colors: { action: "#333333" }, typography: { body: "sans" }, spacing: { section: "48px" } },
    layout: { ...AUDIT, width: "960px" },
  });
  assert(edited.sections.find((item) => item.id === "hero")?.heading === "Updated hero", "section override replaces the heading");
  assert(edited.sections.find((item) => item.id === "cta")?.components[0]?.text === "Continue", "component override replaces button text");
  assert(edited.sections.find((item) => item.id === "features")?.components[0]?.text === "Generated feature", "component override leaves other copy");
  assert(edited.assets[0]?.src === "/override/hero.jpg" && edited.assets[0]?.alt === "Updated photograph", "asset override replaces the image source and alt");
  assert(edited.theme.colors.action === "#333333" && edited.theme.colors.canvas === "#ffffff", "theme override merges colors and keeps the rest");
  assert(edited.theme.typography.body === "sans" && edited.theme.typography.heading === "sans", "theme override merges typography");
  assert(edited.theme.spacing.section === "48px" && edited.theme.spacing.block === "16px", "theme override merges spacing");
  assert(edited.layout.width === "960px" && edited.layout.alignment === "start", "layout override replaces only the provided field");
  assert(JSON.stringify(generated) === snapshot, "content overrides leave the generated page stored as-is");

  const moduleSource = ["src/lib/lp-builder/types.ts", "src/lib/lp-builder/resolve.ts", "src/lib/lp-builder/index.ts"].map(readModule).join("\n");
  assert(!/visiflora|prime biome|neuro serge|joint genesis|prodentim|audifort|advanced amino/i.test(moduleSource), "the builder has no product names");
  assert(!/anthropic|openai|product-facts|presentation-plan|grounding-validator|policy-linter|publication/i.test(moduleSource), "the builder does not call facts, presentation, grounding, policy, or publication");

  const boundaries = [
    "src/lib/import-product.ts",
    "src/lib/product-facts.ts",
    "src/lib/presentation-plan.ts",
    "src/lib/premium/adaptive-composition.ts",
    "src/lib/completeness-engine.ts",
    "src/lib/lp-quality-predictor.ts",
    "src/lib/ai/grounding-validator.ts",
    "src/lib/policy-linter.ts",
    "src/lib/publication.ts",
    "src/lib/analytics-store.ts",
    "src/lib/presell-page.ts",
    "src/lib/manual-overrides.ts",
    "src/components/presell/presell-page-view.tsx",
  ];
  assert(boundaries.every((file) => !readModule(file).includes("lp-builder")), "existing pipeline modules do not import the builder");

  for (const label of ["VisiFlora", "Joint Genesis", "Prime Biome", "Neuro Serge", "Prodentim", "Audifort"]) replay(label);

  console.log("LP_BUILDER_FOUNDATION_TESTS=PASS");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
