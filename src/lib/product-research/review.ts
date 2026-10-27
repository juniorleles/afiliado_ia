import { getCampaignById } from "@/lib/campaigns";
import { readCampaignBrief } from "@/lib/campaign-brief";
import { readKnowledgeText, saveProductKnowledge, type KnowledgeText } from "@/lib/product-knowledge";
import { readLatestProductResearch, readProductResearchRun, writeProductResearchRun } from "@/lib/product-research/store";
import { reviewCompletion } from "@/lib/product-research/adapter";
import type { FieldDecision, FieldProposal, ProductResearchField, ProductResearchRun } from "@/lib/product-research/types";

function applyValue(text: KnowledgeText, field: ProductResearchField, value: string): KnowledgeText {
  return { ...text, [field]: value };
}

export function decideProductResearchFields(input: {
  campaignId: number;
  runId: string;
  fields: ProductResearchField[];
  action: "ACCEPT" | "REJECT";
  confirmOverwrite?: boolean;
}): ProductResearchRun {
  const campaign = getCampaignById(input.campaignId);
  if (!campaign) throw new Error("Campaign not found.");
  const run = readProductResearchRun(input.campaignId, input.runId);
  if (!run || run.campaignId !== input.campaignId) throw new Error("Research run not found.");
  const brief = readCampaignBrief(input.campaignId);
  let text = readKnowledgeText(campaign, brief).text;
  const now = new Date().toISOString();
  const proposals: FieldProposal[] = run.proposals.map((item) => ({ ...item }));
  const decisions: FieldDecision[] = [...run.decisions];

  for (const field of input.fields) {
    const proposal = proposals.find((item) => item.field === field);
    if (!proposal) continue;
    if (input.action === "ACCEPT" && !proposal.suggestedValue.trim()) continue;
    if (input.action === "ACCEPT" && (proposal.evidenceIncomplete || !proposal.evidenceIds.length)) continue;
    if (input.action === "ACCEPT" && input.fields.length > 1 && !proposal.eligibleForBatch) continue;
    if (proposal.status === "ACCEPTED" && input.action === "ACCEPT" && !input.confirmOverwrite) {
      decisions.push({
        field,
        action: "ACCEPT",
        confirmedOverwrite: false,
        decidedAt: now,
        previousStatus: proposal.status,
        resultingStatus: proposal.status,
      });
      continue;
    }
    if (input.action === "ACCEPT") {
      text = applyValue(text, field, proposal.suggestedValue);
      proposal.currentValue = proposal.suggestedValue;
      proposal.status = "ACCEPTED";
    } else {
      proposal.status = "REJECTED";
    }
    decisions.push({
      field,
      action: input.action,
      confirmedOverwrite: Boolean(input.confirmOverwrite),
      decidedAt: now,
      previousStatus: run.proposals.find((item) => item.field === field)?.status ?? "FOUND_REVIEW_REQUIRED",
      resultingStatus: proposal.status,
    });
  }

  if (input.action === "ACCEPT") saveProductKnowledge(input.campaignId, text);
  const review = reviewCompletion(proposals);
  return writeProductResearchRun({
    ...run,
    proposals,
    decisions,
    reviewAccepted: review.accepted,
    reviewTotal: review.total,
  });
}

export function latestRunForCampaign(campaignId: number): ProductResearchRun | null {
  return readLatestProductResearch(campaignId);
}
