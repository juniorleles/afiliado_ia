/**
 * One-shot persistence of the frozen V4 page and final-candidate creative plan
 * into production columns. Does not publish. Does not change the lab composition.
 */
import { getCampaignBySlug } from "../src/lib/campaigns.ts";
import { parseCreativeCompositionPlan } from "../src/lib/creative/plan.ts";
import { parsePresellPage } from "../src/lib/presell-page.ts";
import {
  PRODUCTION_PRESENTATION_ID,
  saveProductionCandidateSnapshot,
} from "../src/lib/production-candidate.ts";
import { campaignForPremiumFinalCandidate } from "../src/lib/web-anatomy-lab/premium-final-candidate-v1.ts";
import { loadExperimentCCopy } from "../src/lib/web-anatomy-lab/experiment-c.ts";

const SLUG = "joint-genesis-controlled-ready-13";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const stored = getCampaignBySlug(SLUG);
if (!stored) fail("campaign missing");
if (stored.publicationStatus !== "draft") fail("campaign is not draft");

const beforeComposition = stored.pageComposition;
const beforeCreative = stored.creativeCompositionJson;
const beforeHeadline = stored.headline;
const beforeAffiliate = stored.affiliateUrl;

const view = campaignForPremiumFinalCandidate(stored);
const page = parsePresellPage(view.pageComposition);
const creative = parseCreativeCompositionPlan(view.creativeCompositionJson);
if (!page || !creative || !view.pageComposition || !view.creativeCompositionJson) {
  fail("final candidate view did not produce a page and creative plan");
}

const copy = loadExperimentCCopy();
const visible = [
  page.hero.headline,
  page.hero.summary,
  ...page.sections.filter((section) => section.visible).flatMap((section) => [
    ...section.paragraphs,
    ...section.bullets,
    ...section.faq.flatMap((item) => [item.question, item.answer]),
  ]),
].join("\n");

const required = [copy.HEADLINE, copy.SUMMARY, copy.OVERVIEW, copy.USAGE, copy.GUARANTEE];
for (const sentence of required) {
  if (!visible.includes(sentence.trim())) fail("missing frozen sentence");
}
for (const feature of copy.FEATURES.split(/\n+/).map((line) => line.trim()).filter(Boolean)) {
  if (!visible.includes(feature)) fail("missing frozen feature");
}
const faqs = copy.FAQS.split(/\n+/).map((line) => line.trim()).filter(Boolean);
if (faqs.length !== 4) fail("V4 FAQ count is not 4");
for (const line of faqs) {
  const body = line.replace(/^FAQ\d+:\s*/, "");
  const question = body.match(/^(.+?\?)/)?.[1];
  if (!question || !visible.includes(question)) fail("missing frozen FAQ");
  if (!visible.includes(body.slice(question.length).trim())) fail("missing frozen FAQ answer");
}
if (/\bFinal Thoughts\b/.test(visible)) fail("final thoughts rendered");
if (page.sections.some((section) => section.visible && /final thoughts/i.test(section.title))) {
  fail("final thoughts section visible");
}

const usage = creative.scenes.find((scene) => scene.id === "usage");
if (!usage || usage.assetUse !== "NONE" || usage.slot !== null) fail("usage scene is not the final-candidate presentation");

if ((beforeComposition || "").includes(copy.OVERVIEW.trim())) {
  fail("stored lab composition already contains the V4 overview; refusing to blur the baseline");
}

const updated = saveProductionCandidateSnapshot(stored.id, {
  productionPageComposition: view.pageComposition,
  productionCreativeCompositionJson: view.creativeCompositionJson,
  productionPresentation: PRODUCTION_PRESENTATION_ID,
});

if (updated.publicationStatus !== "draft") fail("status changed");
if (updated.pageComposition !== beforeComposition) fail("lab composition changed");
if (updated.creativeCompositionJson !== beforeCreative) fail("lab creative changed");
if (updated.headline !== beforeHeadline) fail("stored headline changed");
if (updated.affiliateUrl !== beforeAffiliate) fail("affiliate url changed");
if (updated.productionPresentation !== PRODUCTION_PRESENTATION_ID) fail("presentation not stored");
if (!updated.productionPageComposition?.includes(copy.OVERVIEW.trim())) fail("production page missing V4");

console.log("PERSISTED=YES");
console.log("PUBLICATION_STATUS=draft");
console.log("CONTENT_SOURCE=CONTROLLED_RICH_REPLAY_V4");
console.log("VISUAL_SOURCE=PREMIUM_LP_FINAL_CANDIDATE_V1");
console.log("FACTUAL_COPY_DELTA=0");
console.log("AFFILIATE_URL_CHANGED=NO");
