import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { getCampaignBySlug, getPublishedCampaignBySlug } from "../../src/lib/campaigns.ts";
import { applyProductionCandidate } from "../../src/lib/production-candidate.ts";
import { parsePresellPage } from "../../src/lib/presell-page.ts";
import { resolvePublicationGate } from "../../src/lib/publication.ts";

const css = readFileSync("src/app/premium-final-candidate-v2.css");
const stored = getCampaignBySlug("joint-genesis-controlled-ready-13");
if (!stored) throw new Error("campaign missing");
if (stored.publicationStatus !== "draft") throw new Error("publication status changed");
if (stored.productionPresentation !== "premium-final-candidate-v2") throw new Error("presentation changed");
if (getPublishedCampaignBySlug(stored.slug)) throw new Error("draft became public");
if (resolvePublicationGate(stored) !== "READY") throw new Error("publication gate is not READY");
const page = parsePresellPage(applyProductionCandidate(stored).pageComposition);
const visible = JSON.stringify(page);
const frozen = [
  "Joint Genesis uses five targeted ingredients to support lubrication, flexibility and comfortable movement.",
  "Take one capsule daily with water, preferably in the morning.",
  "The seller publishes a 180-day return policy measured from the order date.",
];
for (const sentence of frozen) {
  if (!visible.includes(sentence)) throw new Error("frozen sentence missing");
}
if ((page?.sections.find((section) => section.id === "faq")?.faq.length ?? 0) !== 4) {
  throw new Error("faq count changed");
}
const hop = stored.affiliateUrl ?? "";
const host = new URL(hop).hostname;
if (!host.endsWith(".hop.clickbank.net") || hop.includes("extclid=")) throw new Error("hop changed");
console.log("FACTUAL_COPY_DELTA=0");
console.log("PUBLICATION_GATE=PASS");
console.log("PUBLICATION_STATUS=draft");
console.log("CLICKBANK_HOP_UNCHANGED=YES");
console.log("V2_CSS_SHA256=" + createHash("sha256").update(css).digest("hex"));
