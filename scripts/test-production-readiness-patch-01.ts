/**
 * Production readiness patch 01 — contract, draft gate, attribution fixture.
 * Does not publish, does not write the Joint Genesis affiliate URL, does not call Anthropic.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { adminAuthBypassed, labRoutesOpenWithoutCredential } from "../src/lib/access-policy.ts";
import { generateClickId, canRecordAnalytics, isValidClickId } from "../src/lib/analytics.ts";
import { buildAffiliateHref } from "../src/lib/affiliate-url.ts";
import { getCampaignBySlug, getPublishedCampaignBySlug } from "../src/lib/campaigns.ts";
import { attachClickBankExtclid, isClickBankHopUrl } from "../src/lib/clickbank-hop.ts";
import { collectEnvIssues, ENV_VAR_SPECS } from "../src/lib/env.ts";
import { parseCreativeCompositionPlan } from "../src/lib/creative/plan.ts";
import { consumerVisibleText, parsePresellPage } from "../src/lib/presell-page.ts";
import { lintCampaign } from "../src/lib/policy-linter.ts";
import { validateGrounding, type FaqAuthorityBinding } from "../src/lib/ai/grounding-validator.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { composerAddedFactualCopy } from "../src/lib/composition-fact-firewall.ts";
import { applyGenericFaqRecovery } from "../src/lib/faq-field-promotion.ts";
import { resolvePublicationGate } from "../src/lib/publication.ts";
import { loadExperimentCCopy } from "../src/lib/web-anatomy-lab/experiment-c.ts";
import { HEALTH_DISCLAIMER_TEXT, TRUST_EDITORIAL } from "../src/lib/public-site.ts";
import { VALIDATION_SAFE_AFFILIATE } from "../src/lib/validation/constants.ts";
import type { ProductFacts } from "../src/lib/product-facts.ts";
import {
  applyProductionCandidate,
  hasProductionCandidate,
  PRODUCTION_PRESENTATION_ID,
} from "../src/lib/production-candidate.ts";

const SLUG = "joint-genesis-controlled-ready-13";
const FIXTURE_HOP = "https://hop.clickbank.net/?affiliate=nick&vendor=vend";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`OK: ${message}`);
}

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

assert(labRoutesOpenWithoutCredential("production") === false, "production blocks lab routes without a credential");
assert(labRoutesOpenWithoutCredential("development") === true, "development leaves lab routes open");
assert(adminAuthBypassed("production", false) === false, "production does not bypass admin auth");
assert(adminAuthBypassed("production", true) === false, "production does not bypass admin auth when a password exists");
assert(adminAuthBypassed("development", false) === true, "development without a password bypasses admin auth");

const required = [
  "AIA_ENV",
  "PUBLIC_SITE_URL",
  "CLICKBANK_INS_SECRET",
  "ADMIN_PASSWORD",
  "ADMIN_SESSION_SECRET",
  "INTERNAL_FRAME_SECRET",
];
for (const name of required) {
  const spec = ENV_VAR_SPECS.find((item) => item.name === name);
  assert(spec?.requiredInProduction === true, `${name} is required in production`);
}
for (const name of ["PUBLIC_CONTACT_EMAIL", "PUBLIC_SITE_NAME"]) {
  const spec = ENV_VAR_SPECS.find((item) => item.name === name);
  assert(Boolean(spec) && spec?.requiredInProduction === false, `${name} is documented and optional`);
}

const previousAia = process.env.AIA_ENV;
delete process.env.AIA_ENV;
const missingAia = collectEnvIssues("production");
assert(missingAia.some((issue) => issue.name === "AIA_ENV" && issue.fatal), "production contract rejects a missing AIA_ENV");
process.env.AIA_ENV = previousAia;

const example = read(".env.example");
for (const name of [...required, "PUBLIC_CONTACT_EMAIL", "PUBLIC_SITE_NAME"]) {
  assert(example.includes(name), `.env.example names ${name}`);
}
assert(example.includes("NODE_ENV=production alone does not"), ".env.example states NODE_ENV does not enable production protections");

const publicPage = read("src/app/p/[slug]/page.tsx");
const previewPage = read("src/app/admin/preview/[slug]/page.tsx");
const candidate = read("src/lib/production-candidate.ts");
assert(!publicPage.includes("web-anatomy-lab"), "public page does not import the lab");
assert(!publicPage.includes("anthropic"), "public page does not import Anthropic");
assert(!candidate.includes("web-anatomy-lab"), "production candidate helper does not import the lab");
assert(publicPage.includes("getPublishedCampaignBySlug"), "public route still requires a published campaign");
assert(publicPage.includes("applyProductionCandidate"), "public route applies the production candidate");
assert(previewPage.includes("applyProductionCandidate"), "admin preview applies the production candidate");

const ctaRoute = read("src/app/api/track/cta/route.ts");
assert(ctaRoute.includes("campaignIsPublished"), "CTA tracking still refuses unpublished campaigns");
assert(ctaRoute.includes("canRecordAnalytics"), "CTA tracking still uses the analytics gate");

const insRoute = read("src/app/api/clickbank/ins/route.ts");
assert(insRoute.includes("getClickBankInsSecret"), "INS route reads the secret");
assert(insRoute.includes("decryptInsEnvelope"), "INS route decrypts");
assert(read("src/lib/clickbank-store.ts").includes("lookupCtaClick"), "INS join looks up the internal click");
assert(read("src/lib/clickbank.ts").includes("extclid"), "INS parser reads extclid");

function declarations(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\[data-wa-exp="final"\]/g, "SCOPE")
    .replace(/\[data-wa-lab="v1"\]/g, "SCOPE")
    .replace(/\[data-presell-presentation="premium-final-candidate-v1"\]/g, "SCOPE")
    .replace(/\s+/g, " ")
    .trim();
}
const publicCss = declarations(read("src/app/premium-final-candidate-public.css"));
assert(publicCss.includes(declarations(read("src/app/premium-final-candidate.css"))), "public CSS keeps the final-candidate declarations");
assert(!publicCss.includes("data-wa-exp"), "public CSS does not depend on a lab experiment attribute");

const clickId = generateClickId();
assert(isValidClickId(clickId), "click id is a UUID");
const incoming = new URLSearchParams("utm_source=ad&utm_medium=cpc&gclid=g1&fbclid=f1&msclkid=m1&unrelated=drop");
const href = attachClickBankExtclid(buildAffiliateHref(FIXTURE_HOP, incoming), clickId);
const built = new URL(href);
assert(isClickBankHopUrl(href), "fixture hop host stays valid");
assert(built.searchParams.get("extclid") === clickId, "extclid equals the internal click id");
assert(built.searchParams.get("utm_source") === "ad", "utm_source preserved");
assert(built.searchParams.get("gclid") === "g1", "gclid preserved");
assert(built.searchParams.get("fbclid") === "f1", "fbclid preserved");
assert(built.searchParams.get("msclkid") === "m1", "msclkid preserved");
assert(built.searchParams.get("unrelated") === null, "unrelated parameters stay dropped");
assert(built.searchParams.get("tid") === null, "tid is not used");
assert(canRecordAnalytics({ published: false, isPreview: false, skipHeader: false }) === false, "unpublished campaigns are not tracked");

const stored = getCampaignBySlug(SLUG);
assert(stored, "campaign row exists");
assert(stored?.publicationStatus === "draft", "campaign remains draft");
assert(getPublishedCampaignBySlug(SLUG) === undefined, "public lookup of the draft is empty");
assert(hasProductionCandidate(stored!), "production candidate is persisted");
const view = applyProductionCandidate(stored!);
const page = parsePresellPage(view.pageComposition);
const creative = parseCreativeCompositionPlan(view.creativeCompositionJson);
assert(page?.hero.headline === "Joint Genesis", "production view headline is the frozen V4 headline");
assert(view.pageComposition !== stored?.pageComposition, "lab composition stays separate from the production page");
assert(view.headline !== stored?.headline, "stored headline stays on the lab row");
const usage = creative?.scenes.find((scene) => scene.id === "usage");
assert(usage?.assetUse === "NONE" && usage.slot === null, "production creative uses the final-candidate usage scene");
assert(stored?.productionPresentation === PRODUCTION_PRESENTATION_ID, "presentation id is the final candidate");
assert(!view.pageComposition?.includes("web-anatomy"), "persisted page does not depend on a lab runtime marker");

// The frozen V4 copy plus the authorized, versioned editorial delta is the expected production copy.
const editorial = JSON.parse(read("data/mvp-final-integration/v1/lp-presentation-closure-v1/editorial-edits.json")) as {
  edits: Array<{ before: string; after: string }>;
};
const frozen = loadExperimentCCopy();
const frozenText = Object.values(frozen).join("\n");
for (const edit of editorial.edits) {
  assert(frozenText.includes(edit.before), "authorized editorial edit targets frozen V4 copy");
}
const copy = Object.fromEntries(
  Object.entries(frozen).map(([key, value]) => [
    key,
    typeof value === "string" ? editorial.edits.reduce((text, edit) => text.split(edit.before).join(edit.after), value) : value,
  ]),
) as typeof frozen;
const visible = page ? consumerVisibleText(page) : "";
for (const edit of editorial.edits) {
  assert(!visible.includes(edit.before) && visible.includes(edit.after), "production page carries the authorized editorial edit");
}
const authorized = [
  copy.HEADLINE,
  copy.SUMMARY,
  copy.OVERVIEW,
  copy.FEATURES,
  copy.USAGE,
  copy.GUARANTEE,
  copy.FAQS,
  view.ctaLabel,
  "Disclosure: I may earn a commission if you purchase through links on this page.",
  TRUST_EDITORIAL.heading,
  ...TRUST_EDITORIAL.paragraphs,
  HEALTH_DISCLAIMER_TEXT,
].join("\n");
const added = composerAddedFactualCopy(authorized, visible);
const requiredCopy = [copy.HEADLINE, copy.SUMMARY, copy.OVERVIEW, ...copy.FEATURES.split(/\n+/), copy.USAGE, copy.GUARANTEE];
const missing = requiredCopy.map((item) => item.trim()).filter((item) => item && item !== "OMITTED" && !visible.includes(item));
assert(added.length === 0 && missing.length === 0, "factual copy delta is 0");
assert(!/final thoughts/i.test(visible), "final thoughts are absent from consumer text");
const facts = applyGenericFaqRecovery(JSON.parse(read("data/controlled-ready-13/2026-09-21-controlled-visual-13/import-facts.json")) as ProductFacts);
const closedTopics = createGenerationPlan(facts).closedTopics;
const faqBindings: FaqAuthorityBinding[] = (page?.sections.find((section) => section.id === "faq")?.faq ?? []).map((item) => {
  const usage = /take /i.test(item.question);
  const guarantee = /return policy|refund policy/i.test(item.question);
  const features = /features are described/i.test(item.question);
  return {
    question: item.question,
    field: usage ? "usageInformation" : guarantee ? "guaranteeInformation" : features ? "features" : "description",
    topic: usage ? "usage" : guarantee ? "guarantee" : features ? "features" : "description",
    semanticAuthority: usage ? "USAGE" : guarantee ? "GUARANTEE" : features ? "FEATURE_DESCRIPTION" : "DESCRIPTION",
    authorizedTopics: [usage ? "usage" : guarantee ? "guarantee" : features ? "features" : "description"],
    supportText: usage ? copy.USAGE : guarantee ? copy.GUARANTEE : features ? copy.FEATURES : `${copy.SUMMARY}\n${copy.OVERVIEW}`,
    closedTopics,
  };
});
const inspectionBody = [
  page?.hero.subheadline ?? "",
  "",
  ...(page?.sections.filter((section) => section.visible).flatMap((section) => [
    `## ${section.title}`,
    "",
    ...section.paragraphs,
    ...section.bullets.map((item) => `- ${item}`),
    ...section.faq.map((item) => `- ${item.question} ${item.answer}`),
    "",
  ]) ?? []),
].join("\n").trim();
const grounding = validateGrounding(`${page?.hero.headline}\n${inspectionBody}`, facts, { faqAuthorities: faqBindings });
const policy = lintCampaign({
  ...view,
  affiliateUrl: VALIDATION_SAFE_AFFILIATE,
  body: inspectionBody,
  pageComposition: null,
  sourceFactsJson: null,
});
assert(policy.gate === "READY", `policy gate is READY (${policy.gate})`);
assert(grounding.status === "GROUNDED", `grounding is GROUNDED (${grounding.status})`);
assert(grounding.unsupportedClaims.length === 0, `unsupported claims are 0 (${grounding.unsupportedClaims.length})`);
assert(resolvePublicationGate(stored!) === "READY", "stored lab composition publication gate stays READY");

console.log("PATCH01=PASS");
