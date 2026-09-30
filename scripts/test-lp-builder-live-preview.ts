// npx tsx scripts/test-lp-builder-live-preview.ts
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { analyzeProductProfile } from "../src/lib/product-profile.ts";
import { planPresentation } from "../src/lib/presentation-plan.ts";
import { composePresellPage, type PresellPage } from "../src/lib/presell-page.ts";
import { validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import { lintCampaign } from "../src/lib/policy-linter.ts";
import { emptyProductFacts, type ProductFacts } from "../src/lib/product-facts.ts";
import { VALIDATION_SAFE_AFFILIATE } from "../src/lib/validation/constants.ts";
import { AFFILIATE_DISCLOSURE_TEXT, TRUST_EDITORIAL } from "../src/lib/public-site.ts";
import { projectContentFields, resolveContentFields, type ContentContext } from "../src/lib/lp-builder/content.ts";
import {
  PREVIEW_VIEWPORT_WIDTH,
  PREVIEW_VIEWPORTS,
  fieldPresence,
  resolveLivePreview,
  type LivePreviewField,
} from "../src/lib/lp-builder/live-preview.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FALHOU: ${message}`);
  console.log(`OK: ${message}`);
}

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
      { id: "faq", title: "Questions", visible: true, paragraphs: [], bullets: [], cards: [], faq: [{ question: "How is it used?", answer: "Once a day." }] },
      { id: "guarantee", title: "Guarantee", visible: true, paragraphs: ["Thirty days to decide."], bullets: [], cards: [], faq: [] },
      { id: "considerations", title: "Notes", visible: true, paragraphs: ["Keep away from heat."], bullets: [], cards: [], faq: [] },
      { id: "overview", title: "Overview", visible: true, paragraphs: ["A short overview."], bullets: [], cards: [], faq: [] },
      { id: "usage", title: "Use", visible: true, paragraphs: ["Use it daily."], bullets: [], cards: [], faq: [] },
    ],
    ctaLabel: "View details",
    omitted: [],
    guaranteeDaysDisplay: null,
  };
}

function asLive(page: PresellPage): LivePreviewField[] {
  return resolveContentFields(projectContentFields(page, CONTEXT), []).map((field) => ({
    id: field.id,
    group: field.group,
    section: field.section,
    label: field.label,
    kind: field.kind,
    generated: field.generated,
    override: null,
    modified: false,
  }));
}

function text(result: ReturnType<typeof resolveLivePreview>, id: string): string {
  return result.document.sections.flatMap((section) => section.components).find((item) => item.id === id)?.text ?? "";
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
    slug: "lp-builder-live-preview",
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
  const fields = asLive(composed);
  const idle = resolveLivePreview({ fields, drafts: {}, view: "effective" });
  const generated = resolveLivePreview({ fields, drafts: {}, view: "generated" });
  const edited = resolveLivePreview({ fields, drafts: { "hero.headline": "Preview headline" }, view: "effective" });
  assert(JSON.stringify(facts) === beforeFacts, `${label}: ProductFacts stay unchanged`);
  assert(JSON.stringify(planPresentation(facts, analyzeProductProfile(facts))) === plan, `${label}: presentation plan stays unchanged`);
  assert(JSON.stringify(composed) === composedJson, `${label}: generated page stays unchanged`);
  assert(JSON.stringify(validateGrounding(facts.description || facts.productName || "Body", facts)) === grounding, `${label}: grounding stays unchanged`);
  assert(JSON.stringify(lintCampaign(campaignFrom(facts)).findings.map((item) => [item.ruleId, item.status])) === policy, `${label}: policy stays unchanged`);
  assert(JSON.stringify(idle.document) === JSON.stringify(generated.document), `${label}: no overrides leave the live preview identical to the generated LP`);
  assert(text(edited, "hero.headline") === "Preview headline", `${label}: a draft updates the live preview immediately`);
  assert(text(edited, "hero.subheadline") === text(idle, "hero.subheadline"), `${label}: the draft leaves the other preview fields`);
  assert(fields.find((field) => field.id === "hero.headline")?.generated !== "Preview headline", `${label}: the generated field is not rewritten`);
}

function main() {
  const page = samplePage();
  const snapshot = JSON.stringify(page);
  const fields = asLive(page);
  const idle = resolveLivePreview({ fields, drafts: {}, view: "effective" });
  assert(JSON.stringify(idle.document) === JSON.stringify(resolveLivePreview({ fields, drafts: {}, view: "generated" }).document), "an empty draft set previews the generated page");
  assert(JSON.stringify(page) === snapshot, "preview resolution does not mutate the generated page");

  const started = performance.now();
  for (let index = 0; index < 30; index += 1) {
    resolveLivePreview({ fields, drafts: { "hero.headline": `Headline ${index}` }, view: "effective" });
  }
  const average = (performance.now() - started) / 30;
  assert(average < 100, `live resolution stays under 100ms (${average.toFixed(2)}ms)`);

  const headline = resolveLivePreview({ fields, drafts: { "hero.headline": "Updated headline" }, view: "effective" });
  assert(text(headline, "hero.headline") === "Updated headline", "the headline draft is in the resolved preview");
  assert(resolveLivePreview({ fields, drafts: { "hero.headline": "Updated headline" }, view: "generated" }).document.sections[0]?.components[0]?.text === "Generated headline", "toggle generated ignores drafts");

  const regions: Array<[string, string]> = [
    ["hero.cta", "Continue"],
    ["features.item.0.title", "Firmer grip"],
    ["features.item.0.description", "A denser handle."],
    ["ingredients.item.0.title", "Dried leaf"],
    ["pricing.item.0.title", "Family plan"],
    ["pricing.cta", "See the plan"],
    ["faq.item.0.question", "When is it used?"],
    ["faq.item.0.answer", "In the morning."],
    ["guarantee.body", "Sixty days to decide."],
    ["returns.body", "Send it back in the original pack."],
    ["shipping.body", "Ships in 5 days."],
    ["warnings.body", "Store it away from heat."],
    ["manufacturer.body", "Packed by a workshop."],
    ["footer.body", "A short footer line."],
    ["footer.disclosure", "Disclosure: this preview is a sample."],
    ["closing.cta", "Read the close"],
    ["section.features.title", "What it includes"],
    ["nav.overview", "Start"],
  ];
  for (const [id, value] of regions) {
    const preview = resolveLivePreview({ fields, drafts: { [id]: value }, view: "effective" });
    assert(text(preview, id) === value, `${id} updates the live preview`);
    assert(text(idle, id) !== value || idle.fields.find((field) => field.id === id)?.generated === value, `${id} leaves the idle preview on the generated text`);
  }

  const invalid = resolveLivePreview({ fields, drafts: { "hero.headline": "<script>alert(1)</script>" }, view: "effective" });
  assert(text(invalid, "hero.headline") === "Generated headline", "an invalid override keeps the preview on the last valid headline");
  assert(invalid.errors["hero.headline"] === "Unsafe HTML.", "an invalid override reports a validation message");
  const empty = resolveLivePreview({ fields, drafts: { "hero.cta": "   " }, view: "effective" });
  assert(text(empty, "hero.cta") === "View details", "an empty CTA does not clear the preview");
  assert(Boolean(empty.errors["hero.cta"]), "an empty CTA reports a validation message");

  const sanitized = resolveLivePreview({ fields, drafts: { "hero.subheadline": "<b>Clearer line</b>" }, view: "effective" });
  assert(text(sanitized, "hero.subheadline") === "Clearer line", "rich text is sanitized before it reaches the preview");

  const duplicate = resolveLivePreview({ fields, drafts: { "features.item.1.title": "Soft grip" }, view: "effective" });
  assert(text(duplicate, "features.item.1.title") === "Steel body", "a duplicate feature title does not replace the preview");
  assert(duplicate.errors["features.item.1.title"] === "Duplicate feature.", "a duplicate feature title is reported");

  const saved = fields.map((field) => field.id === "hero.headline" ? { ...field, override: "Saved headline", modified: true } : field);
  assert(fieldPresence(saved[0]!, undefined) === "modified", "a stored override is modified");
  assert(fieldPresence(saved[0]!, "Saved headline") === "modified", "a draft that matches the stored override stays modified");
  assert(fieldPresence(saved[0]!, "Newer headline") === "unsaved", "a draft that differs from the stored override is unsaved");
  assert(fieldPresence(fields[0]!, undefined) === "saved", "a field without an override or draft is saved");
  const savedPreview = resolveLivePreview({ fields: saved, drafts: { "hero.headline": "Newer headline" }, view: "effective" });
  assert(text(savedPreview, "hero.headline") === "Newer headline", "an unsaved draft replaces the saved override in the preview");
  const kept = resolveLivePreview({ fields: saved, drafts: { "hero.headline": "<script>nope</script>" }, view: "effective" });
  assert(text(kept, "hero.headline") === "Saved headline", "an invalid draft keeps the saved override on screen");

  assert(PREVIEW_VIEWPORTS.join(",") === "desktop,tablet,mobile", "desktop, tablet, and mobile viewports are available");
  assert(PREVIEW_VIEWPORT_WIDTH.desktop === 1280 && PREVIEW_VIEWPORT_WIDTH.tablet === 768 && PREVIEW_VIEWPORT_WIDTH.mobile === 390, "viewport widths are fixed sizes");
  assert(!("viewport" in { fields, drafts: {}, view: "effective" as const }), "viewport selection is outside preview resolution");

  const moduleSource = readFileSync(path.join(process.cwd(), "src/lib/lp-builder/live-preview.ts"), "utf8");
  assert(!/visiflora|prime biome|neuro serge|joint genesis|prodentim|audifort/i.test(moduleSource), "the live preview has no product names");
  assert(!/anthropic|openai|product-facts|presentation-plan|grounding-validator|policy-linter|publication|analytics-store/i.test(moduleSource), "the live preview does not call facts, presentation, grounding, policy, publication, or tracking");

  for (const label of ["VisiFlora", "Joint Genesis", "Prime Biome", "Neuro Serge", "Prodentim", "Audifort", "Unknown Product"]) replay(label);

  console.log("LP_BUILDER_LIVE_PREVIEW_TESTS=PASS");
}

main();
