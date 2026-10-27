import { classifyEvidence } from "@/lib/presell-enrichment/classify";
import type { PresellSemanticField } from "@/lib/presell-enrichment/types";
import { restateOperationalGuarantee } from "@/lib/presell-copy/restate";
import type { ClaimAuditRow, SellerStatementClass, SellerStatementDecision } from "@/lib/presell-copy/types";

export function classifySellerStatement(input: {
  text: string;
  field?: PresellSemanticField;
  sourceUrl?: string | null;
  operatorAttested?: boolean;
  conflicting?: boolean;
}): SellerStatementDecision {
  const text = input.text.replace(/\s+/g, " ").trim();
  const restatement = restateOperationalGuarantee(text);
  if (input.conflicting) {
    return {
      text,
      class: "CONFLICTING",
      publishable: false,
      attributionRequired: false,
      restatement: null,
      reason: "Conflicting values are not selected silently.",
      sourceUrl: input.sourceUrl ?? null,
    };
  }

  const classified = classifyEvidence({
    field: input.field ?? "SELLER_CLAIMS",
    text,
    operatorAttested: input.operatorAttested,
  });

  if (classified.verification === "PROHIBITED" || classified.restriction === "BLOCKED") {
    if (restatement) {
      return {
        text,
        class: "SELLER_STATED_RESTRICTED",
        publishable: true,
        attributionRequired: false,
        restatement,
        reason: "Promotional amplifiers were dropped; only the stated refund window is restated.",
        sourceUrl: input.sourceUrl ?? null,
      };
    }
    return {
      text,
      class: "PROHIBITED",
      publishable: false,
      attributionRequired: false,
      restatement: null,
      reason: classified.notes.join("; ") || "The statement is not allowed as a fact.",
      sourceUrl: input.sourceUrl ?? null,
    };
  }

  if (classified.verification === "UNVERIFIED") {
    return {
      text,
      class: "UNVERIFIED",
      publishable: false,
      attributionRequired: false,
      restatement: null,
      reason: classified.notes.join("; ") || "Unverified statements are not published.",
      sourceUrl: input.sourceUrl ?? null,
    };
  }

  if (classified.restriction === "NOT_PERMANENT") {
    return {
      text,
      class: "SELLER_STATED_RESTRICTED",
      publishable: false,
      attributionRequired: false,
      restatement: null,
      reason: "Prices and offers are not treated as permanent facts.",
      sourceUrl: input.sourceUrl ?? null,
    };
  }

  if (classified.restriction === "ATTRIBUTED_ONLY") {
    const sourceOk = Boolean(input.sourceUrl);
    return {
      text,
      class: "SELLER_STATED_RESTRICTED",
      publishable: sourceOk,
      attributionRequired: true,
      restatement: null,
      reason: sourceOk
        ? "A non-prohibited seller statement may be shown only with attribution."
        : "Attribution requires an identified source.",
      sourceUrl: input.sourceUrl ?? null,
    };
  }

  if (classified.verification === "VERIFIED_PRODUCT_FACT") {
    return {
      text,
      class: "VERIFIED_PRODUCT_FACT",
      publishable: true,
      attributionRequired: false,
      restatement: null,
      reason: "Operator-attested identity.",
      sourceUrl: input.sourceUrl ?? null,
    };
  }

  return {
    text,
    class: "SELLER_STATED_ALLOWED",
    publishable: true,
    attributionRequired: false,
    restatement: restatement,
    reason: "The source stated this operational or identity fact.",
    sourceUrl: input.sourceUrl ?? null,
  };
}

export function attributionAllowed(decision: SellerStatementDecision): boolean {
  if (!decision.publishable) return false;
  if (decision.class === "PROHIBITED" || decision.class === "UNVERIFIED" || decision.class === "CONFLICTING") return false;
  if (decision.attributionRequired && !decision.sourceUrl) return false;
  return true;
}

export function auditBlockedClaim(input: {
  id: string;
  text: string;
  field: string;
  blockReason: string;
  sourceUrl?: string | null;
}): ClaimAuditRow {
  const decision = classifySellerStatement({
    text: input.text,
    field: input.field === "guarantee" || input.field === "guaranteeInformation" ? "WARRANTY_OR_GUARANTEE" : "SELLER_CLAIMS",
    sourceUrl: input.sourceUrl,
  });
  const medical = /\b(bladder|urinary|microbiome|clinically|scientifically proven|cure|pee leaks?)\b/i.test(input.text);
  const claimType = medical
    ? "HEALTH_OR_EFFICACY"
    : /money[- ]back|guarantee|refund/i.test(input.text)
      ? "GUARANTEE_PROMOTION"
      : /bottle|order|epc|affiliate/i.test(input.text)
        ? "PROMOTIONAL_OFFER"
        : "SELLER_CLAIM";
  return {
    id: input.id,
    originalText: input.text,
    field: input.field,
    claimType,
    blockReason: input.blockReason,
    class: decision.class,
    factualRestatement: decision.restatement,
    manufacturerAttributionAppropriate: medical ? false : decision.restatement ? "OPERATIONAL_ONLY" : "NOT_SUFFICIENT",
    publishable: decision.publishable && Boolean(decision.restatement || decision.class === "SELLER_STATED_ALLOWED"),
  };
}
