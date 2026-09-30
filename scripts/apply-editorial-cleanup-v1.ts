/**
 * Authorized editorial cleanup of a persisted production page (no model call).
 *
 * Applies exact sentence replacements from a versioned edits file, then proves
 * the edit is subtractive: each replacement adds no content word, the page
 * grounding and policy results are not worse, and each edited sentence is
 * grounded on its own. Writes the validation report next to the edits file.
 * Persists only with --apply, only while the campaign is draft.
 *
 * Usage: npx tsx scripts/apply-editorial-cleanup-v1.ts --edits=<file> [--apply]
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import { presellPageFaqAuthorityBindings } from "../src/lib/ai/presell-faq-authority.ts";
import { getCampaignBySlug, type Campaign } from "../src/lib/campaigns.ts";
import { applyGenericFaqRecovery } from "../src/lib/faq-field-promotion.ts";
import { lintCampaign } from "../src/lib/policy-linter.ts";
import { consumerVisibleText, parsePresellPage } from "../src/lib/presell-page.ts";
import type { ProductFacts } from "../src/lib/product-facts.ts";
import { applyProductionCandidate, saveProductionCandidateSnapshot } from "../src/lib/production-candidate.ts";

type Edit = { location: string; before: string; after: string };
type EditsFile = { slug: string; target: string; edits: Edit[] };

const FUNCTION_WORDS = new Set(["it", "its", "a", "an", "the", "and", "or", "with", "of", "to", "for", "in", "on", "as", "such", "like", "is", "are"]);

function arg(name: string): string | undefined {
  return process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function fail(message: string): never {
  console.error(`EDITORIAL_CLEANUP=FAIL ${message}`);
  process.exit(1);
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? [];
}

function addedContentWords(before: string, after: string): string[] {
  const source = new Set(words(before));
  return [...new Set(words(after))].filter((word) => !source.has(word) && !FUNCTION_WORDS.has(word));
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function evaluate(campaign: Campaign, facts: ProductFacts) {
  const rendered = applyProductionCandidate(campaign);
  const page = parsePresellPage(rendered.pageComposition);
  if (!page) fail("production page does not parse");
  const grounding = validateGrounding(consumerVisibleText(page), facts, {
    faqAuthorities: presellPageFaqAuthorityBindings(page, facts),
  });
  const policy = lintCampaign(rendered);
  return {
    grounding: grounding.status,
    unsupported: grounding.unsupportedClaims.map((item) => `${item.severity}:${item.claim}::${item.reason}`),
    policyGate: policy.gate,
    policyFails: policy.findings.filter((item) => item.status === "fail").map((item) => item.ruleId),
    policyWarns: policy.findings.filter((item) => item.status === "warn").map((item) => item.ruleId),
  };
}

const editsPath = arg("edits");
if (!editsPath) fail("--edits is required");
const spec = JSON.parse(readFileSync(editsPath, "utf8")) as EditsFile;
if (spec.target !== "productionPageComposition") fail("unsupported target");
const stored = getCampaignBySlug(spec.slug);
if (!stored) fail("campaign missing");
if (stored.publicationStatus !== "draft") fail("campaign is not draft");
if (!stored.productionPageComposition || !stored.productionCreativeCompositionJson || !stored.productionPresentation) {
  fail("campaign has no production candidate");
}
if (!stored.sourceFactsJson) fail("campaign has no source facts");
const facts = applyGenericFaqRecovery(JSON.parse(stored.sourceFactsJson) as ProductFacts);

let nextComposition = stored.productionPageComposition;
const perEdit = spec.edits.map((edit) => {
  const encodedBefore = JSON.stringify(edit.before).slice(1, -1);
  const encodedAfter = JSON.stringify(edit.after).slice(1, -1);
  const occurrences = countOccurrences(nextComposition, encodedBefore);
  if (occurrences !== 1) fail(`${edit.location}: expected exactly one occurrence, found ${occurrences}`);
  nextComposition = nextComposition.replace(encodedBefore, encodedAfter);
  const sentence = validateGrounding(edit.after, facts);
  return {
    location: edit.location,
    addedContentWords: addedContentWords(edit.before, edit.after),
    sentenceGrounding: sentence.status,
    sentenceUnsupported: sentence.unsupportedClaims.map((item) => `${item.severity}:${item.claim}::${item.reason}`),
    originalSentenceGrounding: validateGrounding(edit.before, facts).status,
  };
});

const before = evaluate(stored, facts);
const edited: Campaign = { ...stored, productionPageComposition: nextComposition };
const after = evaluate(edited, facts);

const newUnsupported = after.unsupported.filter((item) => !before.unsupported.includes(item));
const newPolicyFails = after.policyFails.filter((item) => !before.policyFails.includes(item));
const checks = {
  noAddedContentWords: perEdit.every((item) => item.addedContentWords.length === 0),
  editedSentencesGrounded: perEdit.every((item) => item.sentenceGrounding === "GROUNDED"),
  pageGroundingNotWorse: after.grounding === "GROUNDED" || after.grounding === before.grounding,
  noNewUnsupportedClaims: newUnsupported.length === 0,
  noNewPolicyFails: newPolicyFails.length === 0,
  policyGateNotWorse: before.policyGate === after.policyGate || after.policyGate === "READY",
};
const pass = Object.values(checks).every(Boolean);
const apply = process.argv.includes("--apply");

let persisted = false;
if (pass && apply) {
  const updated = saveProductionCandidateSnapshot(stored.id, {
    productionPageComposition: nextComposition,
    productionCreativeCompositionJson: stored.productionCreativeCompositionJson,
    productionPresentation: stored.productionPresentation,
  });
  if (updated.productionPageComposition !== nextComposition) fail("persisted page differs from validated page");
  if (updated.productionCreativeCompositionJson !== stored.productionCreativeCompositionJson) fail("creative plan changed");
  persisted = true;
}

const report = {
  slug: spec.slug,
  aiModelCalls: 0,
  result: pass ? "PASS" : "FAIL",
  persisted,
  publicationStatus: getCampaignBySlug(spec.slug)?.publicationStatus,
  checks,
  edits: perEdit,
  page: { before, after, newUnsupported, newPolicyFails },
};
const out = path.join(path.dirname(editsPath), apply ? "editorial-validation.json" : "editorial-validation-dry-run.json");
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(`EDITORIAL_CLEANUP=${report.result} PERSISTED=${persisted ? "YES" : "NO"} REPORT=${out}`);
console.log(JSON.stringify({ checks, edits: perEdit, before: before.grounding, after: after.grounding, gate: [before.policyGate, after.policyGate] }));
if (!pass) process.exit(1);
