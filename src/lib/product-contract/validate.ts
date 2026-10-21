import { completeCopy, stripFactLabel } from "@/lib/landing-composer/present";
import {
  copyEligibleList,
  copyEligibleOperationalItems,
  copyEligibleScalar,
  hasContactDetail,
  hasEncodingCorruption,
  isCopyEligibleConfidence,
  type ProductFacts,
} from "@/lib/product-facts";
import { RESTATEMENT_EXEMPT_RULES, statementAllowed, type StatementKind } from "@/lib/product-contract/claims";
import { CONTRACT_STATE_PATHS, PRODUCT_CONTRACT_VERSION, type ProductContract } from "@/lib/product-contract/types";

/**
 * Contract validator. It checks the invariants a renderer is entitled to rely on:
 * every statement has resolvable eligible evidence, no statement carries a claim the gates
 * forbid, every optional field has a state that agrees with its content, images and the CTA come
 * only from their authorities, and (when the facts are supplied) every visible text traces back to
 * an eligible fact. It reads the contract and the facts, and changes nothing.
 */

export type ContractViolation = { rule: string; path: string; message: string };
export type ContractValidation = { ok: boolean; violations: ContractViolation[] };

export type TextValue = { path: string; text: string; kind: StatementKind; trace: boolean };

function textKey(value: string): string {
  return stripFactLabel(value).toLowerCase().replace(/[™®©]/g, "").replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
}

/** Every piece of free text the contract would show, with the rule family it must satisfy. */
export function contractTexts(contract: ProductContract): TextValue[] {
  const out: TextValue[] = [];
  const add = (path: string, text: string | undefined, kind: StatementKind, trace = true) => {
    if (text) out.push({ path, text, kind, trace });
  };
  const vp = contract.valueProposition;
  add("valueProposition.headline", vp?.headline?.text, "PROMOTIONAL");
  (vp?.supporting ?? []).forEach((item, index) => add(`valueProposition.supporting[${index}]`, item.text, "PROMOTIONAL"));
  add("description", contract.description?.text, "PROMOTIONAL");
  (contract.features ?? []).forEach((item, index) => add(`features[${index}]`, item.text, "PROMOTIONAL"));
  (contract.benefits ?? []).forEach((item, index) => add(`benefits[${index}]`, item.text, "PROMOTIONAL"));
  (contract.specifications ?? []).forEach((item, index) => {
    add(`specifications[${index}].name`, item.name, "PROMOTIONAL");
    add(`specifications[${index}].value`, item.value, "PROMOTIONAL");
    add(`specifications[${index}].unit`, item.unit, "PROMOTIONAL");
  });
  (contract.components ?? []).forEach((item, index) => {
    add(`components[${index}].name`, item.name, "OPERATIONAL");
    add(`components[${index}].note`, item.note, "OPERATIONAL");
  });
  (contract.usage ?? []).forEach((item, index) => add(`usage[${index}]`, item.text, "OPERATIONAL"));
  (contract.cautions ?? []).forEach((item, index) => add(`cautions[${index}]`, item.text, "OPERATIONAL"));
  add("guarantee", contract.guarantee?.text, "OPERATIONAL");
  (contract.operational?.returns ?? []).forEach((item, index) => add(`operational.returns[${index}]`, item.statement, "OPERATIONAL"));
  (contract.operational?.shipping ?? []).forEach((item, index) => add(`operational.shipping[${index}]`, item.statement, "OPERATIONAL"));
  (contract.faq ?? []).forEach((item, index) => {
    add(`faq[${index}].question`, item.question, "PROMOTIONAL");
    add(`faq[${index}].answer`, item.answer, "PROMOTIONAL");
  });
  add("complementary.provenance", contract.complementary?.provenance?.text, "OPERATIONAL");
  (contract.offer?.packages ?? []).forEach((item, index) => {
    for (const field of ["label", "totalPrice", "unitPrice", "originalPrice", "savings", "shipping", "bonuses", "popularityLabel"] as const) {
      add(`offer.packages[${index}].${field}`, item[field], "OPERATIONAL");
    }
  });
  add("brand", contract.identity.brand, "OPERATIONAL");
  add("productKind", contract.identity.productKind, "OPERATIONAL");
  return out;
}

function eligibleFactHaystack(facts: ProductFacts): string {
  const parts: string[] = [];
  const description = copyEligibleScalar(facts.description, facts.confidence.description);
  parts.push(description, ...completeCopy(description));
  parts.push(...copyEligibleList(facts.features, facts.confidence.features));
  parts.push(...copyEligibleList(facts.usageInformation, facts.confidence.usageInformation));
  parts.push(...copyEligibleList(facts.cautions, facts.confidence.cautions));
  parts.push(...copyEligibleList(facts.ingredientsOrComponents, facts.confidence.ingredientsOrComponents));
  parts.push(copyEligibleScalar(facts.guaranteeInformation, facts.confidence.guaranteeInformation));
  parts.push(copyEligibleScalar(facts.pricingInformation, facts.confidence.pricingInformation));
  parts.push(copyEligibleScalar(facts.manufacturer, facts.confidence.manufacturer));
  for (const item of copyEligibleOperationalItems(facts)) parts.push(item.statement, item.kind);
  for (const item of facts.ingredientContext ?? []) {
    if (item.copyEligibility === "YES" && isCopyEligibleConfidence(item.provenance)) parts.push(item.statement);
  }
  for (const item of facts.specifications ?? []) {
    if (item.copyEligibility === "YES" && isCopyEligibleConfidence(item.provenance)) parts.push(item.name, item.value, item.unit ?? "");
  }
  for (const item of facts.offerFacts ?? []) {
    parts.push(item.packageName, item.quantity ?? "", item.unitPrice ?? "", item.totalPrice ?? "", item.originalPrice ?? "", item.savings ?? "", item.shipping ?? "", item.bonuses ?? "", item.popularityLabel ?? "");
  }
  for (const item of facts.sourceSnippets) {
    if (isCopyEligibleConfidence(item.confidence)) parts.push(item.text, item.question ?? "");
  }
  return parts.map(textKey).filter(Boolean).join("\n");
}

function hasContent(contract: ProductContract, path: string): boolean {
  switch (path) {
    case "identity.brand": return Boolean(contract.identity.brand);
    case "identity.productKind": return Boolean(contract.identity.productKind);
    case "valueProposition.headline": return Boolean(contract.valueProposition?.headline);
    case "valueProposition.supporting": return (contract.valueProposition?.supporting ?? []).length > 0;
    case "description": return Boolean(contract.description);
    case "features": return (contract.features ?? []).length > 0;
    case "specifications": return (contract.specifications ?? []).length > 0;
    case "components": return (contract.components ?? []).length > 0;
    case "benefits": return (contract.benefits ?? []).length > 0;
    case "usage": return (contract.usage ?? []).length > 0;
    case "cautions": return (contract.cautions ?? []).length > 0;
    case "images.hero": return Boolean(contract.images?.hero);
    case "images.gallery": return (contract.images?.gallery ?? []).length > 0;
    case "offer.packages": return (contract.offer?.packages ?? []).length > 0;
    case "cta": return contract.cta.state === "AUTHORIZED";
    case "guarantee": return Boolean(contract.guarantee);
    case "operational.returns": return (contract.operational?.returns ?? []).length > 0;
    case "operational.shipping": return (contract.operational?.shipping ?? []).length > 0;
    case "faq": return (contract.faq ?? []).length > 0;
    case "complementary.provenance": return Boolean(contract.complementary?.provenance);
    case "legal.healthDisclaimer": return Boolean(contract.legal.healthDisclaimer);
    case "seo.ogImage": return Boolean(contract.seo.ogImage);
    default: return false;
  }
}

export function validateProductContract(contract: ProductContract, options: { facts?: ProductFacts | null } = {}): ContractValidation {
  const violations: ContractViolation[] = [];
  const fail = (rule: string, path: string, message: string) => violations.push({ rule, path, message });

  if (contract.contractVersion !== PRODUCT_CONTRACT_VERSION) fail("CONTRACT_VERSION", "contractVersion", "Unsupported contract version.");

  // Evidence ----------------------------------------------------------------------------------
  const evidenceIds = new Set(contract.evidence.map((entry) => entry.id));
  for (const entry of contract.evidence) {
    if (entry.copyEligibility !== "YES" || !isCopyEligibleConfidence(entry.confidence)) {
      fail("EVIDENCE_REF", `evidence.${entry.id}`, "Evidence is not eligible copy.");
    }
  }
  const refGroups: Array<[string, string[] | undefined]> = [
    ["valueProposition.headline", contract.valueProposition?.headline?.evidenceRefs],
    ...(contract.valueProposition?.supporting ?? []).map((item, index): [string, string[]] => [`valueProposition.supporting[${index}]`, item.evidenceRefs]),
    ["description", contract.description?.evidenceRefs],
    ...(contract.features ?? []).map((item, index): [string, string[]] => [`features[${index}]`, item.evidenceRefs]),
    ...(contract.specifications ?? []).map((item, index): [string, string[]] => [`specifications[${index}]`, item.evidenceRefs]),
    ...(contract.components ?? []).map((item, index): [string, string[]] => [`components[${index}]`, item.evidenceRefs]),
    ...(contract.benefits ?? []).map((item, index): [string, string[]] => [`benefits[${index}]`, item.evidenceRefs]),
    ...(contract.usage ?? []).map((item, index): [string, string[]] => [`usage[${index}]`, item.evidenceRefs]),
    ...(contract.cautions ?? []).map((item, index): [string, string[]] => [`cautions[${index}]`, item.evidenceRefs]),
    ...(contract.offer?.packages ?? []).map((item, index): [string, string[]] => [`offer.packages[${index}]`, item.evidenceRefs]),
    ["guarantee", contract.guarantee?.evidenceRefs],
    ...(contract.operational?.returns ?? []).map((item, index): [string, string[]] => [`operational.returns[${index}]`, item.evidenceRefs]),
    ...(contract.operational?.shipping ?? []).map((item, index): [string, string[]] => [`operational.shipping[${index}]`, item.evidenceRefs]),
    ...(contract.faq ?? []).map((item, index): [string, string[]] => [`faq[${index}]`, item.evidenceRefs]),
    ["complementary.provenance", contract.complementary?.provenance?.evidenceRefs],
  ];
  for (const [path, refs] of refGroups) {
    if (refs === undefined) continue;
    if (refs.length === 0) fail("EVIDENCE_REQUIRED", path, "Statement has no evidence reference.");
    for (const ref of refs) if (!evidenceIds.has(ref)) fail("EVIDENCE_REF", path, `Unknown evidence reference ${ref}.`);
  }

  // Policy ----------------------------------------------------------------------------------------
  for (const item of contractTexts(contract)) {
    if (hasContactDetail(item.text) || hasEncodingCorruption(item.text)) {
      fail("POLICY_STATEMENT", item.path, "Text carries a contact detail or corrupted encoding.");
      continue;
    }
    // Cautions are shown whatever they say; the other free text must pass the claim gates.
    if (item.path.startsWith("cautions[")) continue;
    // Offer tokens are verbatim prices and labels, not claims.
    if (item.path.startsWith("offer.packages[")) continue;
    const exempt = item.path === "guarantee" || item.path.startsWith("operational.") ? RESTATEMENT_EXEMPT_RULES : [];
    if (!statementAllowed(item.text, item.kind, exempt)) fail("POLICY_STATEMENT", item.path, "Text carries a claim the gates forbid.");
  }

  // States ------------------------------------------------------------------------------------------
  for (const path of CONTRACT_STATE_PATHS) {
    const entry = contract.dataStates[path];
    if (!entry) {
      fail("STATE_COVERAGE", path, "Optional field has no data state.");
      continue;
    }
    const present = hasContent(contract, path);
    if (entry.state === "PRESENT" && !present) fail("STATE_CONSISTENCY", path, "State is PRESENT but the field is empty.");
    if (entry.state === "PRESENT" && entry.reason !== null) fail("STATE_CONSISTENCY", path, "PRESENT must not carry a reason.");
    if (entry.state !== "PRESENT" && entry.reason === null) fail("STATE_CONSISTENCY", path, "A non-PRESENT state needs a reason.");
    if ((entry.state === "ABSENT" || entry.state === "WITHHELD_POLICY" || entry.state === "WITHHELD_UNAUTHORIZED" || entry.state === "CONFLICTING") && present) {
      fail("STATE_CONSISTENCY", path, `State ${entry.state} but the field has content.`);
    }
    if (entry.state === "PARTIAL" && !present && path !== "offer.packages") fail("STATE_CONSISTENCY", path, "State is PARTIAL but the field is empty.");
  }

  // Images ------------------------------------------------------------------------------------------
  const views = [...(contract.images?.hero ? [contract.images.hero] : []), ...(contract.images?.gallery ?? [])];
  for (const view of views) {
    const bad =
      !view.src ||
      /^(?:data:|https?:|\/\/)/i.test(view.src) ||
      !/^[a-f0-9]{64}$/i.test(view.sha256 ?? "") ||
      !view.authorization?.kind ||
      !view.authorization?.useScope ||
      !view.alt ||
      /\.(?:png|jpe?g|webp|gif|avif)\b/i.test(view.alt);
    if (bad) fail("IMAGE_AUTHORITY", view.src || "images", "Image lacks an approved local source, hash, authorization or a clean alt text.");
  }
  if (contract.images?.hero?.kind === "CONTEXTUAL") fail("IMAGE_AUTHORITY", "images.hero", "A contextual image cannot be the hero.");

  // CTA ----------------------------------------------------------------------------------------------
  if (contract.cta.state === "AUTHORIZED") {
    if (!contract.cta.href || !/^https:\/\//i.test(contract.cta.href)) fail("CTA_LINK", "cta.href", "An authorized CTA needs an https link.");
    if (!contract.cta.label) fail("CTA_LINK", "cta.label", "An authorized CTA needs a label.");
  } else if (contract.cta.href) {
    fail("CTA_LINK", "cta.href", "A CTA that is not authorized must not carry a link.");
  }

  // Legal ----------------------------------------------------------------------------------------------
  if (contract.status === "RENDERABLE" && !contract.legal.affiliateDisclosure) fail("LEGAL", "legal.affiliateDisclosure", "Disclosure is required.");

  // Publication -----------------------------------------------------------------------------------------
  if (contract.publication.approval !== "REQUIRED") fail("PUBLICATION", "publication.approval", "Publication approval is always required.");

  // Traceability to the facts ----------------------------------------------------------------------------
  if (options.facts) {
    const haystack = eligibleFactHaystack(options.facts);
    for (const item of contractTexts(contract)) {
      if (!item.trace) continue;
      const key = textKey(item.text);
      if (!key) continue;
      // A description or lead keeps the sentences that passed the gates, so it is traced sentence by sentence.
      const pieces = item.path === "description" || item.path.startsWith("valueProposition.")
        ? completeCopy(item.text).map(textKey).filter(Boolean)
        : [key];
      if (!(pieces.length > 0 ? pieces : [key]).every((piece) => haystack.includes(piece))) {
        fail("TRACE_TO_FACT", item.path, "Text is not in the eligible facts.");
      }
    }
  }

  return { ok: violations.length === 0, violations };
}
