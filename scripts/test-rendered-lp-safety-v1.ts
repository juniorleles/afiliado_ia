/**
 * Safety regression over an assembled draft LP: the rendered consumer text is
 * re-graded against the frozen facts, and publication must stay a human decision.
 *
 * npx tsx scripts/test-rendered-lp-safety-v1.ts --dir=<replay dir> --slug=<slug> [--reference=<slug>]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { getCampaignBySlug } from "../src/lib/campaigns.ts";
import { applyProductionCandidate } from "../src/lib/production-candidate.ts";
import { consumerVisibleText, parsePresellPage } from "../src/lib/presell-page.ts";
import { applyGenericFaqRecovery } from "../src/lib/faq-field-promotion.ts";
import { presellPageFaqAuthorityBindings } from "../src/lib/ai/presell-faq-authority.ts";
import { composeContentReadiness, validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import { lintCampaign } from "../src/lib/policy-linter.ts";
import { decidePublish, resolvePublicationGate } from "../src/lib/publication.ts";
import type { ProductFacts } from "../src/lib/product-facts.ts";

const replayDir = process.argv.find((item) => item.startsWith("--dir="))?.slice(6);
const slug = process.argv.find((item) => item.startsWith("--slug="))?.slice(7);
const reference = process.argv.find((item) => item.startsWith("--reference="))?.slice(12);
if (!replayDir || !slug) throw new Error("--dir and --slug are required");

let failures = 0;
const assert = (ok: boolean, label: string, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` :: ${detail}` : ""}`);
};

const readJson = <T,>(file: string) => JSON.parse(readFileSync(path.join(replayDir, file), "utf8")) as T;
const frozenFacts = readJson<{ facts: ProductFacts }>("product-facts.json").facts;
const frozenCopy = readJson<{ headline: string; body: string; ctaLabel: string }>("policy-semantics-v1/copy.json");
const frozenRevalidation = readJson<{ grounding: string; contentReadiness: string; publicationGate: string; policyFindings: Array<{ ruleId: string; status: string }> }>(
  "policy-semantics-v1/revalidation.json",
);

const stored = getCampaignBySlug(slug);
if (!stored) throw new Error(`campaign ${slug} not found`);
const campaign = applyProductionCandidate(stored);
const page = parsePresellPage(campaign.pageComposition);
if (!page) throw new Error("rendered page missing");

assert(stored.sourceFactsJson === JSON.stringify(frozenFacts), "PRODUCTFACTS_CHANGED=NO");
assert(stored.headline === frozenCopy.headline, "headline unchanged");
assert(stored.body === frozenCopy.body, "body unchanged");
assert(stored.ctaLabel === frozenCopy.ctaLabel, "cta unchanged");

const rendered = consumerVisibleText(page);
for (const line of frozenCopy.body.split(/\n+/).map((item) => item.replace(/^#{1,6}\s+/, "").replace(/^-\s+/, "").trim())) {
  if (!line || line.startsWith("##")) continue;
  const text = line.includes("? ") ? line.split("? ")[1].trim() : line;
  if (!text) continue;
  assert(rendered.includes(text), `rendered page still carries: ${text.slice(0, 54)}`);
}

const recovered = applyGenericFaqRecovery(frozenFacts);
const grounding = validateGrounding(rendered, recovered, { faqAuthorities: presellPageFaqAuthorityBindings(page, recovered) });
const policy = lintCampaign(campaign);
const readiness = composeContentReadiness({ grounding: grounding.status, policyFindings: policy.findings });
const gate = resolvePublicationGate(stored);

assert(grounding.status === "GROUNDED", "GROUNDING=GROUNDED", grounding.status);
assert(grounding.unsupportedClaims.length === 0, "UNSUPPORTED_CLAIMS=0", String(grounding.unsupportedClaims.length));
assert(grounding.status === frozenRevalidation.grounding, "grounding matches the frozen revalidation");
assert(readiness === "CONTENT_READY", "CONTENT_READINESS=CONTENT_READY", readiness);
assert(gate === "REVIEW_REQUIRED", "PUBLICATION_READINESS=REVIEW_REQUIRED", gate);
assert(decidePublish(gate, true) === "confirm", "confirming warnings does not publish");
assert(stored.publicationStatus === "draft", "PUBLICATION_STATUS=draft", stored.publicationStatus);
assert(stored.publishedAt === null, "never published");

const warned = policy.findings.filter((finding) => finding.status !== "pass");
for (const expected of frozenRevalidation.policyFindings) {
  const found = warned.find((finding) => finding.ruleId === expected.ruleId);
  assert(Boolean(found) && found?.status === expected.status, `policy warning preserved: ${expected.ruleId}`, found?.evidence ?? "missing");
}
assert(warned.every((finding) => !finding.blocking), "no blocking policy violation");
for (const finding of warned) console.log(`   WARN ${finding.ruleId} blocking=${finding.blocking} evidence="${finding.evidence}"`);

if (reference) {
  const referenceCampaign = getCampaignBySlug(reference);
  const referencePage = referenceCampaign ? parsePresellPage(applyProductionCandidate(referenceCampaign).pageComposition) : null;
  const placed = new Set(["overview", "features", "usage", "guarantee", "faq"]);
  const extra = referencePage?.sections.filter((section) => section.visible && !placed.has(section.id)) ?? [];
  assert(extra.length === 0, "reference campaign renders no newly added section", extra.map((item) => item.id).join(",") || "none");
}

console.log(failures === 0 ? "RENDERED_LP_SAFETY=PASS" : `RENDERED_LP_SAFETY=FAIL failures=${failures}`);
process.exit(failures === 0 ? 0 : 1);
