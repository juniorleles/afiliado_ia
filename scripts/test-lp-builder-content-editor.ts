// npx tsx scripts/test-lp-builder-content-editor.ts
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { analyzeProductProfile } from "../src/lib/product-profile.ts";
import { planPresentation } from "../src/lib/presentation-plan.ts";
import { composePresellPage, type PresellPage } from "../src/lib/presell-page.ts";
import { validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import { lintCampaign } from "../src/lib/policy-linter.ts";
import { emptyProductFacts, type ProductFacts } from "../src/lib/product-facts.ts";
import { VALIDATION_SAFE_AFFILIATE } from "../src/lib/validation/constants.ts";
import { AFFILIATE_DISCLOSURE_TEXT, TRUST_EDITORIAL } from "../src/lib/public-site.ts";
import {
  applyEffectiveContent,
  brokenUrls,
  contentDocument,
  contentHasUnsafeHtml,
  effectiveTextMap,
  projectContentFields,
  resolveContentFields,
  sanitizeRichText,
  validateContentChange,
  type ContentContext,
  type ContentField,
} from "../src/lib/lp-builder/content.ts";
import { resolveLandingPage } from "../src/lib/lp-builder/resolve.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FALHOU: ${message}`);
  console.log(`OK: ${message}`);
}

const dbFile = path.join(os.tmpdir(), `lp-builder-editor-${Date.now()}.db`);
process.env.PRESELL_OS_DB = dbFile;

const CONTEXT: ContentContext = {
  disclosure: AFFILIATE_DISCLOSURE_TEXT,
  footer: TRUST_EDITORIAL.paragraphs[0],
  pricing: [{ title: "Standard plan", description: "" }],
  shipping: "Ships in 3 days",
};

function samplePage(): PresellPage {
  return {
    version: 1,
    template: "REVIEW",
    hero: {
      badge: "Review",
      headline: "Generated headline",
      subheadline: "Generated subheadline",
      summary: "Generated summary",
      highlights: [],
      image: { src: "", alt: "", provenance: "NOT_FOUND" },
    },
    sections: [
      { id: "features", title: "Features", visible: true, paragraphs: [], bullets: [], cards: [{ title: "Soft grip", body: "A matte handle." }, { title: "Steel body", body: "Brushed steel." }], faq: [] },
      { id: "ingredients", title: "Ingredients", visible: true, paragraphs: [], bullets: [], cards: [{ title: "Example leaf", body: "Dried leaf." }], faq: [] },
      { id: "faq", title: "Questions", visible: true, paragraphs: [], bullets: [], cards: [], faq: [{ question: "How is it used?", answer: "Once a day." }, { question: "Where is it made?", answer: "In a workshop." }] },
      { id: "guarantee", title: "Guarantee", visible: true, paragraphs: ["Thirty days to decide."], bullets: [], cards: [], faq: [] },
      { id: "considerations", title: "Notes", visible: true, paragraphs: ["Keep away from heat."], bullets: [], cards: [], faq: [] },
      { id: "overview", title: "Overview", visible: true, paragraphs: ["A short overview."], bullets: [], cards: [], faq: [] },
    ],
    ctaLabel: "View details",
    omitted: [],
    guaranteeDaysDisplay: null,
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
    slug: "lp-builder-content",
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
  const composed = composePresellPage({
    variant: { headline: facts.productName || "Headline", body: facts.description || facts.productName || "Body", ctaLabel: "Learn More" },
    facts,
    template: "REVIEW",
  });
  const composedJson = JSON.stringify(composed);
  const grounding = JSON.stringify(validateGrounding(facts.description || facts.productName || "Body", facts));
  const policy = JSON.stringify(lintCampaign(campaignFrom(facts)).findings.map((item) => [item.ruleId, item.status]));
  const fields = projectContentFields(composed, { disclosure: AFFILIATE_DISCLOSURE_TEXT, footer: TRUST_EDITORIAL.paragraphs[0], pricing: [], shipping: "" });
  const generated = contentDocument(fields);
  const generatedJson = JSON.stringify(generated);
  const effective = resolveLandingPage(generated, {});
  const resolved = resolveContentFields(fields, []);
  const applied = applyEffectiveContent(composed, resolved);
  assert(JSON.stringify(facts) === beforeFacts, `${label}: ProductFacts stay unchanged`);
  assert(JSON.stringify(planPresentation(facts, analyzeProductProfile(facts))) === plan, `${label}: presentation plan stays unchanged`);
  assert(JSON.stringify(composed) === composedJson, `${label}: generated page stays unchanged`);
  assert(applied === composed, `${label}: no overrides leave the generated page reference untouched`);
  assert(JSON.stringify(validateGrounding(facts.description || facts.productName || "Body", facts)) === grounding, `${label}: grounding stays unchanged`);
  assert(JSON.stringify(lintCampaign(campaignFrom(facts)).findings.map((item) => [item.ruleId, item.status])) === policy, `${label}: policy stays unchanged`);
  assert(JSON.stringify(effective) === generatedJson, `${label}: empty overrides leave the effective LP identical`);
}

function readDir(relative: string): string {
  const dir = path.join(process.cwd(), relative);
  return readdirSync(dir).filter((name) => name.endsWith(".ts")).map((name) => readFileSync(path.join(dir, name), "utf8")).join("\n");
}

async function main() {
  const page = samplePage();
  const snapshot = JSON.stringify(page);
  const fields = projectContentFields(page, CONTEXT);
  assert(fields.some((item) => item.id === "hero.headline" && item.generated === "Generated headline"), "headline is projected from the generated page");
  assert(fields.some((item) => item.id === "hero.cta" && item.generated === "View details"), "hero CTA is projected");
  assert(fields.some((item) => item.id === "closing.cta" && item.generated === "View details"), "closing CTA is projected");
  assert(fields.some((item) => item.id === "features.item.0.title" && item.generated === "Soft grip"), "feature titles are projected");
  assert(fields.some((item) => item.id === "faq.item.0.question"), "FAQ questions are projected");
  assert(fields.some((item) => item.label === "Disclosure"), "disclosure is editable");
  assert(fields.some((item) => item.id === "nav.overview"), "navigation labels are editable");

  const untouched = resolveContentFields(fields, []);
  assert(untouched.every((item) => item.effective === item.generated && !item.modified), "effective text matches generated text when no override is stored");
  assert(applyEffectiveContent(page, untouched) === page, "applying an empty override set does not clone the page");
  assert(JSON.stringify(page) === snapshot, "projection does not mutate the generated page");

  const headline = fields.find((item) => item.id === "hero.headline") as ContentField;
  const edited = resolveContentFields(fields, [{
    fieldId: "hero.headline",
    value: "Updated headline",
    createdAt: "2026-09-29T00:00:00.000Z",
    updatedAt: "2026-09-29T00:00:00.000Z",
    createdBy: "admin",
    updatedBy: "admin",
    version: 1,
  }]);
  const texts = effectiveTextMap(fields, [{
    fieldId: "hero.headline",
    value: "Updated headline",
    createdAt: "2026-09-29T00:00:00.000Z",
    updatedAt: "2026-09-29T00:00:00.000Z",
    createdBy: "admin",
    updatedBy: "admin",
    version: 1,
  }]);
  assert(texts.get("hero.headline") === "Updated headline", "resolveLandingPage supplies the effective headline");
  assert(texts.get("hero.subheadline") === "Generated subheadline", "one override leaves the other generated fields");
  const applied = applyEffectiveContent(page, edited);
  assert(applied !== page && applied.hero.headline === "Updated headline", "the effective page shows the override");
  assert(applied.hero.subheadline === "Generated subheadline" && applied.ctaLabel === "View details", "the override does not rewrite neighboring fields");
  assert(page.hero.headline === "Generated headline", "the generated page remains the source");
  assert(!("builderContent" in page), "the generated page does not gain builder content");
  void headline;

  const safe = validateContentChange(untouched, "hero.headline", "<b>Updated headline</b>");
  assert(safe.ok && safe.value === "Updated headline", "rich text is sanitized to plain text");
  assert(!validateContentChange(untouched, "hero.headline", "   ").ok, "empty values are rejected");
  assert(!validateContentChange(untouched, "hero.headline", "x".repeat(181)).ok, "maximum length is enforced");
  assert(!validateContentChange(untouched, "hero.subheadline", "Read https://").ok, "broken URLs are rejected");
  assert(!validateContentChange(untouched, "hero.subheadline", "Read https://example").ok, "a host without a domain is rejected");
  assert(brokenUrls("See https://example.com/details").length === 0, "a complete http URL is accepted");
  assert(contentHasUnsafeHtml("<script>alert(1)</script>"), "script markup is unsafe HTML");
  assert(!validateContentChange(untouched, "footer.body", "<script>alert(1)</script>").ok, "unsafe HTML is rejected");
  assert(!validateContentChange(untouched, "hero.cta", "https://example.com").ok, "a URL is an invalid CTA");
  assert(validateContentChange(untouched, "hero.cta", "Continue").ok, "a plain CTA label is valid");
  assert(sanitizeRichText("  <em>Hello</em>  ") === "Hello", "sanitize strips tags and trims");
  const duplicateFeature = validateContentChange(untouched, "features.item.1.title", "Soft grip");
  assert(!duplicateFeature.ok && duplicateFeature.error === "Duplicate feature.", "duplicate feature titles are rejected");
  const duplicateFaq = validateContentChange(untouched, "faq.item.1.question", "How is it used?");
  assert(!duplicateFaq.ok && duplicateFaq.error === "Duplicate FAQ.", "duplicate FAQ questions are rejected");

  const { resetDbForTests } = await import("../src/lib/db.ts");
  resetDbForTests();
  const store = await import("../src/lib/lp-builder/store.ts");
  const saved = store.saveBuilderOverride({
    campaignId: 1,
    fieldId: "hero.headline",
    sectionId: "hero",
    value: "Updated headline",
    previousValue: "Generated headline",
    actor: "admin",
    at: "2026-09-29T00:00:00.000Z",
  });
  assert(saved.version === 1 && saved.createdBy === "admin" && saved.updatedBy === "admin", "the first save records the actor and version");
  const again = store.saveBuilderOverride({
    campaignId: 1,
    fieldId: "hero.headline",
    sectionId: "hero",
    value: "Second headline",
    previousValue: "Updated headline",
    actor: "admin",
    at: "2026-09-29T01:00:00.000Z",
  });
  assert(again.version === 2 && again.createdAt === saved.createdAt && again.updatedAt === "2026-09-29T01:00:00.000Z", "a later save keeps created-at and increments version");
  const audit = store.listBuilderAudit(1);
  assert(audit[0]?.previousValue === "Updated headline" && audit[0]?.newValue === "Second headline" && audit[0]?.sectionId === "hero", "audit stores previous value, new value, field, and section");
  store.resetBuilderOverride({ campaignId: 1, fieldId: "hero.headline", actor: "admin", at: "2026-09-29T02:00:00.000Z" });
  assert(store.listBuilderOverrides(1).length === 0, "reset removes the override");
  const resetAudit = store.listBuilderAudit(1)[0];
  assert(resetAudit?.newValue === null && resetAudit?.previousValue === "Second headline" && resetAudit.version === 3, "reset writes an audit row back to the generated value");

  const moduleSource = readDir("src/lib/lp-builder");
  assert(!/visiflora|prime biome|neuro serge|joint genesis|prodentim|audifort/i.test(moduleSource), "the builder has no product names");
  assert(!/anthropic|openai|product-facts|presentation-plan|grounding-validator|policy-linter|publication|analytics-store/i.test(moduleSource), "the builder does not call facts, presentation, grounding, policy, publication, or tracking");

  for (const label of ["VisiFlora", "Joint Genesis", "Prime Biome", "Neuro Serge", "Prodentim", "Audifort", "Unknown Product"]) replay(label);

  console.log("LP_BUILDER_CONTENT_EDITOR_TESTS=PASS");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
