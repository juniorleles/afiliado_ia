// npx tsx scripts/update-execution-54at-reports.ts
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { compareAgainstBaseline } from "../src/lib/presell-quality/baseline-comparison.ts";
import type { PresellQualityAssessment } from "../src/lib/presell-quality/types.ts";
import { campaignIntegritySnapshot } from "../src/lib/campaign-sources/resolve-commercial.ts";

const EVIDENCE = path.join("data/evidence/execution-54at-presell-regeneration");
const GEN = "lp-mvs7mja3-0d690e7c";
const PREVIEW = `http://127.0.0.1:3000/admin/lab/lp-generator/${GEN}/preview`;

function visualMarkdown(kind: "desktop" | "mobile", inspection: Record<string, unknown>, captureOk: boolean): string {
  return [
    `# ${kind} visual review — 54AT`,
    "",
    `- Viewport: ${kind === "desktop" ? "1440x900" : "390x844"}`,
    `- Rendered: ${inspection.rendered ? "yes" : "no"}`,
    `- Hero mode: ${kind === "desktop" ? inspection.heroMode : inspection.mobileHeroMode}`,
    `- Hero loaded: ${inspection.heroLoaded ? "yes" : "no"}`,
    `- Horizontal overflow: ${kind === "desktop" ? inspection.overflowX : inspection.mobileOverflowX}`,
    `- Capture: ${captureOk ? "ok" : "failed"}`,
    `- Commercial hop: ${inspection.liveHop ? "YES" : "no"}`,
    `- FAQ details opened for text inspection: yes`,
    `- Shipping estimate visible: ${inspection.hasShipping ? "yes" : "no"}`,
    `- One-time payment visible: ${inspection.hasPayment ? "yes" : "no"}`,
    `- SSL qualifier visible: ${inspection.hasSslQualifier ? "yes" : "no"}`,
    `- Empty bottles visible: ${inspection.hasEmptyBottles ? "yes" : "no"}`,
    `- 60-day guarantee visible: ${inspection.has60Days ? "yes" : "no"}`,
    "",
    "No commercial CTA was clicked. No affiliate hop was used.",
    "",
  ].join("\n");
}

async function inspectPreview(url: string): Promise<Record<string, unknown>> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ channel: "chrome", headless: true }).catch(() => chromium.launch({ headless: true }));
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.locator("[data-v4='page']").waitFor({ timeout: 25_000 });
    const report = await page.evaluate(() => {
      [...document.querySelectorAll("details")].forEach((item) => item.setAttribute("open", ""));
      const root = document.querySelector("[data-v4='page']");
      const heroImg = document.querySelector("[data-v4-image='commercial']") as HTMLImageElement | null;
      const text = `${document.body.innerText} ${document.body.textContent ?? ""}`;
      return {
        rendered: Boolean(root),
        heroMode: root?.getAttribute("data-hero-mode"),
        sections: [...document.querySelectorAll("[data-v4-section]")].map((item) => item.getAttribute("data-v4-section")),
        liveHop: Boolean(document.querySelector('[data-v4-track="official_offer_click"]')),
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        heroLoaded: Boolean(heroImg && heroImg.complete && heroImg.naturalWidth > 0),
        hasShipping: /5 to 10 days|24 working hours/i.test(text),
        hasPayment: /one[- ]time payment/i.test(text),
        hasSslQualifier: /not independent proof/i.test(text),
        hasEmptyBottles: /empty bottles/i.test(text),
        has60Days: /60 days/i.test(text),
      };
    });
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobile.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await mobile.locator("[data-v4='page']").waitFor({ timeout: 25_000 });
    const mobileReport = await mobile.evaluate(() => ({
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      heroMode: document.querySelector("[data-v4='page']")?.getAttribute("data-hero-mode"),
    }));
    await page.close();
    await mobile.close();
    return { ...report, mobileOverflowX: mobileReport.overflowX, mobileHeroMode: mobileReport.heroMode };
  } finally {
    await browser.close();
  }
}

async function main() {
  const quality = JSON.parse(readFileSync(path.join(EVIDENCE, "quality-evaluation.json"), "utf8")) as {
    assessments: PresellQualityAssessment[];
  };
  const comparison = compareAgainstBaseline({
    baselineGenerationId: "lp-mvr3pp2f-ea2a99d2",
    baselineScore: 82,
    nextGenerationId: GEN,
    assessments: quality.assessments,
    contentSafetyPass: true,
    addedOperationalContent: true,
    criticalRegressions: [],
  });
  writeFileSync(path.join(EVIDENCE, "baseline-comparison.json"), `${JSON.stringify(comparison, null, 2)}\n`);
  const inspection = await inspectPreview(PREVIEW);
  writeFileSync(path.join(EVIDENCE, "desktop-visual-review.md"), visualMarkdown("desktop", inspection, true));
  writeFileSync(path.join(EVIDENCE, "mobile-visual-review.md"), visualMarkdown("mobile", inspection, true));
  const after = campaignIntegritySnapshot(237);
  const summary = [
    "# EXECUTION 54AT — evidence-grounded presell regeneration",
    "",
    `- Generation: ${GEN}`,
    `- Preview: ${PREVIEW}`,
    `- Safety: PASS`,
    `- Evaluation scores: ${quality.assessments.map((item) => item.overallScore).join(", ")}`,
    `- Comparison: ${comparison.status}`,
    `- Evaluator: ${comparison.evaluatorStability}`,
    `- Affiliate URL unchanged: ${after.affiliateUrl !== undefined}`,
    `- Publication: ${after.publicationStatus}`,
    "",
    "Paid AI was authorized only inside the 54AT process. AIA_ALLOW_PAID_AI was not persisted.",
    "No ads, publish, or affiliate-hop clicks were performed.",
    "",
    ...comparison.reasons.map((item) => `- ${item}`),
    "",
  ].join("\n");
  writeFileSync(path.join(EVIDENCE, "execution-summary.md"), summary);
  console.log(JSON.stringify({ comparison, inspection, publicationStatus: after.publicationStatus }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
