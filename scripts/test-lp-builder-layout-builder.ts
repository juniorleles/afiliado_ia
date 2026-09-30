// npx tsx scripts/test-lp-builder-layout-builder.ts
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
  applyPreset,
  assignmentsFrom,
  buildGeneratedLayout,
  duplicateSection,
  moveSection,
  resolveLayout,
  withFlag,
} from "../src/lib/lp-builder/layout.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FALHOU: ${message}`);
  console.log(`OK: ${message}`);
}

const dbFile = path.join(os.tmpdir(), `lp-layout-${Date.now()}.db`);
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
    slug: "lp-layout",
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
  const page = composePresellPage({
    variant: { headline: facts.productName || "Headline", body: facts.description || facts.productName || "Body", ctaLabel: "Learn More" },
    facts,
    template: "REVIEW",
  });
  const pageJson = JSON.stringify(page);
  const document = contentDocument(projectContentFields(page, {
    disclosure: AFFILIATE_DISCLOSURE_TEXT,
    footer: TRUST_EDITORIAL.paragraphs[0],
    pricing: [],
    shipping: "",
  }));
  const documentJson = JSON.stringify(document);
  const grounding = JSON.stringify(validateGrounding(facts.description || facts.productName || "Body", facts));
  const policy = JSON.stringify(lintCampaign(campaignFrom(facts)).findings.map((item) => [item.ruleId, item.status]));
  const generated = buildGeneratedLayout();
  const idle = resolveLayout({ generated, assignments: [] });
  const hidden = resolveLayout({ generated, assignments: assignmentsFrom(generated, withFlag(generated, "hero", { visible: false })) });
  assert(JSON.stringify(facts) === beforeFacts, `${label}: ProductFacts stay unchanged`);
  assert(JSON.stringify(planPresentation(facts, analyzeProductProfile(facts))) === plan, `${label}: presentation plan stays unchanged`);
  assert(JSON.stringify(page) === pageJson, `${label}: generated page stays unchanged`);
  assert(JSON.stringify(document) === documentJson, `${label}: content document stays unchanged`);
  assert(JSON.stringify(idle.document.sections.map((section) => section.id)) === JSON.stringify(generated.map((section) => section.sectionId)), `${label}: no layout overrides leave the generated order identical`);
  assert(idle.document.sections.every((section) => section.visible), `${label}: no layout overrides leave every generated section visible`);
  assert(hidden.document.sections.find((section) => section.id === "hero")?.visible === false, `${label}: a layout override can hide a section`);
  assert(JSON.stringify(page) === pageJson, `${label}: a layout override leaves the generated page unchanged`);
  assert(JSON.stringify(validateGrounding(facts.description || facts.productName || "Body", facts)) === grounding, `${label}: grounding stays unchanged`);
  assert(JSON.stringify(lintCampaign(campaignFrom(facts)).findings.map((item) => [item.ruleId, item.status])) === policy, `${label}: policy stays unchanged`);
}

async function main() {
  const generated = buildGeneratedLayout(["hero", "features"]);
  const snapshot = JSON.stringify(generated);
  const idle = resolveLayout({ generated, assignments: [] });
  assert(generated.length === 16, "the layout catalog covers the supported sections");
  assert(JSON.stringify(generated) === snapshot, "resolving an empty override set leaves the generated layout immutable");
  assert(idle.sections.map((section) => section.id).join(",") === generated.map((section) => section.id).join(","), "an empty override set returns the generated order");
  assert(idle.warnings.length === 0, "the generated layout has no warnings");

  const hidden = withFlag(generated, "hero", { visible: false });
  const hiddenResolved = resolveLayout({ generated, assignments: assignmentsFrom(generated, hidden) });
  assert(hiddenResolved.sections.find((section) => section.id === "hero")?.visible === false, "hiding a required section still applies");
  assert(hiddenResolved.warnings.some((warning) => warning.code === "mandatory-hidden"), "hiding a required section warns");
  assert(JSON.stringify(generated) === snapshot, "a visibility override leaves the generated layout immutable");

  const moved = moveSection(generated, "faq", -1);
  assert(moved.findIndex((section) => section.id === "faq") === generated.findIndex((section) => section.id === "faq") - 1, "move up changes the effective order immediately");
  const locked = withFlag(generated, "faq", { locked: true });
  assert(moveSection(locked, "faq", -1).findIndex((section) => section.id === "faq") === locked.findIndex((section) => section.id === "faq"), "a locked section stays in place");
  const copied = duplicateSection(generated, "faq");
  assert(copied.filter((section) => section.sectionId === "faq").length === 2, "duplicate section adds a presentation copy");
  assert(JSON.stringify(generated) === snapshot, "duplicating a section leaves the generated layout immutable");

  const sales = applyPreset(generated, generated, "sales");
  assert(sales[0]?.sectionId === "hero" && sales[1]?.sectionId === "pricing", "the sales preset reorders presentation");
  assert(applyPreset(generated, sales, "generated").map((section) => section.id).join(",") === generated.map((section) => section.id).join(","), "the generated preset restores the generated order");
  const pinned = withFlag(sales, "pricing", { pinned: true });
  const editorial = applyPreset(generated, pinned, "editorial");
  assert(editorial.find((section) => section.id === "pricing")?.pinned === true, "a pinned section keeps its pin under a preset");

  const { resetDbForTests } = await import("../src/lib/db.ts");
  resetDbForTests();
  const store = await import("../src/lib/lp-builder/layout-store.ts");
  const hiddenAssignment = assignmentsFrom(generated, hidden);
  store.replaceLayoutOverrides({ campaignId: 4, previous: [], next: hiddenAssignment, actor: "admin", at: "2026-09-29T00:00:00.000Z" });
  assert(store.listLayoutOverrides(4).some((row) => row.sectionKey === "hero" && row.visible === false), "a layout override is stored");
  store.deleteLayoutOverrides({ campaignId: 4, sectionKey: "hero", actor: "admin", at: "2026-09-29T00:00:01.000Z" });
  assert(store.listLayoutOverrides(4).every((row) => row.sectionKey !== "hero"), "reset section layout removes that section");
  store.replaceLayoutOverrides({ campaignId: 4, previous: [], next: assignmentsFrom(generated, moved), actor: "admin", at: "2026-09-29T00:00:02.000Z" });
  store.deleteLayoutOverrides({ campaignId: 4, actor: "admin", at: "2026-09-29T00:00:03.000Z" });
  assert(store.listLayoutOverrides(4).length === 0, "restore generated layout clears the campaign");
  const audit = store.listLayoutAudit(4);
  assert(audit.some((row) => row.visibilityChange === "hidden" && row.newPosition !== null), "audit records visibility and position");
  assert(audit.some((row) => row.visibilityChange === "restored" && row.createdBy === "admin"), "audit records the restore and the actor");

  const moduleSource = readFileSync(path.join(process.cwd(), "src/lib/lp-builder/layout.ts"), "utf8");
  assert(!/visiflora|prime biome|neuro serge|joint genesis|prodentim|audifort/i.test(moduleSource), "the layout engine has no product names");
  assert(!/anthropic|openai|product-facts|presentation-plan|grounding-validator|policy-linter|publication|analytics-store|lp-builder\/content|lp-builder\/theme|lp-builder\/media/i.test(moduleSource), "the layout engine does not call facts, content, theme, media, presentation, grounding, policy, publication, or tracking");
  const publicPage = readFileSync(path.join(process.cwd(), "src/app/p/[slug]/page.tsx"), "utf8");
  assert(publicPage.includes("isReleasePublication") && publicPage.includes("recordVisit"), "publication approval and visit tracking stay on the public page");

  for (const label of ["VisiFlora", "Joint Genesis", "Prime Biome", "Neuro Serge", "Prodentim", "Audifort", "Unknown Product"]) replay(label);
  console.log("LP_BUILDER_LAYOUT_BUILDER_TESTS=PASS");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
