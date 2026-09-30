// npx tsx scripts/test-lp-builder-versioning.ts
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
import { compareSnapshots, emptySnapshot, validateParentChain, validateSnapshot, type VersionSnapshot } from "../src/lib/lp-builder/version.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FALHOU: ${message}`);
  console.log(`OK: ${message}`);
}

const dbFile = path.join(os.tmpdir(), `lp-versions-${Date.now()}.db`);
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
    slug: "lp-versions",
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

function layoutRow(visible: boolean, order: number): VersionSnapshot["layout"][number] {
  return {
    sectionKey: "hero",
    sectionId: "hero",
    visible,
    collapsed: false,
    order,
    priority: 0,
    pinned: false,
    locked: false,
    futureCompatible: false,
    duplicate: false,
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
  const idle = compareSnapshots(emptySnapshot(), emptySnapshot());
  assert(idle.length === 0, `${label}: an empty override snapshot has no changes`);
  assert(JSON.stringify(facts) === beforeFacts, `${label}: ProductFacts stay unchanged`);
  assert(JSON.stringify(planPresentation(facts, analyzeProductProfile(facts))) === plan, `${label}: presentation plan stays unchanged`);
  assert(JSON.stringify(page) === pageJson, `${label}: generated page stays unchanged`);
  assert(JSON.stringify(document) === documentJson, `${label}: content document stays unchanged`);
  assert(JSON.stringify(validateGrounding(facts.description || facts.productName || "Body", facts)) === grounding, `${label}: grounding stays unchanged`);
  assert(JSON.stringify(lintCampaign(campaignFrom(facts)).findings.map((item) => [item.ruleId, item.status])) === policy, `${label}: policy stays unchanged`);
}

async function main() {
  const corrupt = validateSnapshot({ content: "broken" });
  assert(!corrupt.ok, "a corrupted snapshot is rejected");
  const duplicate = validateSnapshot({
    content: [
      { fieldId: "hero.headline", sectionId: "hero", value: "A" },
      { fieldId: "hero.headline", sectionId: "hero", value: "B" },
    ],
    theme: [],
    media: [],
    library: [],
    layout: [],
  });
  assert(!duplicate.ok && duplicate.error.includes("Duplicate"), "duplicate override ids are rejected");
  const brokenMedia = validateSnapshot({
    content: [],
    theme: [],
    media: [{ slotId: "", libraryId: null, removed: false, name: "", src: "", alt: "", caption: "", decorative: false, role: "heroImage", origin: "saved", source: "", crop: "", rotation: 0, order: 0 }],
    library: [],
    layout: [],
  });
  assert(!brokenMedia.ok, "a broken media reference is rejected");
  const cycle = validateParentChain([
    { id: "v-1-2", versionNumber: 2, parentId: "v-1-1" },
    { id: "v-1-1", versionNumber: 1, parentId: "v-1-2" },
  ]);
  assert(!cycle.ok, "an invalid parent chain is rejected");

  const before = emptySnapshot();
  const after: VersionSnapshot = {
    ...emptySnapshot(),
    content: [{ fieldId: "hero.headline", sectionId: "hero", value: "Updated" }],
    theme: [
      { scope: "theme", targetId: "theme", token: "colors.primary", value: "#112233" },
      { scope: "component", targetId: "hero/heading", token: "colors.accent", value: "#445566" },
    ],
    media: [{ slotId: "hero.image", libraryId: null, removed: false, name: "Hero", src: "https://example.test/hero.png", alt: "Hero", caption: "", decorative: false, role: "heroImage", origin: "saved", source: "saved", crop: "", rotation: 0, order: 0 }],
    layout: [layoutRow(false, 3)],
  };
  const kinds = new Set(compareSnapshots(before, after).map((change) => `${change.overrideType}:${change.kind}`));
  assert(kinds.has("content:added") && kinds.has("theme:added") && kinds.has("component:added") && kinds.has("media:added") && kinds.has("visibility:hidden"), "compare reports added, component, and hidden changes");
  const restored = compareSnapshots(after, { ...emptySnapshot(), layout: [layoutRow(true, 1)] });
  const restoredKinds = new Set(restored.map((change) => change.kind));
  assert(restoredKinds.has("removed") && restoredKinds.has("restored") && restoredKinds.has("moved"), "compare reports removed, restored, and moved changes");
  const modified = compareSnapshots(after, { ...after, content: [{ fieldId: "hero.headline", sectionId: "hero", value: "Next" }] });
  assert(modified.some((change) => change.kind === "modified" && change.oldValue === "Updated" && change.newValue === "Next"), "compare reports the old and new values");

  const { resetDbForTests, schemaVersion, getDb } = await import("../src/lib/db.ts");
  resetDbForTests();
  assert(schemaVersion() >= 11, "the version tables migrate with the database");
  const versions = await import("../src/lib/lp-builder/version-store.ts");
  const content = await import("../src/lib/lp-builder/store.ts");
  const theme = await import("../src/lib/lp-builder/theme-store.ts");
  const media = await import("../src/lib/lp-builder/media-store.ts");
  const mediaEngine = await import("../src/lib/lp-builder/media.ts");
  const layout = await import("../src/lib/lp-builder/layout-store.ts");
  const campaignId = 7;
  const at = "2026-09-29T00:00:00.000Z";
  assert(versions.versionAutosaveEnabled(campaignId) === false, "autosave stays off until an operator enables it");

  const rejected = versions.createPageVersion({
    campaignId,
    snapshot: { ...emptySnapshot(), theme: [{ scope: "theme", targetId: "theme", token: "not.a.token", value: "#000000" }] },
    comment: "bad",
    actor: "admin",
    at,
    action: "save",
    status: "current",
  });
  assert(!rejected.ok, "a broken theme reference is rejected before insert");
  assert(versions.listPageVersions(campaignId).length === 0, "a rejected version writes no history");

  const missingParent = versions.createPageVersion({
    campaignId,
    snapshot: emptySnapshot(),
    comment: "orphan",
    actor: "admin",
    at,
    action: "save",
    status: "draft",
    parentId: "v-missing",
  });
  assert(!missingParent.ok, "a missing parent is rejected");

  content.saveBuilderOverride({ campaignId, fieldId: "hero.headline", sectionId: "hero", value: "First", previousValue: null, actor: "admin", at });
  theme.saveThemeToken({ campaignId, scope: "component", targetId: "hero/heading", token: "colors.accent", value: "#445566", actor: "admin", at });
  media.saveMediaLibraryItem({ campaignId, libraryId: "lib-1", fields: mediaEngine.emptyMediaFields("heroImage"), actor: "admin", at, reason: "save" });
  media.saveMediaOverride({ campaignId, slotId: "hero.image", libraryId: "lib-1", removed: false, reason: "save", fields: { ...mediaEngine.emptyMediaFields("heroImage"), src: "https://example.test/hero.png", alt: "Hero" }, actor: "admin", at });
  layout.replaceLayoutOverrides({ campaignId, previous: [], next: [layoutRow(false, 4)], actor: "admin", at });
  const first = versions.createPageVersion({ campaignId, snapshot: versions.captureOverrideSnapshot(campaignId), comment: "First save", actor: "admin", at, action: "save", status: "current" });
  assert(first.ok && first.version.versionNumber === 1 && first.version.parentId === null && first.version.status === "current", "the first version is current and has no parent");
  assert(first.ok && first.version.createdBy === "admin" && first.version.overrideCount > 0 && first.version.affectedSections.length > 0, "a version records the actor, sections, and override count");

  content.saveBuilderOverride({ campaignId, fieldId: "hero.headline", sectionId: "hero", value: "Second", previousValue: "First", actor: "admin", at });
  const second = versions.createPageVersion({ campaignId, snapshot: versions.captureOverrideSnapshot(campaignId), comment: "Second save", actor: "admin", at, action: "save", status: "current" });
  assert(second.ok && second.version.parentId === "v-7-1" && second.version.changes.some((change) => change.kind === "modified"), "the next version parents the previous version and records the change");
  const beforeRollback = versions.listPageVersions(campaignId).length;
  const rolled = versions.rollbackToVersion({ campaignId, versionId: "v-7-1", actor: "admin", at });
  assert(rolled.ok, "rollback restores a selected version");
  const history = versions.listPageVersions(campaignId);
  assert(history.length > beforeRollback, "rollback adds history");
  assert(history.some((version) => version.id === "v-7-1" && version.comment === "First save"), "rollback keeps the original version");
  assert(history.some((version) => version.action === "before-rollback"), "rollback stores a snapshot first");
  assert(versions.captureOverrideSnapshot(campaignId).content[0]?.value === "First", "the restored overrides match the selected version");
  assert(JSON.stringify(versions.captureOverrideSnapshot(campaignId)) === JSON.stringify(first.ok ? first.version.snapshot : null), "version restore is deterministic");
  const again = versions.rollbackToVersion({ campaignId, versionId: "v-7-1", actor: "admin", at });
  assert(again.ok && versions.captureOverrideSnapshot(campaignId).content[0]?.value === "First", "restoring the same version is deterministic");
  assert(versions.versionHistoryHealthy(campaignId).ok, "the parent chain stays valid");
  const ids = history.map((version) => version.id);
  assert(new Set(ids).size === ids.length, "version ids stay unique");

  const countBeforeSame = versions.listPageVersions(campaignId).length;
  const same = versions.restoreCurrentVersion({ campaignId, actor: "admin", at });
  assert(same.ok && same.unchanged === true && versions.listPageVersions(campaignId).length === countBeforeSame, "restoring the current snapshot adds a version only when the working overrides differ");

  content.saveBuilderOverride({ campaignId, fieldId: "hero.headline", sectionId: "hero", value: "Drift", previousValue: "First", actor: "admin", at });
  const restoredCurrent = versions.restoreCurrentVersion({ campaignId, actor: "admin", at });
  assert(restoredCurrent.ok && versions.captureOverrideSnapshot(campaignId).content[0]?.value === "First", "restore current puts the working overrides back");

  const previous = versions.restorePreviousVersion({ campaignId, actor: "admin", at });
  assert(previous.ok, "restore previous creates a new version");
  const published = versions.publishSnapshot({ campaignId, actor: "admin", at, comment: "Release snapshot" });
  assert(published.ok, "a publish snapshot is stored");
  const afterPublish = versions.listPageVersions(campaignId);
  assert(afterPublish.some((version) => version.action === "before-publish" && version.status === "draft"), "publish stores a before-publish snapshot");
  assert(afterPublish.some((version) => version.status === "published"), "a published version stays published");
  assert(afterPublish.filter((version) => version.status === "current").length === 1, "one current version remains");

  const reset = versions.resetWorkingOverrides({ campaignId, actor: "admin", at });
  assert(reset.ok && versions.captureOverrideSnapshot(campaignId).content.length === 0, "reset clears working overrides after a before-reset snapshot");
  assert(versions.listPageVersions(campaignId).some((version) => version.action === "before-reset"), "reset keeps the previous overrides in history");
  const emptyAgain = versions.applySnapshot({ campaignId, snapshot: emptySnapshot(), actor: "admin", at });
  assert(emptyAgain.ok && JSON.stringify(versions.captureOverrideSnapshot(campaignId)) === JSON.stringify(emptySnapshot()), "applying the same snapshot twice is deterministic");

  const unchanged = versions.createPageVersion({
    campaignId,
    snapshot: emptySnapshot(),
    comment: "Autosave",
    actor: "admin",
    at,
    action: "autosave",
    status: "current",
    skipIfUnchanged: true,
  });
  assert(unchanged.ok && unchanged.skipped === true, "an unchanged autosave does not create a version");
  versions.setVersionAutosave(campaignId, true);
  assert(versions.versionAutosaveEnabled(campaignId) === true, "autosave can be enabled");

  const db = getDb();
  const versionCount = (db.prepare("SELECT COUNT(*) AS count FROM lp_page_versions WHERE campaignId = ?").get(campaignId) as { count: number }).count;
  const changeCount = (db.prepare("SELECT COUNT(*) AS count FROM lp_page_version_changes WHERE campaignId = ?").get(campaignId) as { count: number }).count;
  assert(versionCount === versions.listPageVersions(campaignId).length && changeCount > 0, "change rows record every modification");
  assert((db.prepare("SELECT COUNT(*) AS count FROM lp_page_versions").get() as { count: number }).count === versionCount, "history rows are not deleted");

  const moduleSource = readFileSync(path.join(process.cwd(), "src/lib/lp-builder/version.ts"), "utf8");
  assert(!/visiflora|prime biome|neuro serge|joint genesis|prodentim|audifort/i.test(moduleSource), "the version model has no product names");
  assert(!/anthropic|openai|product-facts|presentation-plan|grounding-validator|policy-linter|publication|analytics-store|lp-builder\/content|lp-builder\/theme|lp-builder\/media|lp-builder\/layout/i.test(moduleSource), "the version model does not call facts, builders, presentation, grounding, policy, publication, or tracking");
  const storeSource = readFileSync(path.join(process.cwd(), "src/lib/lp-builder/version-store.ts"), "utf8");
  assert(!/DELETE FROM lp_page_versions/i.test(storeSource), "version history is never deleted");
  const publicPage = readFileSync(path.join(process.cwd(), "src/app/p/[slug]/page.tsx"), "utf8");
  assert(publicPage.includes("isReleasePublication") && publicPage.includes("recordVisit"), "publication approval and visit tracking stay on the public page");

  for (const label of ["VisiFlora", "Joint Genesis", "Prime Biome", "Neuro Serge", "Prodentim", "Audifort", "Unknown Product"]) replay(label);
  console.log("LP_BUILDER_VERSIONING_TESTS=PASS");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
