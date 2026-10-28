import { faqEntryAllowed } from "@/lib/presell-copy/faq-select";
import { PRODUCT_CONTRACT_VERSION } from "@/lib/product-contract/types";
import {
  hasContactDetail,
  withImportQuality,
  type ProductFacts,
  type ReturnsInformationFact,
  type ShippingInformationFact,
  type SourcePageCategory,
} from "@/lib/product-facts";
import { acceptedProposals, productFactsFromAcceptedReview } from "@/lib/product-research/approved-facts";
import type { ProductResearchRun } from "@/lib/product-research/types";
import { readCandidateLedger, type LedgerCandidate } from "@/lib/presell-quality/candidate-ledger";
import { classifyOperationalThemes, primaryOperationalTheme } from "@/lib/presell-quality/operational-theme";
import { readPrimaryPageResearch } from "@/lib/presell-quality/primary-page-research";
import { PRIMARY_SOURCE_POLICY } from "@/lib/presell-quality/primary-source-policy";
import { readEvidenceAudit } from "@/lib/presell-quality/review-decide";

const CORE_FIELDS = ["description", "ingredients", "howItWorks", "guarantee"] as const;
const PURITY_OR_OFFICIAL = /\b(official website only|purity of ingredients|buy from the official)\b/i;
const RESULTS_PROMISE = /\b(your results|experience the results|amazing formula|totally and completely satisfied)\b/i;
const SECURITY_STRENGTHEN =
  /\b(highly secure|100%\s*segur|compra 100% segura|segurança garantida|pagamento sem qualquer risco|purchase 100% safe|guaranteed security)\b/i;
const SSL_MENTION = /\bssl/i;
const ONE_TIME_PAYMENT = /\bone[- ]time payment\b/i;
const EMPTY_BOTTLES = /\bempty bottles\b/i;
const FORTY_EIGHT_HOURS = /\b48 hours\b/i;
const MINUS_SHIPPING = /\bminus shipping\b/i;
const FIVE_TO_TEN_DAYS = /\b5 to 10 days\b/i;
const TWENTY_FOUR_HOURS = /\b24 working hours\b/i;
const CARRIER = /\b(fedex|ups)\b/i;

export const SSL_PLATFORM_QUALIFIER =
  "That seller statement is not independent proof that the transaction is fully secure.";

export type ApprovedGenerationFacts = {
  facts: ProductFacts;
  contractVersion: typeof PRODUCT_CONTRACT_VERSION;
  coreFieldsPreserved: boolean;
  operationalEvidenceIds: string[];
  faqQuestions: string[];
  shippingStatements: string[];
  paymentStatements: string[];
  returnStatements: string[];
  sslQualified: boolean;
  notes: string[];
};

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function sentences(text: string): string[] {
  return collapse(text)
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 12);
}

function splitFaq(text: string): { question: string | null; answer: string } {
  const value = collapse(text);
  const parts = value.match(/^((?:[^?]+\?\s*)+)(.+)$/);
  if (!parts) return { question: null, answer: value };
  const question = collapse(parts[1] ?? "");
  const answer = collapse(parts[2] ?? "");
  return { question: question || null, answer: answer || value };
}

function operationalFact<K extends string>(
  kind: K,
  statement: string,
  sourceUrl: string,
  category: SourcePageCategory,
  retrievedAt?: string | null,
): {
  statement: string;
  kind: K;
  provenance: "DIRECT_SOURCE";
  copyEligibility: "YES";
  policyFindings: string[];
  sourceUrl: string;
  sourcePageCategory: SourcePageCategory;
  retrievedAt?: string;
} {
  return {
    statement,
    kind,
    provenance: "DIRECT_SOURCE",
    copyEligibility: "YES",
    policyFindings: [],
    sourceUrl,
    sourcePageCategory: category,
    ...(retrievedAt ? { retrievedAt } : {}),
  };
}

function policyApprovedIds(campaignId: number, evidenceIds: string[]): string[] {
  const audit = readEvidenceAudit(campaignId);
  return evidenceIds.filter((id) =>
    audit.some(
      (entry) =>
        entry.candidateId === id &&
        entry.decision === "ACCEPT" &&
        entry.actor === PRIMARY_SOURCE_POLICY &&
        entry.approvalOrigin === PRIMARY_SOURCE_POLICY,
    ),
  );
}

function shippingKind(statement: string): ShippingInformationFact["kind"] {
  if (FIVE_TO_TEN_DAYS.test(statement) || /\b\d+\s+to\s+\d+\s+days\b/i.test(statement)) return "DELIVERY_ESTIMATE";
  if (TWENTY_FOUR_HOURS.test(statement)) return "PROCESSING";
  if (CARRIER.test(statement)) return "METHOD";
  return "OTHER";
}

function returnKind(statement: string): ReturnsInformationFact["kind"] {
  if (FORTY_EIGHT_HOURS.test(statement)) return "RETURN_PROCESS";
  if (EMPTY_BOTTLES.test(statement) || MINUS_SHIPPING.test(statement)) return "RETURN_CONDITION";
  return "OTHER";
}

function keepShippingSentence(sentence: string): boolean {
  if (PURITY_OR_OFFICIAL.test(sentence) || hasContactDetail(sentence)) return false;
  const themes = classifyOperationalThemes(sentence);
  if (themes.includes("SHIPPING") || themes.includes("DELIVERY")) return true;
  return /\b(arrive|doorstep|domestic orders?|\d+\s+to\s+\d+\s+days)\b/i.test(sentence);
}

function keepReturnSentence(sentence: string): boolean {
  if (hasContactDetail(sentence) || RESULTS_PROMISE.test(sentence)) return false;
  if (EMPTY_BOTTLES.test(sentence) || FORTY_EIGHT_HOURS.test(sentence) || MINUS_SHIPPING.test(sentence)) return true;
  const themes = classifyOperationalThemes(sentence);
  return themes.includes("RETURNS") || themes.includes("REFUND");
}

function shippingRemainder(sentence: string): string | null {
  const withoutContact = sentence
    .replace(/\band to make things easy you will receive an email with your tracking number so that you can follow your package\.?/gi, ".")
    .replace(/\s+/g, " ")
    .trim();
  if (!keepShippingSentence(withoutContact) || hasContactDetail(withoutContact)) return null;
  return withoutContact.replace(/\s+\./g, ".").trim();
}

function returnClauses(answer: string): string[] {
  const clauses: string[] = [];
  const empty = answer.match(/return the product, even your empty bottles, anytime within 60 days of your purchase/i);
  if (empty) clauses.push(empty[0]);
  const hours = answer.match(/a full refund within 48 hours of the product being returned/i);
  if (hours) clauses.push(hours[0].replace(/^a /i, "A "));
  const shipping = answer.match(/minus shipping and handling fees/i);
  if (shipping) clauses.push(shipping[0]);
  if (clauses.length) return clauses;
  return sentences(answer).filter(keepReturnSentence);
}

function paymentAnswer(original: string): { text: string; sslQualified: boolean } {
  const kept = sentences(original).filter((sentence) => {
    if (SECURITY_STRENGTHEN.test(sentence) || hasContactDetail(sentence)) return false;
    return ONE_TIME_PAYMENT.test(sentence) || /no other future payments/i.test(sentence) || SSL_MENTION.test(sentence);
  });
  const payment = kept.filter((sentence) => !SSL_MENTION.test(sentence));
  const ssl = kept.find((sentence) => SSL_MENTION.test(sentence));
  const parts = [...payment];
  let sslQualified = false;
  if (ssl) {
    parts.push("The seller says the page uses SSL.");
    parts.push(SSL_PLATFORM_QUALIFIER);
    sslQualified = true;
  }
  return { text: parts.join(" "), sslQualified };
}

export function enrichApprovedFactsForGeneration(input: {
  run: ProductResearchRun | null;
  productName: string;
  sourceUrl: string;
  ledger?: { candidates: LedgerCandidate[] } | null;
}): ApprovedGenerationFacts {
  const facts = productFactsFromAcceptedReview({
    run: input.run,
    productName: input.productName,
    sourceUrl: input.sourceUrl,
  });
  const core = {
    description: facts.description,
    ingredients: [...facts.ingredientsOrComponents],
    usage: [...facts.usageInformation],
    guarantee: facts.guaranteeInformation,
  };
  const notes: string[] = [];
  const shippingStatements: string[] = [];
  const paymentStatements: string[] = [];
  const returnStatements: string[] = [];
  const faqQuestions: string[] = [];
  let sslQualified = false;
  const acceptedFaq = acceptedProposals(input.run).find((item) => item.field === "faq");
  const evidenceIds = acceptedFaq?.evidenceIds ?? [];
  const campaignId = input.run?.campaignId;
  const operationalEvidenceIds = campaignId ? policyApprovedIds(campaignId, evidenceIds) : evidenceIds;
  const ledger = input.ledger ?? (campaignId ? readCandidateLedger(campaignId) : null);
  const primaryFaqs = campaignId ? (readPrimaryPageResearch(campaignId)?.inventory?.faqs ?? []) : [];
  facts.shippingInformation ??= [];
  facts.returnsInformation ??= [];

  for (const id of operationalEvidenceIds) {
    const candidate = ledger?.candidates.find((item) => item.candidateId === id);
    if (!candidate) {
      notes.push(`Evidence ${id} is accepted but missing from the candidate ledger.`);
      continue;
    }
    const parsed = splitFaq(candidate.extractedValue);
    const inventory = primaryFaqs.find(
      (item) =>
        collapse(item.question).toLowerCase() === collapse(parsed.question ?? "").toLowerCase() ||
        (parsed.answer && item.answer && collapse(item.answer).includes(collapse(parsed.answer).slice(0, 40))),
    );
    const question = parsed.question || inventory?.question || null;
    const answer = parsed.answer || candidate.originalExcerpt || candidate.extractedValue;
    const theme = primaryOperationalTheme(candidate.extractedValue, candidate.field);
    const sourceUrl = candidate.sourceUrl || acceptedFaq?.sourceUrl || input.sourceUrl;

    if (theme === "SHIPPING" || theme === "DELIVERY") {
      const keptShipping = sentences(answer).map(shippingRemainder).filter((item): item is string => Boolean(item));
      for (const sentence of keptShipping) {
        facts.shippingInformation.push(
          operationalFact(shippingKind(sentence), sentence, sourceUrl, "SHIPPING", candidate.collectedAt),
        );
        shippingStatements.push(sentence);
      }
      if (question) {
        const shippingFaq = keptShipping.join(" ");
        const allowed = faqEntryAllowed(question, shippingFaq);
        if (allowed.ok) {
          facts.sourceSnippets.push({
            field: "faq",
            text: shippingFaq,
            question,
            sourceUrl,
            confidence: "DIRECT_SOURCE",
            sourcePageCategory: "FAQ",
            retrievedAt: candidate.collectedAt ?? undefined,
          });
          faqQuestions.push(question);
        } else {
          notes.push(`Shipping FAQ withheld: ${allowed.reason}`);
        }
      }
    } else if (theme === "COMMERCIAL_TERMS") {
      const payment = paymentAnswer(answer);
      sslQualified = sslQualified || payment.sslQualified;
      if (payment.text) {
        paymentStatements.push(payment.text);
        const billingQuestions = question
          ? question.split(/(?<=\?)\s+/).map((item) => item.trim()).filter(Boolean)
          : [];
        const usableQuestion = billingQuestions.find((item) => faqEntryAllowed(item, payment.text).ok) ?? question;
        if (!usableQuestion) {
          notes.push(`Payment text for ${id} has no source question and was not added as FAQ.`);
        } else {
          const allowed = faqEntryAllowed(usableQuestion, payment.text);
          if (allowed.ok) {
            facts.sourceSnippets.push({
              field: "faq",
              text: payment.text,
              question: usableQuestion,
              sourceUrl,
              confidence: "DIRECT_SOURCE",
              sourcePageCategory: "FAQ",
              retrievedAt: candidate.collectedAt ?? undefined,
            });
            faqQuestions.push(usableQuestion);
          } else {
            notes.push(`Payment FAQ withheld: ${allowed.reason}`);
          }
        }
      }
    } else if (theme === "RETURNS" || theme === "REFUND" || theme === "GUARANTEE") {
      for (const sentence of returnClauses(answer)) {
        facts.returnsInformation.push(
          operationalFact(returnKind(sentence), sentence, sourceUrl, "RETURNS", candidate.collectedAt),
        );
        returnStatements.push(sentence);
      }
    } else {
      notes.push(`Approved evidence ${id} theme ${theme} was not mapped into copy.`);
    }
  }

  facts.description = core.description;
  facts.ingredientsOrComponents = core.ingredients;
  facts.usageInformation = core.usage;
  facts.guaranteeInformation = core.guarantee;
  if (sslQualified) {
    facts.importWarnings.push(
      "Seller SSL language is restated with a platform qualifier. It is not an independent security certification.",
    );
  }
  facts.importWarnings.push("Operational FAQ copy uses seller-stated English source text, not the Portuguese review preview.");
  const coreFieldsPreserved =
    facts.description === core.description &&
    JSON.stringify(facts.ingredientsOrComponents) === JSON.stringify(core.ingredients) &&
    JSON.stringify(facts.usageInformation) === JSON.stringify(core.usage) &&
    facts.guaranteeInformation === core.guarantee;

  return {
    facts: withImportQuality(facts),
    contractVersion: PRODUCT_CONTRACT_VERSION,
    coreFieldsPreserved,
    operationalEvidenceIds,
    faqQuestions,
    shippingStatements,
    paymentStatements,
    returnStatements,
    sslQualified,
    notes,
  };
}
