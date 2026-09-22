// npx tsx scripts/run-visual-qa-prodentim.ts
import { getCampaignBySlug } from "../src/lib/campaigns.ts";
import { getDb } from "../src/lib/db.ts";
import { analyticsSkipHeaders } from "../src/lib/analytics.ts";
import { runVisualQaForSlug, visualQaBaseUrl } from "../src/lib/visual-qa/run.ts";
import { lintCampaign } from "../src/lib/policy-linter.ts";
import { composePublicationGate, validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import { consumerVisibleText, parsePresellPage } from "../src/lib/presell-page.ts";
import type { ProductFacts } from "../src/lib/product-facts.ts";

const SLUG = "prodentim-page-builder-v2";

function count(sql: string, id: number): number {
  const row = getDb().prepare(sql).get(id) as { n: number };
  return row.n;
}

function contentGate(campaign: ReturnType<typeof getCampaignBySlug>) {
  if (!campaign) return null;
  let gate = lintCampaign(campaign).gate;
  if (campaign.sourceFactsJson) {
    const facts = JSON.parse(campaign.sourceFactsJson) as ProductFacts;
    const page = parsePresellPage(campaign.pageComposition);
    const copy = page
      ? consumerVisibleText(page)
      : `${campaign.headline}\n${campaign.body}\n${campaign.ctaLabel}`;
    gate = composePublicationGate(gate, validateGrounding(copy, facts).status);
  }
  return gate;
}

async function fetchPage(urlPath: string) {
  const base = visualQaBaseUrl();
  const res = await fetch(`${base}${urlPath}`, {
    redirect: "manual",
    headers: analyticsSkipHeaders(),
  });
  return { status: res.status, body: await res.text() };
}

async function main() {
  const campaign = getCampaignBySlug(SLUG);
  if (!campaign) {
    throw new Error(`Missing draft ${SLUG}`);
  }
  const gateBefore = contentGate(campaign);
  const visitsBefore = count("SELECT COUNT(*) AS n FROM presell_visits WHERE campaignId = ?", campaign.id);
  const clicksBefore = count("SELECT COUNT(*) AS n FROM cta_clicks WHERE campaignId = ?", campaign.id);

  const preview = await fetchPage(`/admin/preview/${SLUG}`);
  const frame = await fetchPage(`/visual-frame/${SLUG}`);
  const pub = await fetchPage(`/p/${SLUG}`);
  if (preview.status !== 200) throw new Error(`preview HTTP ${preview.status}`);
  if (frame.status !== 200) throw new Error(`visual-frame HTTP ${frame.status}`);
  if (pub.status !== 404) throw new Error(`public URL expected 404, got ${pub.status}`);
  if (frame.body.includes('id="presell-pixel"')) throw new Error("pixel fired on visual-frame");
  if (!frame.body.includes("data-visual-qa-frame")) throw new Error("visual-frame marker missing");

  const report = await runVisualQaForSlug(SLUG, true);
  const after = getCampaignBySlug(SLUG);
  const gateAfter = contentGate(after);
  const visitsAfter = count("SELECT COUNT(*) AS n FROM presell_visits WHERE campaignId = ?", campaign.id);
  const clicksAfter = count("SELECT COUNT(*) AS n FROM cta_clicks WHERE campaignId = ?", campaign.id);

  if (after?.publicationStatus !== "draft") throw new Error("campaign did not remain DRAFT");
  if (gateAfter !== gateBefore) throw new Error(`content gate changed ${gateBefore} → ${gateAfter}`);
  if (visitsAfter !== visitsBefore) throw new Error("PAGE_VIEW contamination");
  if (clicksAfter !== clicksBefore) throw new Error("CTA click contamination");
  if (report.status === "PASS") throw new Error("Visual QA must not PASS this negative baseline");

  const blob = JSON.stringify(report);
  const codes = new Set(report.recommendedFixes.map((f) => f.actionCode));
  const expected = [
    "PROMOTE_PRODUCT_VISUAL",
    "ACQUIRE_PRODUCT_IMAGE",
    "REDUCE_CARD_REPETITION",
    "REDUCE_VISIBLE_CONTENT_DENSITY",
    "COLLAPSE_SECONDARY_DETAILS",
    "INCREASE_SECTION_VARIATION",
    "IMPROVE_PROGRESSIVE_DISCLOSURE",
  ];
  const hit = expected.filter((code) => codes.has(code) || blob.includes(code));
  if (hit.length < 4) {
    throw new Error(`baseline too weak, codes=${[...codes].join(",")}`);
  }

  console.log(
    JSON.stringify(
      {
        slug: SLUG,
        publicationStatus: after?.publicationStatus,
        contentGate: gateAfter,
        visualGate: report.status,
        aiVisualReview: report.aiVisualReview,
        highPriority: report.highPriority.map((f) => ({
          severity: f.severity,
          viewport: f.viewport,
          category: f.category,
          actionCode: f.actionCode,
          description: f.description,
        })),
        recommendedFixes: report.recommendedFixes,
        mobile: report.viewportReports
          .filter((v) => v.width <= 430)
          .flatMap((v) => v.deterministicFindings.filter((f) => f.severity !== "INFO"))
          .map((f) => `${f.actionCode}: ${f.description}`),
        desktop: report.viewportReports
          .filter((v) => v.width >= 1024)
          .flatMap((v) => v.deterministicFindings.filter((f) => f.severity !== "INFO"))
          .map((f) => `${f.actionCode}: ${f.description}`),
        technical: report.technical,
        visitsBefore,
        visitsAfter,
        clicksBefore,
        clicksAfter,
        publicStatus: pub.status,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
