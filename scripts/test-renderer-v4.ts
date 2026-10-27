// npx tsx scripts/test-renderer-v4.ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { labScenarioKeys } from "../src/lib/design-system/scenarios.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { EXECUTION_50D_CRITERIA, REQUIRED_EVIDENCE_FILES } from "../src/lib/quality-gate/criteria.ts";
import { diskFreeGb } from "../src/lib/quality-gate/disk.ts";
import { fileHash, safeEditorAvailability } from "../src/lib/quality-gate/fix.ts";
import { runSupervisor } from "../src/lib/quality-gate/supervisor.ts";
import { reviewVisualOptional } from "../src/lib/quality-gate/visual.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

const ROOT = process.cwd();
const EVIDENCE = path.join("data", "evidence", "execution-51a-premium-conversion-design");
const free = diskFreeGb();
assert(Number.isFinite(free) && free >= 5, `C: has ${free} GB free`);

const protectedFiles = [
  "src/lib/product-assets/authorization.ts",
  "src/app/p/[slug]/page.tsx",
  "src/lib/product-contract/build.ts",
];
const beforeProtect = Object.fromEntries(protectedFiles.map((rel) => [rel, fileHash(path.join(ROOT, rel))]));

mkdirSync(path.join(ROOT, EVIDENCE), { recursive: true });
const keys = labScenarioKeys();
const models = keys.map((key) => {
  const model = buildV4Model(key);
  assert(Boolean(model), `${key} builds a V4 model`);
  return model!;
});

const html = models.map((model) => ({
  key: model.scenarioKey,
  markup: renderToStaticMarkup(createElement(V4Page, { model })),
  model,
}));

for (const row of html) {
  assert(row.markup.includes('data-v4="page"'), `${row.key} renders`);
  assert(!/clinically proven|verified buyer|limited time|erases wrinkles|★★/i.test(row.markup), `${row.key} has no invented claims`);
  const withoutSticky = row.markup.replace(/<div class="ds-sticky-cta"[\s\S]*?<\/div>/, "");
  const hopButtons = [...withoutSticky.matchAll(/<a class="[^"]*ds-btn(?![^"]*ghost)[^"]*"[^>]*href="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((href) => !href.startsWith("#"));
  const authorized = hopButtons.filter((href) => href === row.model.hopHref);
  if (row.model.hopSlot === "none") {
    assert(authorized.length === 0, `${row.key} has no commercial hop`);
  } else {
    assert(authorized.length === 1, `${row.key} has a single hop CTA in the page body`);
    assert(row.model.hopHref === row.model.contract.cta.href, `${row.key} hop matches the contract`);
  }
  const imgs = [...row.markup.matchAll(/<img [^>]*src="([^"]+)"/g)].map((m) => m[1]);
  if (!row.model.commercialImage) {
    assert(imgs.length === 0, `${row.key} does not present a placeholder as a product photo`);
  } else {
    assert(imgs.every((src) => src === row.model.commercialImage!.src), `${row.key} images stay on the authorized src`);
  }
  const hopMarks = [...row.markup.matchAll(/data-v4-cta="(hero|offers)"[^>]*>([^<]*)</g)];
  for (const mark of hopMarks) {
    assert(mark[2].trim().length > 0, `${row.key} hop CTA has visible text`);
  }
  if (row.model.hopSlot === "none") {
    assert(!/this page contains an affiliate link/i.test(row.markup), `${row.key} disclosure does not invent an affiliate link`);
    assert(!/data-v4-cta="(hero|offers|sticky)"/.test(row.markup), `${row.key} has no commercial CTA without a hop`);
  } else {
    assert(/this page contains an affiliate link/i.test(row.markup) || /affiliate/i.test(row.markup), `${row.key} keeps a documented affiliate disclosure`);
  }
  const headings = [...row.markup.matchAll(/<h2[^>]*>([^<]*)/g)].map((m) => m[1]);
  assert(!headings.some((title) => /what the source states|seller-stated claims|questions the source answered/i.test(title)), `${row.key} has no audit headlines`);
  assert(!/most chosen|best seller|most popular|ds-chip/i.test(row.markup), `${row.key} has no popularity badge`);
  assert(!/the seller states:/i.test(row.markup), `${row.key} does not use audit claim prefixes`);
  assert(!row.markup.includes("ds-btn--on-accent"), `${row.key} hop buttons keep readable contrast classes`);
  assert(!row.markup.includes("data-v4-section=\"cta_final\"") || row.model.hopSlot === "none", `${row.key} does not duplicate the final hop`);
  assert(row.model.blueprint.publication.approval === "REQUIRED", `${row.key} publication stays required`);
}

const [s1, , s3, s4, s5, s6] = html;
assert(s1.model.composition === "product-hero", "s1 image+offer uses product-hero");
assert(s3.model.composition === "product-hero", "s3 image+offer uses product-hero");
assert(s4.model.composition !== "product-hero", "s4 without image is not product-hero");
assert((s4.markup.match(/data-v4-section=/g) || []).length < (s1.markup.match(/data-v4-section=/g) || []).length, "s4 is more compact than s1");
assert(!s5.markup.includes("<img "), "s5 has no product image");
assert(s5.markup.includes("ds-hero--editorial") || s5.markup.includes("ds-hero--info"), "s5 uses an editorial/info hero");
assert(s6.model.hopSlot === "none", "s6 has no hop slot");
assert(s6.markup.includes("offers") || s6.model.copy.offerMicrocopy.length >= 1, "s6 can still show a documented package");
assert(s1.model.blueprint.narrative.shape !== s4.model.blueprint.narrative.shape, "composition follows data, not a product name");

assert(!s1.markup.includes("<img "), "s1 does not treat the lab cube as a product photo");
assert(!s3.markup.includes("<img "), "s3 does not treat the lab cube as a product photo");
assert(s1.markup.includes("Features") || s1.markup.includes("Product details"), "s1 uses editorial section titles");
assert(s6.markup.includes("No authorized purchase link is available."), "s6 states that no hop is available");

const srcFiles = [
  "src/lib/product-showcase/v4/model.ts",
  "src/lib/product-showcase/v4/presentation.ts",
  "src/components/product-showcase/v4/page.tsx",
  "src/components/product-showcase/v4/shell.tsx",
];
for (const file of srcFiles) {
  const text = readFileSync(path.join(ROOT, file), "utf8");
  assert(!/aldermoor|prodentim|neuroprime|pellucid|quillon|harlow|tessel|brindle/i.test(text), `${file} has no product-name branches`);
}

writeFileSync(path.join(ROOT, EVIDENCE, "comparison.json"), JSON.stringify({
  scenarios: html.map((row) => ({
    key: row.key,
    composition: row.model.composition,
    goal: row.model.blueprint.conversionGoal,
    hopSlot: row.model.hopSlot,
    sections: [...row.markup.matchAll(/data-v4-section="([^"]+)"/g)].map((m) => m[1]),
    images: Boolean(row.model.commercialImage),
    placeholderWithheld: Boolean(row.model.blueprint.images.hero) && !row.model.commercialImage,
    packages: row.model.copy.offerMicrocopy.length,
  })),
}, null, 2));
writeFileSync(path.join(ROOT, EVIDENCE, "files-changed.json"), JSON.stringify({
  added: [
    "src/lib/product-showcase/v4/model.ts",
    "src/lib/product-showcase/v4/presentation.ts",
    "src/lib/product-showcase/v4/index.ts",
    "src/components/product-showcase/v4/page.tsx",
    "src/components/product-showcase/v4/shell.tsx",
    "src/app/renderer-v4-lab.css",
    "src/app/admin/lab/renderer-v4/page.tsx",
    "src/app/admin/lab/renderer-v4/[scenario]/page.tsx",
    "scripts/test-renderer-v4.ts",
    "scripts/capture-renderer-v4.ts",
  ],
}, null, 2));
writeFileSync(path.join(ROOT, EVIDENCE, "disk.json"), JSON.stringify({ freeGb: free }, null, 2));
writeFileSync(path.join(ROOT, EVIDENCE, "index.json"), JSON.stringify({ execution: "51a", routes: keys.map((key) => `/admin/lab/renderer-v4/${key}`) }, null, 2));
writeFileSync(path.join(ROOT, EVIDENCE, "supervisor-report.json"), JSON.stringify({ pending: true }, null, 2));
writeFileSync(path.join(ROOT, EVIDENCE, "gates.json"), JSON.stringify({ pending: true }, null, 2));
writeFileSync(path.join(ROOT, EVIDENCE, "defects.json"), JSON.stringify({ pending: true }, null, 2));
writeFileSync(path.join(ROOT, EVIDENCE, "attempts.json"), JSON.stringify([]));
writeFileSync(path.join(ROOT, EVIDENCE, "revalidation.json"), JSON.stringify({ pending: true }, null, 2));

assert(reviewVisualOptional().state === "NOT_EVALUATED", "visual review stays NOT_EVALUATED");
assert(safeEditorAvailability().autonomousAiEditing === false, "no general auto-edit");

async function runGate() {
  const gate = await runSupervisor({
    executionId: "execution-51a",
    criteria: { ...EXECUTION_50D_CRITERIA, executionId: "execution-51a" },
    evidenceDir: path.join(EVIDENCE, "quality-gate"),
    autoFix: false,
    targets: [
      { kind: "conversion-briefs" },
      { kind: "evidence-files", directory: EVIDENCE.replace(/\\/g, "/"), required: [...REQUIRED_EVIDENCE_FILES] },
    ],
  });
  gate.gates.VISUAL_REVIEW_GATE = {
    id: "VISUAL_REVIEW_GATE",
    verdict: "NOT_EVALUATED",
    reasons: ["screenshots are captured for human review", "multimodal aesthetic review is NOT_EVALUATED"],
  };
  assert(gate.gates.TECHNICAL_GATE.verdict === "PASS", "TECHNICAL_GATE pass");
  assert(gate.gates.CONTENT_GROUNDING_GATE.verdict === "PASS", "CONTENT_GROUNDING_GATE pass");
  assert(gate.gates.COMMERCIAL_AUTHORIZATION_GATE.verdict === "PASS", "COMMERCIAL_AUTHORIZATION_GATE pass");
  assert(gate.gates.EDITORIAL_QUALITY_GATE.verdict === "PASS", "EDITORIAL_QUALITY_GATE pass");
  assert(gate.gates.VISUAL_REVIEW_GATE.verdict === "NOT_EVALUATED", "VISUAL_REVIEW_GATE not evaluated");
  assert(gate.gates.HUMAN_APPROVAL_GATE.verdict === "REQUIRED", "HUMAN_APPROVAL_GATE required");
  writeFileSync(path.join(ROOT, EVIDENCE, "supervisor-report.json"), JSON.stringify(gate, null, 2));
  writeFileSync(path.join(ROOT, EVIDENCE, "gates.json"), JSON.stringify(gate.gates, null, 2));
  writeFileSync(path.join(ROOT, EVIDENCE, "defects.json"), JSON.stringify(gate.defects, null, 2));
  writeFileSync(path.join(ROOT, EVIDENCE, "revalidation.json"), JSON.stringify({ status: gate.status, visualReview: "NOT_EVALUATED" }, null, 2));
  writeFileSync(path.join(ROOT, EVIDENCE, "test-results.json"), JSON.stringify({ ok: true, passed }, null, 2));
  for (const rel of protectedFiles) {
    assert(fileHash(path.join(ROOT, rel)) === beforeProtect[rel], `${rel} was not modified`);
  }
  console.log("RENDERER_V4_OK");
  console.log(`OK_COUNT=${passed}`);
}

runGate().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
