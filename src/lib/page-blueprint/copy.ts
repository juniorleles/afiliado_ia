import type { ConversionBrief, SectionType } from "@/lib/conversion-strategy/types";
import type { ProductContract, Statement } from "@/lib/product-contract/types";
import type { CopyItem, CopyProducer, GroundedText, SalesCopy, SectionCopy } from "@/lib/page-blueprint/types";
import { SALES_COPY_VERSION } from "@/lib/page-blueprint/types";
import { howItWorksHeadline, presellCategoryOf, presellCtaAuthorization } from "@/lib/presell-strategy/plan";
import { dedupeSalesCopy } from "@/lib/page-blueprint/dedupe";
import { faqEntryAllowed } from "@/lib/presell-copy/faq-select";

const PRODUCER: CopyProducer = "DETERMINISTIC_OFFLINE";

function keyOf(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function grounded(text: string, evidenceRefs: string[], contractPaths: string[]): GroundedText {
  return { text, evidenceRefs: [...new Set(evidenceRefs)], contractPaths, producer: PRODUCER };
}

function fromStatement(statement: Statement, path: string): GroundedText {
  return grounded(statement.text, statement.evidenceRefs, [path]);
}

export function buildSalesCopy(contract: ProductContract, brief: ConversionBrief): SalesCopy {
  const used = new Set<string>();
  const take = (text: string): boolean => {
    const key = keyOf(text);
    if (!key || used.has(key)) return false;
    used.add(key);
    return true;
  };

  const name = contract.identity.productName;
  const vp = contract.valueProposition?.headline;
  const description = contract.description;
  const headline = vp
    ? fromStatement(vp, "valueProposition.headline")
    : grounded(name, [], ["identity.productName"]);
  used.add(keyOf(headline.text));

  let subheadline: GroundedText | undefined;
  const kind = contract.identity.productKind?.replace(/\s+/g, " ").trim() ?? "";
  const genericKind = !kind || /^(natural )?formula$|^product$|^item$/i.test(kind);
  if (kind && !genericKind && !keyOf(headline.text).includes(keyOf(kind))) {
    subheadline = grounded(kind, [], ["identity.productKind"]);
    used.add(keyOf(kind));
  } else {
    const unusedFeature = (contract.features ?? []).find((item) => take(item.text) && item.text.trim().split(/\s+/).length >= 5);
    if (unusedFeature) subheadline = fromStatement(unusedFeature, "features");
  }

  const valueProposition = vp ? fromStatement(vp, "valueProposition.headline") : undefined;

  let introduction: GroundedText;
  if (description && keyOf(description.text) !== keyOf(headline.text)) {
    const text = keyOf(description.text).includes(keyOf(name)) ? description.text : `${name}. ${description.text}`;
    introduction = grounded(text, description.evidenceRefs, ["description"]);
    used.add(keyOf(description.text));
  } else {
    introduction = grounded(name, [], ["identity.productName"]);
  }

  const hop = presellCtaAuthorization(contract).status === "AUTHORIZED" && brief.ctaStrategy.action === "AUTHORIZED_HOP";
  const sections: SectionCopy[] = [];
  const faq: SalesCopy["faq"] = [];

  for (const plan of brief.sectionPlan.filter((item) => item.include)) {
    const built = sectionCopy(plan.type, contract, used, hop);
    if (!built) continue;
    if (plan.type === "faq") faq.push(...built.faq);
    sections.push(built.section);
  }

  const offerMicrocopy = (contract.offer?.packages ?? []).map((pack) => ({
    label: pack.label,
    quantityText: pack.quantity?.text,
    totalPrice: pack.totalPrice,
    unitPrice: pack.unitPrice,
    popularityLabel: pack.popularityLabel,
    evidenceRefs: pack.evidenceRefs,
  }));

  const ctaLabel = hop && contract.cta.label
    ? grounded(contract.cta.label, [], ["cta"])
    : undefined;
  const caption = hop
    ? undefined
    : grounded("No authorized purchase link is available.", [], ["cta"]);
  const closing = hop
    ? grounded(contract.cta.label ? contract.cta.label : "See the packages the source listed.", [], ["cta"])
    : caption;

  return dedupeSalesCopy({
    copyVersion: SALES_COPY_VERSION,
    producer: PRODUCER,
    headline,
    subheadline,
    valueProposition,
    introduction,
    sections,
    offerMicrocopy,
    cta: {
      action: hop ? "AUTHORIZED_HOP" : "NONE",
      label: ctaLabel,
      href: hop ? contract.cta.href : undefined,
      caption,
    },
    closing,
    faq,
  });
}

function sectionCopy(
  type: SectionType,
  contract: ProductContract,
  used: Set<string>,
  hop: boolean,
): { section: SectionCopy; faq: SalesCopy["faq"] } | null {
  const faq: SalesCopy["faq"] = [];
  const body: GroundedText[] = [];
  const items: CopyItem[] = [];
  let headline: GroundedText;
  let cta: GroundedText | undefined;
  const unused = (text: string) => !used.has(keyOf(text));

  switch (type) {
    case "hero":
      headline = grounded(contract.identity.productName, [], ["identity.productName"]);
      if (contract.valueProposition?.headline && unused(contract.valueProposition.headline.text)) {
        body.push(fromStatement(contract.valueProposition.headline, "valueProposition.headline"));
      }
      break;
    case "presentation":
      headline = grounded("What it is", [], ["identity.productName"]);
      if (contract.description && unused(contract.description.text)) {
        body.push(fromStatement(contract.description, "description"));
        used.add(keyOf(contract.description.text));
      } else if (contract.valueProposition?.supporting?.[0]) {
        const line = contract.valueProposition.supporting[0];
        if (unused(line.text)) {
          body.push(fromStatement(line, "valueProposition.supporting"));
          used.add(keyOf(line.text));
        }
      }
      break;
    case "differentiators":
      headline = grounded("What the source states", [], ["features"]);
      for (const [i, feature] of (contract.features ?? []).entries()) {
        if (!unused(feature.text)) continue;
        used.add(keyOf(feature.text));
        items.push({ text: fromStatement(feature, `features[${i}]`) });
      }
      break;
    case "how_it_works":
      headline = grounded(howItWorksHeadline(presellCategoryOf({ productKind: contract.identity.productKind })), [], ["usage"]);
      for (const [i, step] of (contract.usage ?? []).entries()) {
        if (!unused(step.text)) continue;
        used.add(keyOf(step.text));
        body.push(fromStatement(step, `usage[${i}]`));
      }
      break;
    case "benefits":
      headline = grounded("Seller-stated claims", [], ["benefits"]);
      for (const [i, benefit] of (contract.benefits ?? []).entries()) {
        if (!unused(benefit.text)) continue;
        used.add(keyOf(benefit.text));
        items.push({
          text: grounded(`The seller states: ${benefit.text}`, benefit.evidenceRefs, [`benefits[${i}]`]),
        });
      }
      break;
    case "demonstration":
      headline = grounded("Product image", [], ["images.hero"]);
      if (contract.images?.hero) {
        body.push(grounded(contract.images.hero.alt, [], ["images.hero"]));
      }
      break;
    case "specifications":
      headline = grounded(
        (contract.specifications ?? []).length > 0 ? "Specifications" : (contract.components ?? []).length > 0 ? "Ingredients" : "Details",
        [],
        (contract.specifications ?? []).length > 0 ? ["specifications"] : ["components"],
      );
      for (const [i, spec] of (contract.specifications ?? []).entries()) {
        const line = spec.unit ? `${spec.name}: ${spec.value} ${spec.unit}` : `${spec.name}: ${spec.value}`;
        items.push({ text: grounded(line, spec.evidenceRefs, [`specifications[${i}]`]) });
      }
      for (const [i, component] of (contract.components ?? []).entries()) {
        if (!unused(component.name)) continue;
        used.add(keyOf(component.name));
        items.push({ text: grounded(component.name, component.evidenceRefs, [`components[${i}]`]) });
      }
      break;
    case "offers":
      headline = grounded("Packages", [], ["offer.packages"]);
      for (const [i, pack] of (contract.offer?.packages ?? []).entries()) {
        const price = pack.totalPrice ?? pack.unitPrice;
        const line = price ? `${pack.label} — ${price}` : pack.label;
        items.push({
          title: grounded(pack.label, pack.evidenceRefs, [`offer.packages[${i}]`]),
          text: grounded(line, pack.evidenceRefs, [`offer.packages[${i}]`]),
        });
      }
      if (hop && contract.cta.label) cta = grounded(contract.cta.label, [], ["cta"]);
      break;
    case "guarantee":
      headline = grounded("Guarantee", contract.guarantee?.evidenceRefs ?? [], ["guarantee"]);
      if (contract.guarantee) {
        body.push(
          grounded(`The seller states: ${contract.guarantee.text}`, contract.guarantee.evidenceRefs, ["guarantee"]),
        );
      }
      break;
    case "trust": {
      const hasReturns = (contract.operational?.returns ?? []).length > 0;
      const hasShipping = (contract.operational?.shipping ?? []).length > 0;
      const hasCautions = (contract.cautions ?? []).length > 0;
      const trustTitle =
        hasCautions && !hasReturns && !hasShipping
          ? "Cautions"
          : (hasReturns || hasShipping) && !hasCautions
            ? "Returns and shipping"
            : "Returns, shipping and cautions";
      headline = grounded(trustTitle, [], ["operational"]);
      (contract.operational?.returns ?? []).forEach((item, i) => {
        const text = /^the seller states:/i.test(item.statement) ? item.statement : `The seller states: ${item.statement}`;
        items.push({ text: grounded(text, item.evidenceRefs, [`operational.returns[${i}]`]) });
      });
      (contract.operational?.shipping ?? []).forEach((item, i) => {
        const text = /^the seller states:/i.test(item.statement) ? item.statement : `The seller states: ${item.statement}`;
        items.push({ text: grounded(text, item.evidenceRefs, [`operational.shipping[${i}]`]) });
      });
      (contract.cautions ?? []).forEach((item, i) => {
        items.push({ text: fromStatement(item, `cautions[${i}]`) });
      });
      break;
    }
    case "faq":
      headline = grounded("Questions the source answered", [], ["faq"]);
      for (const [i, entry] of (contract.faq ?? []).entries()) {
        if (!faqEntryAllowed(entry.question, entry.answer).ok) continue;
        const answerKey = keyOf(entry.answer);
        if (!answerKey || used.has(answerKey)) continue;
        used.add(answerKey);
        used.add(keyOf(entry.question));
        const question = grounded(entry.question, entry.evidenceRefs, [`faq[${i}]`]);
        const answer = grounded(entry.answer, entry.evidenceRefs, [`faq[${i}]`]);
        faq.push({ question, answer });
        items.push({ title: question, text: answer });
      }
      break;
    case "cta_final":
      headline = grounded(hop && contract.cta.label ? contract.cta.label : "Next step", [], ["cta"]);
      if (hop && contract.cta.label) {
        cta = grounded(contract.cta.label, [], ["cta"]);
        body.push(grounded(contract.cta.label, [], ["cta"]));
      } else {
        body.push(grounded("No authorized purchase link is available.", [], ["cta"]));
      }
      break;
    case "legal":
      headline = grounded("Disclosure", [], ["legal.affiliateDisclosure"]);
      body.push(grounded(contract.legal.affiliateDisclosure, [], ["legal.affiliateDisclosure"]));
      if (contract.legal.healthDisclaimer) {
        body.push(grounded(contract.legal.healthDisclaimer, [], ["legal.healthDisclaimer"]));
      }
      break;
    default:
      return null;
  }

  if (type === "faq" && faq.length === 0) return null;
  if (type !== "hero" && type !== "legal" && type !== "faq" && body.length === 0 && items.length === 0) return null;

  return {
    section: { sectionType: type, headline, body, items, cta },
    faq,
  };
}
