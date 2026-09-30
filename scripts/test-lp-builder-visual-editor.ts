// npx tsx scripts/test-lp-builder-visual-editor.ts
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
import { contentDocument, projectContentFields } from "../src/lib/lp-builder/content.ts";
import { AFFILIATE_DISCLOSURE_TEXT, TRUST_EDITORIAL } from "../src/lib/public-site.ts";
import {
  GENERATED_VISUAL_THEME,
  accessibilityWarnings,
  contrastRatio,
  previewThemeTokens,
  readThemeToken,
  resolveVisualTheme,
  validateThemeTarget,
  validateThemeValue,
} from "../src/lib/lp-builder/theme.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FALHOU: ${message}`);
  console.log(`OK: ${message}`);
}

const dbFile = path.join(os.tmpdir(), `lp-theme-${Date.now()}.db`);
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
    slug: "lp-visual",
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
  return contentDocument(projectContentFields(page, {
    disclosure: AFFILIATE_DISCLOSURE_TEXT,
    footer: TRUST_EDITORIAL.paragraphs[0],
    pricing: [],
    shipping: "",
  }));
}

function replay(label: string) {
  const facts = storedFacts(label);
  const beforeFacts = JSON.stringify(facts);
  const plan = JSON.stringify(planPresentation(facts, analyzeProductProfile(facts)));
  const content = contentFor(facts);
  const contentJson = JSON.stringify(content);
  const grounding = JSON.stringify(validateGrounding(facts.description || facts.productName || "Body", facts));
  const policy = JSON.stringify(lintCampaign(campaignFrom(facts)).findings.map((item) => [item.ruleId, item.status]));
  const idle = resolveVisualTheme({ content, tokens: [] });
  const edited = resolveVisualTheme({
    content,
    tokens: [{ scope: "theme", targetId: "theme", token: "colors.primary", value: "#112233" }],
  });
  assert(JSON.stringify(facts) === beforeFacts, `${label}: ProductFacts stay unchanged`);
  assert(JSON.stringify(planPresentation(facts, analyzeProductProfile(facts))) === plan, `${label}: presentation plan stays unchanged`);
  assert(JSON.stringify(content) === contentJson, `${label}: generated content stays unchanged`);
  assert(JSON.stringify(idle.document.sections) === JSON.stringify(content.sections), `${label}: no visual overrides leave the generated sections identical`);
  assert(JSON.stringify(idle.document) === JSON.stringify(content), `${label}: no visual overrides leave the generated LP identical`);
  assert(JSON.stringify(edited.document.sections) === JSON.stringify(content.sections), `${label}: a theme override leaves the content sections unchanged`);
  assert(edited.document.theme.colors.primary === "#112233", `${label}: a theme override changes the effective theme`);
  assert(JSON.stringify(validateGrounding(facts.description || facts.productName || "Body", facts)) === grounding, `${label}: grounding stays unchanged`);
  assert(JSON.stringify(lintCampaign(campaignFrom(facts)).findings.map((item) => [item.ruleId, item.status])) === policy, `${label}: policy stays unchanged`);
}

async function main() {
  assert(readThemeToken(GENERATED_VISUAL_THEME, "colors.primary") === "#111827", "the generated theme has a primary color");
  const idle = resolveVisualTheme({ tokens: [] });
  assert(JSON.stringify(idle.theme) === JSON.stringify(GENERATED_VISUAL_THEME), "an empty override set returns the generated theme");
  assert(idle.sections.hero.colors.primary === GENERATED_VISUAL_THEME.colors.primary, "sections inherit the generated theme");
  assert(idle.components["hero/heading"]?.colors.primary === GENERATED_VISUAL_THEME.colors.primary, "components inherit the section theme");

  const themed = resolveVisualTheme({
    tokens: [
      { scope: "theme", targetId: "theme", token: "colors.primary", value: "#112233" },
      { scope: "section", targetId: "hero", token: "colors.surface", value: "#eef2ff" },
      { scope: "component", targetId: "hero/heading", token: "typography.headingSize", value: "3rem" },
    ],
  });
  assert(themed.theme.colors.primary === "#112233", "a theme override replaces the primary color");
  assert(themed.theme.colors.background === GENERATED_VISUAL_THEME.colors.background, "a theme override leaves the other colors");
  assert(themed.sections.hero.colors.surface === "#eef2ff", "a section override replaces the hero surface");
  assert(themed.sections.features.colors.surface === GENERATED_VISUAL_THEME.colors.surface, "other sections keep the theme surface");
  assert(themed.sections.hero.colors.primary === "#112233", "a section inherits the overridden theme color");
  assert(themed.components["hero/heading"]?.typography.headingSize === "3rem", "a component override replaces the heading size");
  assert(themed.components["hero/body"]?.typography.headingSize === GENERATED_VISUAL_THEME.typography.headingSize, "other components keep the inherited heading size");
  assert(themed.document.theme.colors.primary === "#112233", "resolveLandingPage carries the page theme override");

  const live = previewThemeTokens([], { "theme:theme:colors.accent": "#abcdef" });
  const liveTheme = resolveVisualTheme({ tokens: live.tokens });
  assert(live.errors["theme:theme:colors.accent"] === undefined && liveTheme.theme.colors.accent === "#abcdef", "a valid draft updates the effective theme immediately");
  const invalid = previewThemeTokens([], { "theme:theme:colors.primary": "#gg0000" });
  assert(invalid.errors["theme:theme:colors.primary"] === "Invalid color.", "an invalid color is rejected");
  assert(resolveVisualTheme({ tokens: invalid.tokens }).theme.colors.primary === GENERATED_VISUAL_THEME.colors.primary, "an invalid color leaves the generated color in place");
  assert(!validateThemeValue("typography.bodySize", "4rem").ok, "an oversized font is rejected");
  assert(!validateThemeValue("styles.button", "rainbow").ok, "an unknown style is rejected");
  assert(!validateThemeTarget({ scope: "component", targetId: "hero/missing", token: "colors.primary" }).ok, "a missing component is a broken theme reference");
  assert(!validateThemeTarget({ scope: "section", targetId: "not-a-section", token: "colors.primary" }).ok, "an unknown section is a broken theme reference");

  const pale = resolveVisualTheme({ tokens: [{ scope: "theme", targetId: "theme", token: "colors.primary", value: "#ffff00" }] });
  assert(pale.theme.colors.primary === "#ffff00", "a low-contrast color still applies");
  assert(pale.warnings.some((warning) => warning.code === "button-contrast"), "low button contrast warns without blocking");
  assert((contrastRatio("#ffffff", "#000000") ?? 0) > 20, "black and white contrast is measured");
  assert(accessibilityWarnings(GENERATED_VISUAL_THEME, "theme", "theme").length === 0, "the generated theme meets the contrast and size checks");

  const { resetDbForTests } = await import("../src/lib/db.ts");
  resetDbForTests();
  const store = await import("../src/lib/lp-builder/theme-store.ts");
  store.saveThemeToken({ campaignId: 4, scope: "theme", targetId: "theme", token: "colors.primary", value: "#112233", actor: "admin", at: "2026-09-29T00:00:00.000Z" });
  store.saveThemeToken({ campaignId: 4, scope: "section", targetId: "hero", token: "colors.surface", value: "#eef2ff", actor: "admin", at: "2026-09-29T00:00:01.000Z" });
  store.saveThemeToken({ campaignId: 4, scope: "component", targetId: "hero/heading", token: "typography.headingSize", value: "3rem", actor: "admin", at: "2026-09-29T00:00:02.000Z" });
  assert(store.listThemeOverrides(4).length === 3, "theme, section, and component overrides are stored");
  store.deleteThemeTokens({ campaignId: 4, scope: "component", targetId: "hero/heading", actor: "admin", at: "2026-09-29T00:00:03.000Z" });
  assert(store.listThemeOverrides(4).every((row) => row.scope !== "component"), "reset component removes that component");
  store.deleteThemeTokens({ campaignId: 4, scope: "section", targetId: "hero", actor: "admin", at: "2026-09-29T00:00:04.000Z" });
  assert(store.listThemeOverrides(4).every((row) => row.scope !== "section"), "reset section removes that section");
  store.deleteThemeTokens({ campaignId: 4, scope: "theme", targetId: "theme", actor: "admin", at: "2026-09-29T00:00:05.000Z" });
  assert(store.listThemeOverrides(4).length === 0, "reset theme removes the page theme");
  store.saveThemeToken({ campaignId: 4, scope: "theme", targetId: "theme", token: "radii.button", value: "1rem", actor: "admin", at: "2026-09-29T00:00:06.000Z" });
  store.deleteThemeTokens({ campaignId: 4, actor: "admin", at: "2026-09-29T00:00:07.000Z" });
  assert(store.listThemeOverrides(4).length === 0, "reset all visual overrides clears the campaign");
  const audit = store.listThemeAudit(4);
  assert(audit.some((row) => row.newValue === null && row.previousValue === "1rem"), "reset writes the previous value and an empty new value");

  const moduleSource = readFileSync(path.join(process.cwd(), "src/lib/lp-builder/theme.ts"), "utf8");
  assert(!/visiflora|prime biome|neuro serge|joint genesis|prodentim|audifort/i.test(moduleSource), "the theme engine has no product names");
  assert(!/anthropic|openai|product-facts|presentation-plan|grounding-validator|policy-linter|publication|analytics-store|lp-builder\/content/i.test(moduleSource), "the theme engine does not call facts, content, presentation, grounding, policy, publication, or tracking");
  const publicPage = readFileSync(path.join(process.cwd(), "src/app/p/[slug]/page.tsx"), "utf8");
  assert(publicPage.includes("isReleasePublication") && publicPage.includes("recordVisit"), "publication approval and visit tracking stay on the public page");
  assert(publicPage.includes("<ThemeFrame"), "the public page applies a saved theme around the generated page");

  for (const label of ["VisiFlora", "Joint Genesis", "Prime Biome", "Neuro Serge", "Prodentim", "Audifort", "Unknown Product"]) replay(label);
  console.log("LP_BUILDER_VISUAL_EDITOR_TESTS=PASS");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
