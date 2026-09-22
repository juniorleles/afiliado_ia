import fs from "node:fs";
import path from "node:path";
import { getCampaignBySlug, type Campaign } from "@/lib/campaigns";
import { resolvePublicationGate } from "@/lib/publication";
import { inspectRenderedPresell } from "@/lib/visual-qa/browser";
import { analyzeLayoutSnapshot, uniqueRecommendedFixes } from "@/lib/visual-qa/deterministic";
import { composeVisualQaGate, highPriorityFindings } from "@/lib/visual-qa/gate";
import { runMultimodalVisualReview } from "@/lib/visual-qa/multimodal";
import { saveVisualQaReport } from "@/lib/visual-qa/store";
import { technicalAuditFromSnapshots } from "@/lib/visual-qa/technical";
import {
  TARGET_VISUAL_STANDARD,
  type VisualQaFinding,
  type VisualQaReport,
  type ViewportReport,
} from "@/lib/visual-qa/types";

export function visualQaBaseUrl(): string {
  loadLocalEnv();
  return (process.env.VISUAL_QA_BASE_URL || process.env.PHASE1_BASE_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

function loadLocalEnv() {
  if (process.env.ANTHROPIC_API_KEY) return;
  try {
    const text = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx < 1) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // .env.local is optional for unit tests.
  }
}

export function snapshotContentGate(campaign: Campaign): string {
  return resolvePublicationGate(campaign);
}

export function composeVisualQaReport(input: {
  campaign: Campaign;
  viewportReports: ViewportReport[];
  visualFindings: VisualQaFinding[];
  aiVisualReview: VisualQaReport["aiVisualReview"];
  technical: VisualQaReport["technical"];
  extraFindings?: VisualQaFinding[];
}): VisualQaReport {
  const deterministicFindings = [
    ...input.viewportReports.flatMap((vp) => vp.deterministicFindings),
    ...(input.extraFindings ?? []),
  ];
  const visualFindings = Array.isArray(input.visualFindings) ? input.visualFindings : [];
  const all = [...deterministicFindings, ...visualFindings];
  const status = composeVisualQaGate({
    findings: all,
    aiVisualReview: input.aiVisualReview,
  });
  return {
    version: 1,
    targetStandard: TARGET_VISUAL_STANDARD,
    status,
    contentGate: snapshotContentGate(input.campaign),
    publicationStatus: input.campaign.publicationStatus,
    template: input.campaign.pageTemplate || "REVIEW",
    campaignId: input.campaign.id,
    slug: input.campaign.slug,
    createdAt: new Date().toISOString(),
    aiVisualReview: input.aiVisualReview,
    viewportReports: input.viewportReports,
    deterministicFindings,
    visualFindings,
    technical: input.technical,
    recommendedFixes: uniqueRecommendedFixes(all),
    highPriority: highPriorityFindings(all),
  };
}

export async function runVisualQaForSlug(slug: string, persist = true): Promise<VisualQaReport> {
  loadLocalEnv();
  const campaign = getCampaignBySlug(slug);
  if (!campaign) {
    throw new Error(`Campaign not found: ${slug}`);
  }

  const inspection = await inspectRenderedPresell({
    slug: campaign.slug,
    baseUrl: visualQaBaseUrl(),
  });

  const template = campaign.pageTemplate || "REVIEW";
  const viewportReports: ViewportReport[] = inspection.captures.map((capture) => ({
    viewport: `${capture.viewport.width}x${capture.viewport.height}`,
    width: capture.viewport.width,
    height: capture.viewport.height,
    snapshot: capture.snapshot,
    deterministicFindings: analyzeLayoutSnapshot(capture.snapshot, template),
    screenshotFiles: capture.screenshotFiles,
  }));

  const snapshots = inspection.captures.map((c) => c.snapshot);
  const { audit, findings: technicalFindings } = technicalAuditFromSnapshots(snapshots);

  const payloads = inspection.captures.flatMap((c) => c.payloads);
  const ai = await runMultimodalVisualReview({
    template,
    snapshots: snapshots.filter((_, i) => inspection.captures[i]?.viewport.captureScreenshots),
    screenshots: payloads,
  });

  const report = composeVisualQaReport({
    campaign,
    viewportReports,
    visualFindings: ai.findings,
    aiVisualReview: ai.state,
    technical: audit,
    extraFindings: technicalFindings,
  });

  if (persist) saveVisualQaReport(report);
  return report;
}
