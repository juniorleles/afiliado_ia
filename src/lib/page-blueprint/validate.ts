import { purchaseCtaAllowed } from "@/lib/design-system/layout";
import type { ProductContract } from "@/lib/product-contract/types";
import type { ConversionBrief } from "@/lib/conversion-strategy/types";
import type { GroundedText, GroundingReport, PageBlueprint, SalesCopy } from "@/lib/page-blueprint/types";

const FORBIDDEN =
  /clinically proven|doctors worldwide|verified buyer|★★|testimonial|limited time|%\s*off|best greens|immune support complex|erases wrinkles|never needs charging|recommended by doctors/i;

const STRUCTURAL =
  /^(what it is|what the source states|seller-stated claims|product image|details|packages|guarantee|returns, shipping and cautions|questions the source answered|next step|disclosure|no authorized purchase link is available\.?|see the packages the source listed\.?)$/i;

function remember(set: Set<string>, text: string | undefined): void {
  if (text) set.add(text.trim());
}

function contractTexts(contract: ProductContract): Set<string> {
  const texts = new Set<string>();
  remember(texts, contract.identity.productName);
  remember(texts, contract.identity.brand);
  remember(texts, contract.identity.productKind);
  remember(texts, contract.valueProposition?.headline?.text);
  (contract.valueProposition?.supporting ?? []).forEach((item) => remember(texts, item.text));
  remember(texts, contract.description?.text);
  (contract.features ?? []).forEach((item) => remember(texts, item.text));
  (contract.benefits ?? []).forEach((item) => remember(texts, item.text));
  (contract.specifications ?? []).forEach((item) => {
    remember(texts, item.name);
    remember(texts, item.value);
    remember(texts, item.unit);
    remember(texts, `${item.name}: ${item.value}`);
    remember(texts, item.unit ? `${item.name}: ${item.value} ${item.unit}` : undefined);
  });
  (contract.components ?? []).forEach((item) => remember(texts, item.name));
  (contract.usage ?? []).forEach((item) => remember(texts, item.text));
  (contract.cautions ?? []).forEach((item) => remember(texts, item.text));
  (contract.offer?.packages ?? []).forEach((item) => {
    remember(texts, item.label);
    remember(texts, item.totalPrice);
    remember(texts, item.unitPrice);
    remember(texts, item.quantity?.text);
    remember(texts, item.popularityLabel);
    if (item.totalPrice) remember(texts, `${item.label} — ${item.totalPrice}`);
    else if (item.unitPrice) remember(texts, `${item.label} — ${item.unitPrice}`);
  });
  remember(texts, contract.guarantee?.text);
  (contract.operational?.returns ?? []).forEach((item) => remember(texts, item.statement));
  (contract.operational?.shipping ?? []).forEach((item) => remember(texts, item.statement));
  (contract.faq ?? []).forEach((item) => {
    remember(texts, item.question);
    remember(texts, item.answer);
  });
  remember(texts, contract.cta.label);
  remember(texts, contract.legal.affiliateDisclosure);
  remember(texts, contract.legal.healthDisclaimer);
  remember(texts, contract.images?.hero?.alt);
  return texts;
}

function allowed(text: string, known: Set<string>, contract: ProductContract): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (STRUCTURAL.test(trimmed)) return true;
  if (known.has(trimmed)) return true;
  const seller = trimmed.match(/^The seller states: (.+)$/);
  if (seller && known.has(seller[1])) return true;
  const name = contract.identity.productName;
  if (trimmed === `${name}. ${contract.description?.text ?? ""}`.trim() && contract.description) return true;
  if (trimmed.startsWith(`${name}. `) && known.has(trimmed.slice(name.length + 2))) return true;
  return false;
}

function walkCopy(copy: SalesCopy): Array<{ path: string; text: GroundedText }> {
  const out: Array<{ path: string; text: GroundedText }> = [
    { path: "headline", text: copy.headline },
    { path: "introduction", text: copy.introduction },
  ];
  if (copy.subheadline) out.push({ path: "subheadline", text: copy.subheadline });
  if (copy.valueProposition) out.push({ path: "valueProposition", text: copy.valueProposition });
  if (copy.closing) out.push({ path: "closing", text: copy.closing });
  if (copy.cta.label) out.push({ path: "cta.label", text: copy.cta.label });
  if (copy.cta.caption) out.push({ path: "cta.caption", text: copy.cta.caption });
  copy.sections.forEach((section, i) => {
    out.push({ path: `sections[${i}].headline`, text: section.headline });
    section.body.forEach((item, j) => out.push({ path: `sections[${i}].body[${j}]`, text: item }));
    if (section.cta) out.push({ path: `sections[${i}].cta`, text: section.cta });
    section.items.forEach((item, j) => {
      if (item.title) out.push({ path: `sections[${i}].items[${j}].title`, text: item.title });
      out.push({ path: `sections[${i}].items[${j}].text`, text: item.text });
    });
  });
  copy.faq.forEach((item, i) => {
    out.push({ path: `faq[${i}].question`, text: item.question });
    out.push({ path: `faq[${i}].answer`, text: item.answer });
  });
  return out;
}

export function validateSalesCopy(copy: SalesCopy, contract: ProductContract, brief: ConversionBrief): GroundingReport {
  const violations: GroundingReport["violations"] = [];
  const known = contractTexts(contract);
  const evidenceIds = new Set(contract.evidence.map((entry) => entry.id));

  if (copy.producer !== "DETERMINISTIC_OFFLINE" && copy.producer !== "EDITORIAL_ADAPTER") {
    violations.push({ rule: "PRODUCER", path: "producer", message: "unknown copy producer" });
  }

  for (const { path, text } of walkCopy(copy)) {
    if (FORBIDDEN.test(text.text)) {
      violations.push({ rule: "POLICY", path, message: "forbidden commercial invention" });
    }
    if (!allowed(text.text, known, contract)) {
      violations.push({ rule: "TRACE", path, message: `text is not in the contract: ${text.text}` });
    }
    for (const ref of text.evidenceRefs) {
      if (!evidenceIds.has(ref)) violations.push({ rule: "EVIDENCE_REF", path, message: `unknown evidence ${ref}` });
    }
  }

  if (copy.cta.action === "AUTHORIZED_HOP") {
    if (!purchaseCtaAllowed(contract) || brief.ctaStrategy.action !== "AUTHORIZED_HOP") {
      violations.push({ rule: "CTA", path: "cta", message: "hop is not allowed" });
    }
    if (copy.cta.href !== contract.cta.href) {
      violations.push({ rule: "CTA", path: "cta.href", message: "href does not match the contract" });
    }
  } else if (copy.cta.href) {
    violations.push({ rule: "CTA", path: "cta.href", message: "blocked CTA must not carry a href" });
  }

  const inventedOffer = copy.offerMicrocopy.some((pack) => !(contract.offer?.packages ?? []).some((real) => real.label === pack.label));
  if (inventedOffer) violations.push({ rule: "OFFER", path: "offerMicrocopy", message: "package was not in the contract" });

  return { ok: violations.length === 0, violations };
}

export function validateBlueprint(blueprint: PageBlueprint, contract: ProductContract, brief: ConversionBrief): GroundingReport {
  const copy: SalesCopy = {
    copyVersion: 1,
    producer: blueprint.producer,
    headline: blueprint.narrative.throughline,
    introduction: blueprint.narrative.throughline,
    sections: blueprint.sections.map((section) => ({
      sectionType: section.sectionType,
      headline: section.headline,
      body: section.body,
      items: section.items,
    })),
    offerMicrocopy: blueprint.offers,
    cta: blueprint.cta,
    faq: [],
  };
  const report = validateSalesCopy(copy, contract, brief);
  if (blueprint.publication.approval !== "REQUIRED") {
    report.violations.push({ rule: "PUBLICATION", path: "publication.approval", message: "approval must stay REQUIRED" });
    report.ok = false;
  }
  if (blueprint.cta.action === "AUTHORIZED_HOP" && blueprint.cta.href !== brief.ctaStrategy.href) {
    report.violations.push({ rule: "CTA", path: "cta.href", message: "blueprint href drifted from the brief" });
    report.ok = false;
  }
  return report;
}
