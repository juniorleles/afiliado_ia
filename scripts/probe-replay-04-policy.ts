/** Read-only probe: exact policy evidence for the Replay 04 copy. */
import { readFileSync } from "node:fs";
import { lintCampaign } from "../src/lib/policy-linter.ts";
import { VALIDATION_SAFE_AFFILIATE } from "../src/lib/validation/constants.ts";

const gate = JSON.parse(readFileSync("data/generic-lp-engine/v1/prodentim-replay-04/content-gate.json", "utf8")) as {
  copy: { headline: string; body: string };
  ctaLabel: string;
};

const result = lintCampaign({
  id: 0,
  name: "ProDentim",
  slug: "generic-lp-engine-replay",
  headline: gate.copy.headline,
  body: gate.copy.body,
  ctaLabel: gate.ctaLabel,
  affiliateUrl: VALIDATION_SAFE_AFFILIATE,
  headScript: null,
  adHeadline: null,
  publicationStatus: "draft",
  publishedAt: null,
  createdAt: "",
  updatedAt: "",
  pageTemplate: null,
  pageComposition: null,
  productImageSrc: null,
  productImageProvenance: null,
  subheadline: null,
  sourceFactsJson: null,
} as never);

console.log("GATE=" + result.gate);
for (const finding of result.findings) {
  console.log(`${finding.status.toUpperCase()} ${finding.ruleId} evidence=${JSON.stringify(finding.evidence ?? "")}`);
}
