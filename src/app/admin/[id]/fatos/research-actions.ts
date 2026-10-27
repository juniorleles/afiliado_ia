"use server";

import { after } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getCampaignById } from "@/lib/campaigns";
import { inspectPublicHttpsUrl } from "@/lib/real-product-assets/ssrf";
import { createProductResearchJob, executeProductResearch } from "@/lib/product-research/run";
import { decideProductResearchFields } from "@/lib/product-research/review";
import { decideDiscoveredAsset, type AssetDecisionAction } from "@/lib/product-research/assets";
import { readLatestProductResearch, readProductResearchRun } from "@/lib/product-research/store";
import { PRODUCT_RESEARCH_FIELDS, type ProductResearchField, type ProductResearchRun } from "@/lib/product-research/types";
import {
  loadApprovedReviewGeneration,
  runApprovedReviewGeneration,
  type ApprovedReviewGeneration,
} from "@/lib/lp-generator/from-approved-review";
import { loadEvidenceReviewWorkspace } from "@/lib/presell-quality/review-workspace";
import { decideEvidenceCandidate } from "@/lib/presell-quality/review-decide";
import { confirmScopedIdentity, rejectScopedRelation, requestMoreIdentityEvidence, type RelationScope } from "@/lib/presell-quality/commercial-graph";

function campaignOf(id: number) {
  if (!Number.isInteger(id) || id < 1 || !getCampaignById(id)) throw new Error("Campanha não encontrada.");
  return id;
}

function optionalUrl(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return undefined;
  const safe = inspectPublicHttpsUrl(trimmed);
  if (!safe.ok) throw new Error(safe.reason);
  return safe.url.toString();
}

export async function startProductFactsResearchAction(input: {
  campaignId: number;
  productUrl?: string;
  affiliateResourceUrl?: string;
  authorizedDestinationUrl?: string;
  trackingHopUrl?: string;
}): Promise<ProductResearchRun> {
  await requireAdmin();
  const campaignId = campaignOf(input.campaignId);
  const job = createProductResearchJob({
    campaignId,
    productUrl: optionalUrl(input.productUrl),
    affiliateResourceUrl: optionalUrl(input.affiliateResourceUrl),
    authorizedDestinationUrl: optionalUrl(input.authorizedDestinationUrl),
    trackingHopUrl: optionalUrl(input.trackingHopUrl),
  });
  if (job.status === "QUEUED") {
    after(() => {
      void executeProductResearch({ campaignId, runId: job.runId });
    });
  }
  return job;
}

export async function executeProductFactsResearchAction(input: {
  campaignId: number;
  runId: string;
}): Promise<ProductResearchRun> {
  await requireAdmin();
  const campaignId = campaignOf(input.campaignId);
  return executeProductResearch({ campaignId, runId: input.runId });
}

export async function readProductFactsResearchAction(input: {
  campaignId: number;
  runId?: string;
}): Promise<ProductResearchRun | null> {
  await requireAdmin();
  const campaignId = campaignOf(input.campaignId);
  if (input.runId) return readProductResearchRun(campaignId, input.runId);
  return readLatestProductResearch(campaignId);
}

export async function decideProductFactsResearchAction(input: {
  campaignId: number;
  runId: string;
  fields: ProductResearchField[];
  action: "ACCEPT" | "REJECT";
  confirmOverwrite?: boolean;
}): Promise<ProductResearchRun> {
  await requireAdmin();
  const campaignId = campaignOf(input.campaignId);
  const fields = input.fields.filter((field): field is ProductResearchField =>
    (PRODUCT_RESEARCH_FIELDS as readonly string[]).includes(field),
  );
  if (!fields.length) throw new Error("Nenhum campo elegível foi enviado.");
  return decideProductResearchFields({
    campaignId,
    runId: input.runId,
    fields,
    action: input.action,
    confirmOverwrite: input.confirmOverwrite,
  });
}

export async function decideProductFactsAssetAction(input: {
  campaignId: number;
  runId: string;
  assetUrl: string;
  action: AssetDecisionAction;
}): Promise<ProductResearchRun> {
  await requireAdmin();
  const campaignId = campaignOf(input.campaignId);
  return decideDiscoveredAsset({
    campaignId,
    runId: input.runId,
    assetUrl: input.assetUrl,
    action: input.action,
  });
}

export async function readSandboxPresellAction(input: {
  campaignId: number;
}): Promise<ApprovedReviewGeneration | null> {
  await requireAdmin();
  return loadApprovedReviewGeneration(campaignOf(input.campaignId));
}

export async function generateSandboxPresellAction(input: {
  campaignId: number;
  runId?: string;
}): Promise<ApprovedReviewGeneration> {
  await requireAdmin();
  const campaignId = campaignOf(input.campaignId);
  process.env.AIA_ALLOW_PAID_AI = "0";
  return runApprovedReviewGeneration({ campaignId, runId: input.runId });
}

export async function readEvidenceReviewAction(input: { campaignId: number }) {
  await requireAdmin();
  return loadEvidenceReviewWorkspace(campaignOf(input.campaignId));
}

export async function decideEvidenceCandidateAction(input: {
  campaignId: number;
  candidateId: string;
  expectedVersion: number;
  decision: "ACCEPT" | "REJECT" | "REQUEST_NEW_EVIDENCE" | "MARK_DUPLICATE";
  confirmOverwrite?: boolean;
}) {
  await requireAdmin();
  const campaignId = campaignOf(input.campaignId);
  const workspace = loadEvidenceReviewWorkspace(campaignId);
  const candidate = workspace.ledger.candidates.find((item) => item.candidateId === input.candidateId);
  if (!candidate) throw new Error("Candidato não encontrado.");
  const identity = workspace.identities.find((item) => item.host === candidate.sourceHost) ?? null;
  return decideEvidenceCandidate({
    campaignId,
    candidate,
    ledger: workspace.ledger,
    run: workspace.run,
    identity,
    relations: workspace.graph.relations,
    decision: input.decision,
    expectedVersion: input.expectedVersion,
    officialHosts: workspace.identities.filter((item) => item.role === "MANUFACTURER").map((item) => item.host),
    confirmOverwrite: input.confirmOverwrite,
  });
}

export async function confirmSourceIdentityAction(input: {
  campaignId: number;
  host: string;
  scope: RelationScope;
  documentation: string;
}) {
  await requireAdmin();
  const campaignId = campaignOf(input.campaignId);
  if (!input.documentation.trim()) throw new Error("Documente exatamente a relação comercial observada.");
  const workspace = loadEvidenceReviewWorkspace(campaignId);
  confirmScopedIdentity({
    campaignId,
    host: input.host,
    scope: input.scope,
    documentation: input.documentation.trim(),
    graph: workspace.graph,
  });
  return loadEvidenceReviewWorkspace(campaignId);
}

export async function rejectCommercialRelationAction(input: {
  campaignId: number;
  relationId: string;
  documentation: string;
}) {
  await requireAdmin();
  const campaignId = campaignOf(input.campaignId);
  if (!input.documentation.trim()) throw new Error("Documente o motivo da rejeição.");
  const workspace = loadEvidenceReviewWorkspace(campaignId);
  rejectScopedRelation({
    campaignId,
    relationId: input.relationId,
    documentation: input.documentation.trim(),
    graph: workspace.graph,
  });
  return loadEvidenceReviewWorkspace(campaignId);
}

export async function requestSourceEvidenceAction(input: {
  campaignId: number;
  host: string;
  documentation: string;
}) {
  await requireAdmin();
  const campaignId = campaignOf(input.campaignId);
  requestMoreIdentityEvidence({
    campaignId,
    host: input.host,
    documentation: input.documentation.trim() || "More evidence requested.",
  });
  return loadEvidenceReviewWorkspace(campaignId);
}
