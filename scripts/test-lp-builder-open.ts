// npx tsx scripts/test-lp-builder-open.ts
import os from "node:os";
import path from "node:path";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { composeCandidateFromVariant } from "../src/lib/validation/pipeline.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FALHOU: ${message}`);
  console.log(`OK: ${message}`);
}

const dbFile = path.join(os.tmpdir(), `lp-open-${Date.now()}.db`);
process.env.PRESELL_OS_DB = dbFile;

async function main() {
  const { resetDbForTests } = await import("../src/lib/db.ts");
  resetDbForTests();
  const { createValidationRun } = await import("../src/lib/validation/store.ts");
  const { insertValidationCandidate } = await import("../src/lib/validation/store.ts");
  const { openBuilderForCandidate } = await import("../src/lib/lp-builder/open-campaign.ts");
  const { getCampaignById } = await import("../src/lib/campaigns.ts");
  const { builderEditorState } = await import("../src/lib/lp-content-render.ts");
  const facts = emptyProductFacts("Harbor Kettle", "https://example.test/kettle", "MANUAL");
  facts.description = "A kettle with a measured spout and a wide base.";
  const run = createValidationRun("builder-open");
  const candidate = insertValidationCandidate(composeCandidateFromVariant({
    runId: run.id,
    productKey: "harbor",
    facts,
    approach: "REVIEW",
    headline: "Harbor Kettle review",
    body: "A kettle with a measured spout and a wide base.",
    ctaLabel: "See current offer",
  }));
  const opened = openBuilderForCandidate(candidate.id);
  assert(opened.ok, "a generated candidate opens the builder");
  if (!opened.ok) return;
  const again = openBuilderForCandidate(candidate.id);
  assert(again.ok && again.campaignId === opened.campaignId, "opening the builder again uses the same draft");
  const campaign = getCampaignById(opened.campaignId);
  assert(campaign?.publicationStatus === "draft", "the builder draft is not published");
  assert(Boolean(campaign?.pageComposition), "the generated page composition is loaded");
  const state = builderEditorState(campaign!);
  assert(state.fields.some((field) => field.id === "hero.headline" && field.generated === "Harbor Kettle review"), "the content editor loads the generated headline");
  assert(openBuilderForCandidate("missing-candidate").ok === false, "an unknown candidate does not open a builder");
  console.log("LP_BUILDER_OPEN_TESTS=PASS");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
