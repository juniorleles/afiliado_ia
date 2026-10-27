import { classifyEditorialText } from "@/lib/editorial-neutrality/classify";
import { recoverOperationalSegments } from "@/lib/editorial-neutrality/segment";
import { derivedNeutralDescription, reviewCompletion } from "@/lib/product-research/adapter";
import { splitIngredientPresentation } from "@/lib/product-research/approved-facts";
import { decorateDiscoveredAssets, proposeGalleryKind } from "@/lib/product-research/asset-display";
import type { FieldProposal, ProductResearchRun } from "@/lib/product-research/types";

export type FaqKind = NonNullable<FieldProposal["faqKind"]>;

const HEALTH_FAQ =
  /\b(blood sugar|glucose|weight loss|diabetes|cure|treat|heal|prevent|clinically proven|metabolism|fat-burning)\b/i;
const REFUND_FAQ = /\b(refund|return|money[- ]back|rma|guarantee)\b/i;
const DELIVERY_FAQ = /\b(ship|shipping|deliver|delivery|tracking|postal|usps)\b/i;
const USAGE_FAQ = /\b(take|dropper|capsule|tablet|dose|how (?:do|to) (?:i )?use)\b/i;
const COMPOSITION_FAQ = /\b(ingredient|contain|formula|composition)\b/i;

export function classifyFaqEntry(input: { question?: string; answer: string }): FaqKind {
  const hay = `${input.question ?? ""} ${input.answer}`.replace(/\s+/g, " ").trim();
  const classified = classifyEditorialText({ text: hay, role: "FAQ" });
  if (classified.classification === "MEDICAL_OR_HEALTH_CLAIM" || HEALTH_FAQ.test(hay)) return "HEALTH";
  if (classified.classification === "PROMOTIONAL_LANGUAGE" || classified.classification === "UNSUPPORTED_BENEFIT") {
    return "PROMOTIONAL";
  }
  if (REFUND_FAQ.test(hay)) return "REFUND";
  if (DELIVERY_FAQ.test(hay)) return "DELIVERY";
  if (USAGE_FAQ.test(hay)) return "USAGE";
  if (COMPOSITION_FAQ.test(hay)) return "COMPOSITION";
  return "OPERATIONAL";
}

export function factualFaqEligible(kind: FaqKind): boolean {
  return kind === "OPERATIONAL" || kind === "COMPOSITION" || kind === "USAGE" || kind === "DELIVERY" || kind === "REFUND";
}

function recoverPendingProposal(item: FieldProposal, run: ProductResearchRun): FieldProposal {
  if (item.status === "ACCEPTED" || item.status === "REJECTED") return item;
  if (item.field === "howItWorks" && item.suggestedValue.trim()) {
    const recovered = recoverOperationalSegments({ text: item.suggestedValue, role: "USAGE" });
    if (!recovered.recoveredText) {
      return {
        ...item,
        suggestedValue: "",
        recoveredText: null,
        originalText: recovered.originalText,
        proposalKind: "RECOVERED_OPERATIONAL",
        status: "NOT_FOUND",
        eligibleForBatch: false,
        notes: [...item.notes, "No operational remainder survived promotional or health filtering."],
      };
    }
    if (recovered.recoveredText === item.suggestedValue.trim().replace(/\s+/g, " ") && !recovered.omitted.length) {
      return { ...item, originalText: recovered.originalText, recoveredText: recovered.recoveredText, proposalKind: item.proposalKind ?? "EXTRACTED" };
    }
    return {
      ...item,
      suggestedValue: recovered.recoveredText,
      originalText: recovered.originalText,
      recoveredText: recovered.recoveredText,
      proposalKind: "RECOVERED_OPERATIONAL",
      status: item.status === "NOT_FOUND" ? "SELLER_STATED" : item.status,
      supersedesNote: "Pending mixed usage proposal was replaced by the operational remainder. Review status stays pending.",
      notes: [
        ...item.notes,
        "Recovered operational directions from mixed seller copy.",
        ...recovered.omitted.map((row) => `Omitted ${row.classification}: ${row.text.slice(0, 80)}`),
      ].filter((note, index, all) => note && all.indexOf(note) === index),
    };
  }
  if (item.field === "description" && !item.suggestedValue.trim()) {
    const ingredients = run.proposals.find((row) => row.field === "ingredients");
    const ingredientText = (ingredients?.status === "ACCEPTED" ? ingredients.currentValue || ingredients.suggestedValue : ingredients?.suggestedValue) ?? "";
    const evidenceNames = (run.evidenceRegistry?.entries ?? [])
      .filter((entry) => entry.field === "INGREDIENTS")
      .map((entry) => entry.originalText);
    const derived = derivedNeutralDescription({
      productName: run.productName,
      ingredientsText: ingredientText,
      evidenceNames,
    });
    if (!derived || !ingredientText.trim()) {
      return {
        ...item,
        descriptionKind: "EDITORIAL_REJECTED_DESCRIPTION",
        notes: [...item.notes, "EDITORIAL_REJECTED_DESCRIPTION. No grounded remainder was available for a derived description."],
      };
    }
    const lineage = ingredients?.evidenceIds ?? [];
    return {
      ...item,
      suggestedValue: derived,
      status: "FOUND_REVIEW_REQUIRED",
      evidenceIds: lineage,
      sourceUrl: ingredients?.sourceUrl ?? item.sourceUrl,
      sourceClass: ingredients?.sourceClass ?? item.sourceClass,
      sourceType: ingredients?.sourceType ?? item.sourceType,
      verification: ingredients?.verification ?? "SELLER_STATED",
      evidenceIncomplete: lineage.length === 0,
      evidenceExcerpt: ingredients?.evidenceExcerpt ?? null,
      eligibleForBatch: false,
      originalText: null,
      recoveredText: derived,
      proposalKind: "DERIVED_NEUTRAL",
      descriptionKind: "DERIVED_NEUTRAL_DESCRIPTION",
      notes: [
        "DERIVED_NEUTRAL_DESCRIPTION. Built from the product name and declared composition. Not a literal source extract.",
        "Extracted promotional or health overview copy was not restated.",
        ...lineage.map((id) => `Lineage fact ${id}`),
      ],
    };
  }
  if (item.field === "faq") {
    const entries = (run.evidenceRegistry?.entries ?? []).filter((entry) => entry.field === "FAQ");
    const kept: string[] = [];
    const notes = [...item.notes];
    let faqKind: FieldProposal["faqKind"] = null;
    for (const entry of entries) {
      const kind = classifyFaqEntry({ answer: entry.originalText });
      if (entry.verification === "PROHIBITED" || !factualFaqEligible(kind)) {
        notes.push(`FAQ ${kind} omitted from ${entry.id}.`);
        continue;
      }
      if (!entry.originalText.includes("?")) {
        notes.push(`FAQ ${entry.id} had no documented question and was not invented.`);
        continue;
      }
      faqKind = kind;
      kept.push(entry.originalText);
    }
    if (!kept.length) {
      return {
        ...item,
        suggestedValue: "",
        status: "NOT_FOUND",
        faqKind: null,
        eligibleForBatch: false,
        notes: [...new Set([...notes, "FAQ_STATUS = NOT_FOUND. No factual FAQ with a documented question survived editorial review."])],
      };
    }
    return {
      ...item,
      suggestedValue: kept.join("\n\n"),
      status: "SELLER_STATED",
      faqKind,
      eligibleForBatch: false,
      notes: [...new Set(notes)],
    };
  }
  return item;
}

export function applyEditorialRecovery(run: ProductResearchRun): ProductResearchRun {
  const proposals = run.proposals.map((item) => recoverPendingProposal(item, run));
  const assets = decorateDiscoveredAssets(run.discoveredAssets).map((item) => ({
    ...item,
    kindProposal: item.kindProposal ?? proposeGalleryKind(item),
  }));
  const review = reviewCompletion(proposals);
  return {
    ...run,
    proposals,
    discoveredAssets: assets,
    reviewAccepted: review.accepted,
    reviewTotal: review.total,
  };
}
