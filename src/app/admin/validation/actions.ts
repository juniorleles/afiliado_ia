"use server";

import fs from "node:fs";
import path from "node:path";
import { requireAdmin } from "@/lib/admin-auth";
import { rateLimit } from "@/lib/rate-limit";
import { getCampaignById, listCampaigns } from "@/lib/campaigns";
import { importProductFromUrl, ImportBlockedError } from "@/lib/import-product";
import type { ProductFacts } from "@/lib/product-facts";
import type { ScreenshotPayload } from "@/lib/visual-qa/multimodal";
import { runCrossPageAiReview } from "@/lib/validation/ai-review";
import { inspectValidationCandidate } from "@/lib/validation/inspect";
import { generateCandidatesForProduct } from "@/lib/validation/pipeline";
import {
  createValidationRun,
  getValidationRun,
  listValidationCandidates,
  setHumanReview,
  updateValidationRun,
} from "@/lib/validation/store";
import { summarizeValidationRun } from "@/lib/validation/summary";
import { structuralDiversityOf } from "@/lib/validation/diversity";
import type { HumanReviewState, StructureFingerprint, ValidationProduct } from "@/lib/validation/types";
import { slugify } from "@/lib/slug";

export type LabActionResult =
  | { ok: true; id?: string; message?: string; acceptedCount?: number }
  | { ok: false; error: string; needsProductName?: boolean };

export async function createValidationRunAction(notes = ""): Promise<LabActionResult> {
  await requireAdmin();
  const run = createValidationRun(notes);
  return { ok: true, id: run.id };
}

export async function addImportedProductAction(runId: string, sourceUrl: string, productName = ""): Promise<LabActionResult> {
  await requireAdmin();
  const limited = rateLimit("validation-import", 8, 60_000);
  if (!limited.ok) return { ok: false, error: "Too many import requests." };
  const run = getValidationRun(runId);
  if (!run) return { ok: false, error: "Run not found." };
  if (run.products.length >= 5) return { ok: false, error: "Validation batch is capped at 5 operator-provided products." };
  try {
    const facts = await importProductFromUrl(sourceUrl, {
      operatorProductName: productName.trim() || undefined,
    });
    const key = `p_${slugify(facts.productName || "product")}_${run.products.length + 1}`;
    const product: ValidationProduct = {
      key,
      name: facts.productName,
      sourceUrl: facts.sourceUrl || sourceUrl,
      origin: "IMPORT",
      affiliateUrlStored: false,
      discoveryNote: facts.webDiscovery?.triggered ? facts.webDiscovery.message : undefined,
    };
    updateValidationRun(runId, { products: [...run.products, product] });
    persistFacts(runId, key, facts);
    return {
      ok: true,
      id: key,
      message: facts.webDiscovery?.message,
      acceptedCount: facts.webDiscovery?.acceptedCount,
    };
  } catch (err) {
    if (err instanceof ImportBlockedError) {
      return { ok: false, error: err.message, needsProductName: err.needsProductName };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Import failed." };
  }
}

export async function addExistingDraftAction(runId: string, campaignId: number): Promise<LabActionResult> {
  await requireAdmin();
  const run = getValidationRun(runId);
  if (!run) return { ok: false, error: "Run not found." };
  if (run.products.length >= 5) return { ok: false, error: "Validation batch is capped at 5 operator-provided products." };
  const campaign = getCampaignById(campaignId);
  if (!campaign) return { ok: false, error: "Campaign not found." };
  if (campaign.publicationStatus === "published") {
    return { ok: false, error: "Use a draft campaign. Validation must not touch published pages." };
  }
  if (!campaign.sourceFactsJson) return { ok: false, error: "Draft has no sourceFactsJson." };
  const facts = JSON.parse(campaign.sourceFactsJson) as ProductFacts;
  const key = `draft_${campaign.id}`;
  if (run.products.some((p) => p.key === key)) return { ok: false, error: "Already added." };
  const product: ValidationProduct = {
    key,
    name: facts.productName || campaign.name,
    sourceUrl: facts.sourceUrl || "",
    origin: "EXISTING_DRAFT",
    campaignId: campaign.id,
    affiliateUrlStored: false,
  };
  updateValidationRun(runId, { products: [...run.products, product] });
  persistFacts(runId, key, facts);
  return { ok: true, id: key };
}

export async function generateProductAction(runId: string, productKey: string): Promise<LabActionResult> {
  await requireAdmin();
  const limited = rateLimit("validation-generate", 6, 60_000);
  if (!limited.ok) return { ok: false, error: "Too many generation requests." };
  const run = getValidationRun(runId);
  if (!run) return { ok: false, error: "Run not found." };
  const existing = listValidationCandidates(runId);
  if (existing.length >= 15) return { ok: false, error: "Candidate cap is 15." };
  const facts = readFacts(runId, productKey);
  if (!facts) return { ok: false, error: "Product facts not stored for this key." };
  try {
    await generateCandidatesForProduct({ runId, productKey, facts });
    refreshRunSummary(runId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Generation failed." };
  }
}

export async function inspectCandidateAction(candidateId: string): Promise<LabActionResult> {
  await requireAdmin();
  const limited = rateLimit("validation-inspect", 10, 60_000);
  if (!limited.ok) return { ok: false, error: "Too many inspect requests." };
  try {
    const candidate = await inspectValidationCandidate(candidateId);
    refreshRunSummary(candidate.runId);
    return { ok: true, id: candidate.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Inspect failed." };
  }
}

export async function inspectRunAction(runId: string): Promise<LabActionResult> {
  await requireAdmin();
  const candidates = listValidationCandidates(runId);
  for (const candidate of candidates) {
    if (!candidate.pageCompositionJson) continue;
    await inspectValidationCandidate(candidate.id);
  }
  refreshRunSummary(runId);
  return { ok: true };
}

export async function crossPageReviewAction(runId: string): Promise<LabActionResult> {
  await requireAdmin();
  const candidates = listValidationCandidates(runId).filter((c) => c.fingerprint);
  const screenshots: ScreenshotPayload[] = [];
  for (const candidate of candidates.slice(0, 4)) {
    screenshots.push(...loadCandidateShots(candidate.desktopScreenshot, candidate.mobileScreenshot, candidate.id));
  }
  const review = await runCrossPageAiReview({
    fingerprints: candidates.map((c) => ({
      productName: c.productName,
      approach: c.approach,
      fingerprint: c.fingerprint as StructureFingerprint,
    })),
    screenshots,
  });
  updateValidationRun(runId, { crossPageReview: review });
  refreshRunSummary(runId);
  return { ok: true };
}

export async function humanReviewAction(
  candidateId: string,
  state: HumanReviewState,
  notes: string,
): Promise<LabActionResult> {
  await requireAdmin();
  const updated = setHumanReview(candidateId, state, notes);
  if (!updated) return { ok: false, error: "Candidate not found." };
  return { ok: true, id: updated.id };
}

export async function listDraftsForValidation(): Promise<Array<{ id: number; name: string; slug: string }>> {
  await requireAdmin();
  return listCampaigns()
    .filter((c) => c.publicationStatus !== "published" && c.sourceFactsJson)
    .map((c) => ({ id: c.id, name: c.name, slug: c.slug }));
}

function factsPath(runId: string, productKey: string): string {
  return path.join(process.cwd(), "data", "validation-lab", runId, `${productKey}.facts.json`);
}

function persistFacts(runId: string, productKey: string, facts: ProductFacts) {
  const dest = factsPath(runId, productKey);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(facts, null, 2), "utf8");
}

function readFacts(runId: string, productKey: string): ProductFacts | null {
  const dest = factsPath(runId, productKey);
  if (!fs.existsSync(dest)) return null;
  return JSON.parse(fs.readFileSync(dest, "utf8")) as ProductFacts;
}

function loadCandidateShots(
  desktop: string | null,
  mobile: string | null,
  candidateId: string,
): ScreenshotPayload[] {
  const out: ScreenshotPayload[] = [];
  const root = path.join(process.cwd(), "data", "validation-lab");
  if (desktop) {
    const file = path.join(root, desktop);
    if (fs.existsSync(file)) {
      out.push({
        mediaType: "image/jpeg",
        base64: fs.readFileSync(file).toString("base64"),
        label: `desktop 1440 candidate ${candidateId}`,
      });
    }
  }
  if (mobile) {
    const file = path.join(root, mobile);
    if (fs.existsSync(file)) {
      out.push({
        mediaType: "image/jpeg",
        base64: fs.readFileSync(file).toString("base64"),
        label: `mobile 390 candidate ${candidateId}`,
      });
    }
  }
  return out;
}

function refreshRunSummary(runId: string) {
  const run = getValidationRun(runId);
  if (!run) return;
  const candidates = listValidationCandidates(runId);
  const summary = summarizeValidationRun(run.products, candidates);
  const prints = candidates.map((c) => c.fingerprint).filter((item): item is StructureFingerprint => Boolean(item));
  updateValidationRun(runId, {
    summary,
    structuralDiversity: structuralDiversityOf(prints),
    status: candidates.length ? "COMPLETE" : run.status,
  });
}
