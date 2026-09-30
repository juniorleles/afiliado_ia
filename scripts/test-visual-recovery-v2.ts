import { readFileSync } from "node:fs";
import path from "node:path";
import { getCampaignBySlug, getPublishedCampaignBySlug } from "../src/lib/campaigns.ts";
import { resolvePublicationGate } from "../src/lib/publication.ts";
import { applyProductionCandidate } from "../src/lib/production-candidate.ts";
import { parsePresellPage } from "../src/lib/presell-page.ts";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
let failed = 0;
function assert(cond: unknown, message: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL: " + message);
  } else {
    console.log("OK: " + message);
  }
}

const v1 = JSON.parse(read("data/production-readiness/premium-final-candidate-v2/v1-geometry.json"));
const mobile = v1.find((row: { name: string }) => row.name === "375");
const desktop = v1.find((row: { name: string }) => row.name === "1440");
const frame = v1.find((row: { name: string }) => row.name === "390-frame");
assert(mobile?.nestedScroll?.length > 0 || mobile?.pathological?.length > 0, "old v1 mobile failure was detected");
assert(desktop?.nestedScroll?.length > 0, "old v1 desktop nested scroll was detected");
assert((frame?.collapsed?.length ?? 0) > 0 && frame.heroTitleWidth === 0, "old fake 390 frame collapsed the hero");

const v2 = JSON.parse(read("data/production-readiness/premium-final-candidate-v2/v2-geometry.json"));
for (const row of v2) {
  if (row.mode !== "viewport") continue;
  const clean =
    !row.horizontalOverflow &&
    row.nestedScroll.length === 0 &&
    row.collapsed.length === 0 &&
    row.pathological.length === 0 &&
    row.clipped.length === 0 &&
    row.offscreen.length === 0;
  assert(clean, `v2 geometry ${row.name}`);
}

const css = read("src/app/premium-final-candidate-v2.css");
assert(!css.includes("50vw"), "v2 does not use viewport-half padding");
assert(!css.includes("18ch"), "v2 does not cap titles at 18ch");
assert(!css.includes("minmax(24rem"), "v2 does not reserve a 24rem hero column");
const frameSrc = read("src/components/presell/preview-frame.tsx");
assert(frameSrc.includes("disableAffiliateNavigation"), "preview still blocks affiliate navigation");
assert(!frameSrc.includes("overflow-x-auto"), "preview frame no longer creates a nested scrollport");
assert(!frameSrc.includes("overflow-hidden"), "preview frame no longer clips the page");
assert(read("src/app/premium-final-candidate-public.css").includes("calc(50vw - 36rem)"), "historical v1 CSS is preserved");

const stored = getCampaignBySlug("joint-genesis-controlled-ready-13");
assert(stored?.publicationStatus === "draft", "campaign remains draft");
assert(stored?.productionPresentation === "premium-final-candidate-v2", "live presentation is v2");
assert(getPublishedCampaignBySlug("joint-genesis-controlled-ready-13") === undefined, "public lookup stays empty");
assert(resolvePublicationGate(stored!) === "READY", "publication gate stays READY");
const page = parsePresellPage(applyProductionCandidate(stored!).pageComposition);
const visible = JSON.stringify(page);
assert(visible.includes("Joint Genesis uses five targeted ingredients to support lubrication, flexibility and comfortable movement."), "frozen summary remains");
assert(visible.includes("Take one capsule daily with water, preferably in the morning."), "frozen usage remains");
assert(visible.includes("The seller publishes a 180-day return policy measured from the order date."), "frozen return policy remains");
assert((page?.sections.find((section) => section.id === "faq")?.faq.length ?? 0) === 4, "four FAQs remain");
assert(!page?.omitted.some((item) => item.component === "Final Thoughts" && item.reason !== "NOT_IN_VARIANT"), "final thoughts stay omitted");
const hop = stored?.affiliateUrl ?? "";
assert(hop.endsWith(".hop.clickbank.net") && !hop.includes("extclid="), "stored hop host unchanged and has no hardcoded extclid");

if (failed) {
  console.error("VISUAL_RECOVERY_CHECKS=" + failed);
  process.exit(1);
}
console.log("VISUAL_RECOVERY_CHECKS=PASS");
