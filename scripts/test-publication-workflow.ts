// npx tsx scripts/test-publication-workflow.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { migrate, resetDbForTests } from "../src/lib/db.ts";
import {
  createCampaign,
  deleteCampaign,
  duplicateCampaign,
  getCampaignBySlug,
  getPublishedCampaignBySlug,
  publishCampaign,
  unpublishCampaign,
  updateCampaign,
  type CampaignInput,
} from "../src/lib/campaigns.ts";
import { composePresellPage, serializePresellPage, consumerVisibleText } from "../src/lib/presell-page.ts";
import { decidePublish, isPublishableContentGate, tryPublish } from "../src/lib/publication.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { lintCampaign } from "../src/lib/policy-linter.ts";
import { analyticsSkipHeaders } from "../src/lib/analytics.ts";
import type { Campaign } from "../src/lib/campaigns.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function joinSrc(rel: string): string {
  return path.join(process.cwd(), rel);
}

const FACTUAL_BODY = `This winter jacket is a mid-weight insulated layer for daily cold weather. It is not a medical device and this page does not promise an extraordinary outcome.

## What Is The XT-200?

A synthetic-fill coat meant for walking and commuting when temperatures drop. It is a clothing product, not a treatment.

## Key Features

- Insulated core for ordinary winter days
- Machine-washable outer shell
- Standard front zipper and pockets

## Who May Consider It?

People who want a practical winter coat for short outdoor trips, school runs, or a cold commute.

## Things to Consider

Fit can run large. Check the merchant size chart before you buy. Weather protection depends on what you wear underneath.

## FAQ

- Does it replace a technical mountaineering suit? No. It is a daily winter jacket.
- Can I machine wash it? The product information describes a washable shell.

## Final Thoughts

A straightforward option if you need warmth for ordinary winter days and you already like this silhouette.
`;

function input(overrides: Partial<CampaignInput> = {}): CampaignInput {
  return {
    name: "Phase 2.5 test",
    slug: "phase25-unit-campaign",
    headline: "Winter Jacket XT-200 Review: Does It Actually Keep You Warm?",
    body: FACTUAL_BODY,
    ctaLabel: "Check current price",
    affiliateUrl: "https://example.com/hop",
    headScript: null,
    adHeadline: null,
    ...overrides,
  };
}

function jacketFactsJson(overrides: (facts: ReturnType<typeof emptyProductFacts>) => void = () => undefined) {
  const facts = emptyProductFacts("Winter Jacket XT-200", "https://example.com/jacket", "MANUAL");
  facts.description = FACTUAL_BODY;
  facts.confidence.description = "DIRECT_SOURCE";
  facts.features = [
    "Insulated core for ordinary winter days",
    "Machine-washable outer shell",
    "Standard front zipper and pockets",
  ];
  facts.confidence.features = "DIRECT_SOURCE";
  facts.importQuality = "SUFFICIENT";
  overrides(facts);
  return JSON.stringify(facts);
}

function asCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 1,
    publicationStatus: "draft",
    publishedAt: null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...input(),
    sourceFactsJson: jacketFactsJson(),
    ...overrides,
  };
}

// --- gate (no DB) ---

assert(decidePublish("READY", false) === "allow", "READY can publish");
assert(decidePublish("BLOCKED", false) === "block", "BLOCKED cannot publish");
assert(decidePublish("BLOCKED", true) === "block", "BLOCKED ignores confirmWarnings");
assert(decidePublish("REVIEW_REQUIRED", false) === "confirm", "REVIEW_REQUIRED still surfaces a confirmation workflow");
assert(decidePublish("REVIEW_REQUIRED", true) === "confirm", "TEST H: confirmWarnings does not allow REVIEW_REQUIRED");
assert(isPublishableContentGate("READY") === true, "only READY is publishable");
assert(isPublishableContentGate("REVIEW_REQUIRED") === false, "REVIEW_REQUIRED is not publishable");

const readyVerdict = tryPublish(asCampaign({}), false);
assert(readyVerdict.ok && readyVerdict.gate === "READY", "READY campaign tryPublish ok");

const blockedVerdict = tryPublish(asCampaign({ headline: "Miracle jacket cures arthritis" }), true);
assert(!blockedVerdict.ok && blockedVerdict.gate === "BLOCKED", "BLOCKED campaign cannot publish even with confirm");

const warnCampaign = asCampaign({
  body: "## Benefits\n\n- Warm enough for a cold morning walk downtown.\n\n## FAQ\n\n- Is it a winter jacket? Yes, that is the product type.",
  sourceFactsJson: jacketFactsJson((facts) => {
    facts.description = "Warm enough for a cold morning walk downtown. It is a winter jacket.";
    facts.confidence.description = "DIRECT_SOURCE";
  }),
});
assert(lintCampaign(warnCampaign).gate === "REVIEW_REQUIRED", "thin-but-valid copy is REVIEW_REQUIRED");
const warnNoConfirm = tryPublish(warnCampaign, false);
assert(!warnNoConfirm.ok && warnNoConfirm.needsConfirmation === true, "REVIEW_REQUIRED requires explicit confirmation");
const warnConfirm = tryPublish(warnCampaign, true);
assert(!warnConfirm.ok, "TEST H: REVIEW_REQUIRED with confirmWarnings cannot publish");
assert(warnConfirm.gate === "REVIEW_REQUIRED", "TEST H: gate stays REVIEW_REQUIRED, not READY");

const ungroundedFacts = {
  productName: "Sample Product",
  sourceUrl: "https://example.com/p",
  origin: "IMPORTED",
  features: [],
  ingredientsOrComponents: [],
  usageInformation: [],
  cautions: [],
  sourceSnippets: [],
  importWarnings: [],
  productImageProvenance: "NOT_FOUND",
  confidence: {
    productName: "DIRECT_SOURCE",
    description: "DIRECT_SOURCE",
    features: "NOT_FOUND",
    ingredientsOrComponents: "NOT_FOUND",
    usageInformation: "NOT_FOUND",
    cautions: "NOT_FOUND",
    pricingInformation: "NOT_FOUND",
    guaranteeInformation: "NOT_FOUND",
    manufacturer: "NOT_FOUND",
  },
  importQuality: "PARTIAL",
  description: "180-day vendor",
};
const ungroundedCampaign = asCampaign({
  headline: "Sample Product Review",
  body: FACTUAL_BODY + "\n\nThis product has a 180-day refund policy.",
  sourceFactsJson: JSON.stringify(ungroundedFacts),
});
const ungroundedPublish = tryPublish(ungroundedCampaign, true);
assert(!ungroundedPublish.ok, "TEST P: UNGROUNDED copy cannot auto-publish even with confirmWarnings");
assert(ungroundedPublish.gate !== "READY", "TEST P: UNGROUNDED CONTENT_GATE != READY");
assert(ungroundedPublish.gate === "BLOCKED", "TEST P: UNGROUNDED prefers BLOCKED");

const composedUnsupportedFacts = emptyProductFacts("Oral Tablet Example", "https://example.com/p", "IMPORTED");
composedUnsupportedFacts.description = "a chewable tablet";
composedUnsupportedFacts.confidence.description = "DIRECT_SOURCE";
const composedUnsupported = composePresellPage({
  variant: {
    approach: "REVIEW",
    headline: "Tablet notes",
    body: "A chewable tablet.\n\nResearch suggests many dental problems begin when the mouth's microbial balance shifts.\n",
    ctaLabel: "Learn More",
  },
  facts: composedUnsupportedFacts,
  template: "REVIEW",
});
assert(consumerVisibleText(composedUnsupported).includes("Research suggests"), "TEST J: composed copy retains unsupported sentence");
const composedPublish = tryPublish(
  asCampaign({
    headline: composedUnsupported.hero.headline,
    body: consumerVisibleText(composedUnsupported),
    ctaLabel: composedUnsupported.ctaLabel,
    pageComposition: serializePresellPage(composedUnsupported),
    sourceFactsJson: JSON.stringify(composedUnsupportedFacts),
  }),
  true,
);
assert(!composedPublish.ok, "TEST J: post-composition unsupported copy cannot publish");
assert(composedPublish.gate === "BLOCKED", "TEST J: publication BLOCKS unsupported composed copy");

const reviewRequiredPublish = tryPublish(warnCampaign, false);
assert(!reviewRequiredPublish.ok, "REVIEW_REQUIRED cannot auto-publish");

const missingFacts = tryPublish(asCampaign({ sourceFactsJson: null }), true);
assert(!missingFacts.ok, "TEST I: sourceFactsJson missing cannot publish");
assert(missingFacts.gate === "BLOCKED", "TEST I: SOURCE_FACTS_MISSING_GATE=BLOCKED");

// --- source guards ---

const actionsSrc = readFileSync(joinSrc("src/app/admin/actions.ts"), "utf8");
assert(actionsSrc.includes("tryPublish"), "publish action consumes tryPublish (linter gate)");
assert(actionsSrc.includes("createCampaign(input)"), "create action still uses createCampaign");
assert(
  !/createCampaign\([\s\S]*publishCampaign/.test(actionsSrc.split("export async function createCampaignAction")[1]?.split("export async function")[0] ?? ""),
  "createCampaignAction does not publish",
);

const generateSrc = readFileSync(joinSrc("src/app/admin/generate/generate-client.tsx"), "utf8");
assert(generateSrc.includes("DRAFT"), "AI flow tells the operator the campaign is DRAFT");
assert(generateSrc.includes("createCampaignAction"), "AI create uses the same create action");
assert(!generateSrc.includes("publishCampaign"), "AI client does not call publish");
assert(generateSrc.includes("DIAGNOSTIC PREVIEW"), "TEST G: BLOCKED composition is diagnostic, not approved");
assert(generateSrc.includes("Continue to draft form"), "BLOCKED may still save an internal draft");

assert(actionsSrc.includes("const verdict = tryPublish(campaign, confirmWarnings);"), "TEST N: production publish calls tryPublish");
assert(actionsSrc.includes("if (!verdict.ok)"), "TEST N: production publish refuses when tryPublish fails");
assert(actionsSrc.includes("publishCampaign(id);"), "TEST N: persistence runs only after tryPublish");

const panelSrc = readFileSync(joinSrc("src/app/admin/publish-panel.tsx"), "utf8");
assert(!panelSrc.includes("Publish anyway"), "TEST H: UI does not offer publish-anyway for REVIEW_REQUIRED");

const publicSrc = readFileSync(joinSrc("src/app/p/[slug]/page.tsx"), "utf8");
assert(publicSrc.includes("getPublishedCampaignBySlug"), "public route only loads published campaigns");
assert(!publicSrc.includes("PREVIEW — NOT PUBLISHED"), "public page has no preview unpublished banner");

const previewSrc = readFileSync(joinSrc("src/app/admin/preview/[slug]/page.tsx"), "utf8");
assert(previewSrc.includes("PREVIEW — NOT PUBLISHED"), "draft preview shows PREVIEW — NOT PUBLISHED");
assert(previewSrc.includes("getCampaignBySlug"), "preview loads draft or published by slug");
assert(
  previewSrc.includes("<PreviewFrame campaign={campaign} />") &&
    !previewSrc.includes("renderPixel={") &&
    !previewSrc.includes("trackClicks"),
  "preview renders CampaignTemplate without renderPixel",
);

// --- migration on a temp copy of the OLD schema ---

const tmpOld = path.join(os.tmpdir(), `afiliado-ia-phase25-old-${process.pid}.db`);
if (fs.existsSync(tmpOld)) fs.unlinkSync(tmpOld);

const oldDb = new Database(tmpOld);
oldDb.exec(`
  CREATE TABLE campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    headline TEXT NOT NULL,
    body TEXT NOT NULL,
    ctaLabel TEXT NOT NULL,
    affiliateUrl TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
`);
const stamp = "2026-01-02T00:00:00.000Z";
oldDb
  .prepare(
    `INSERT INTO campaigns (name, slug, headline, body, ctaLabel, affiliateUrl, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  .run("Existing", "existing-live-slug", "H", "B", "CTA", "https://example.com/hop", stamp, stamp);
migrate(oldDb);
const migrated = oldDb.prepare("SELECT publicationStatus, publishedAt FROM campaigns WHERE slug = ?").get("existing-live-slug") as {
  publicationStatus: string;
  publishedAt: string | null;
};
assert(migrated.publicationStatus === "published", "existing campaigns migrate to published");
assert(migrated.publishedAt === stamp, "existing publishedAt backfilled from createdAt");
oldDb.close();
try {
  fs.unlinkSync(tmpOld);
} catch {
  /* Windows may keep a lock briefly */
}

// --- campaign CRUD on an isolated temp DB ---

const tmpNew = path.join(os.tmpdir(), `afiliado-ia-phase25-new-${process.pid}.db`);
if (fs.existsSync(tmpNew)) fs.unlinkSync(tmpNew);
process.env.PRESELL_OS_DB = tmpNew;
resetDbForTests();

const created = createCampaign(input({ slug: "phase25-new-draft" }));
assert(created.publicationStatus === "draft", "new campaign defaults to draft");
assert(created.publishedAt === null, "new campaign has no publishedAt");
assert(getPublishedCampaignBySlug("phase25-new-draft") === undefined, "draft is not a published slug");
assert(getCampaignBySlug("phase25-new-draft")?.id === created.id, "draft is still loadable by slug for preview");

const published = publishCampaign(created.id);
assert(published.publicationStatus === "published", "publish sets published");
assert(typeof published.publishedAt === "string" && published.publishedAt.length > 0, "publish sets publishedAt");
assert(getPublishedCampaignBySlug("phase25-new-draft")?.id === created.id, "published slug is public");

const edited = updateCampaign(created.id, input({ slug: "phase25-new-draft", name: "Edited name" }));
assert(edited.publicationStatus === "draft", "editing published campaign → draft");
assert(edited.publishedAt === null, "edit clears publishedAt");
assert(getPublishedCampaignBySlug("phase25-new-draft") === undefined, "edited live page is no longer public");

publishCampaign(created.id);
const copy = duplicateCampaign(created.id);
assert(copy.publicationStatus === "draft", "duplicating published campaign → draft");
assert(copy.slug === "phase25-new-draft-copy", "duplicate keeps -copy slug behavior");
assert(getCampaignBySlug("phase25-new-draft")?.publicationStatus === "published", "duplicate does not unpublish the source");

unpublishCampaign(created.id);
assert(getCampaignBySlug("phase25-new-draft")?.publicationStatus === "draft", "unpublish → draft");
assert(getPublishedCampaignBySlug("phase25-new-draft") === undefined, "unpublished slug is not public");
assert(getCampaignBySlug("phase25-new-draft") !== undefined, "unpublish does not delete the campaign");

const aiCreated = createCampaign(input({ name: "AI path", slug: "phase25-ai-draft" }));
assert(aiCreated.publicationStatus === "draft", "AI-created campaign (createCampaign) → draft");

resetDbForTests();
delete process.env.PRESELL_OS_DB;
try {
  fs.unlinkSync(tmpNew);
} catch {
  /* ignore */
}

// --- HTTP against the running app (production SQLite, unique slugs, cleaned up) ---

const base = (process.env.PHASE1_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

async function fetchPage(urlPath: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${base}${urlPath}`, {
    redirect: "manual",
    headers: analyticsSkipHeaders(),
  });
  const body = await res.text();
  return { status: res.status, body };
}

const ids: number[] = [];

async function main() {
  const token = String(Date.now());
  const draftSlug = `phase25-http-draft-${token}`;
  const publishedSlug = `phase25-http-pub-${token}`;

  try {
    const draft = createCampaign(
      input({
        name: "Phase 2.5 HTTP draft",
        slug: draftSlug,
        headScript: "<script>window.__phase25pixel=1</script>",
      }),
    );
    ids.push(draft.id);

    const live = createCampaign(
      input({ name: "Phase 2.5 HTTP published", slug: publishedSlug, sourceFactsJson: jacketFactsJson() }),
    );
    ids.push(live.id);
    const liveVerdict = tryPublish(live, false);
    assert(liveVerdict.ok, "HTTP fixture is READY so it can be published");
    publishCampaign(live.id);

    const unknown = await fetchPage("/p/this-slug-does-not-exist-phase25");
    assert(unknown.status === 404, `unknown campaign => 404 (veio ${unknown.status})`);

    const draftPublic = await fetchPage(`/p/${draftSlug}`);
    assert(draftPublic.status === 404, `draft campaign /p/[slug] => 404 (veio ${draftPublic.status})`);
    assert(!draftPublic.body.includes(draft.headline), "draft public 404 does not expose draft headline");
    assert(!draftPublic.body.includes("PREVIEW — NOT PUBLISHED"), "public 404 is not the admin preview banner");

    const livePublic = await fetchPage(`/p/${publishedSlug}`);
    assert(livePublic.status === 200, `published campaign /p/[slug] => 200 (veio ${livePublic.status})`);
    assert(livePublic.body.includes(live.headline), "published public page includes the headline");
    assert(!livePublic.body.includes("PREVIEW — NOT PUBLISHED"), "published public page has no preview banner");

    const draftPreview = await fetchPage(`/admin/preview/${draftSlug}`);
    assert(draftPreview.status === 200, "draft preview works");
    assert(draftPreview.body.includes("PREVIEW — NOT PUBLISHED"), "draft preview shows PREVIEW — NOT PUBLISHED");
    assert(draftPreview.body.includes(draft.headline), "draft preview shows the presell");
    assert(!draftPreview.body.includes('id="presell-pixel"'), "preview does not execute pixel");

    const livePreview = await fetchPage(`/admin/preview/${publishedSlug}`);
    assert(livePreview.status === 200, "published preview works");
    assert(!livePreview.body.includes('id="presell-pixel"'), "published preview does not execute pixel");

    unpublishCampaign(live.id);
    const afterUnpublish = await fetchPage(`/p/${publishedSlug}`);
    assert(afterUnpublish.status === 404, "after unpublish, public route is unavailable");
    const previewAfterUnpublish = await fetchPage(`/admin/preview/${publishedSlug}`);
    assert(previewAfterUnpublish.status === 200, "after unpublish, preview remains available");
  } finally {
    resetDbForTests();
    for (const id of ids) {
      try {
        deleteCampaign(id);
      } catch {
        /* already gone */
      }
    }
  }

  console.log("\nTodos os testes da Fase 2.5 (publication workflow) passaram.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
