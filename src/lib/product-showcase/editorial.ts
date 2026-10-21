import type { AdaptivePresentationPlan, CommercialLimitationCode } from "@/lib/product-showcase/adaptive-plan";
import { isConsumerHealthClaim } from "@/lib/landing-composer/present";
import { copyEligibleList, copyEligibleOperationalItems, copyEligibleScalar, hasContactDetail, isCopyEligibleConfidence, type ProductFacts } from "@/lib/product-facts";

/**
 * Editorial blocks for the adaptive plan.
 * Each consumer line is an eligible fact or a fixed disclosure.
 * This module does not render and does not invent claims.
 */

export type EditorialBlockId =
  | "introduction"
  | "format"
  | "ingredients"
  | "characteristics"
  | "usage"
  | "price"
  | "guarantee"
  | "important"
  | "provenance"
  | "fulfillment"
  | "disclosure";

/**
 * Editorial role of a line. Only PROPOSITION can open the page.
 * Provenance, fulfillment, returns and commercial lines are always secondary.
 */
export type EditorialRole =
  | "PROPOSITION"
  | "DESCRIPTION_AND_DIFFERENTIATORS"
  | "IDENTITY_PROVENANCE"
  | "FULFILLMENT"
  | "RETURNS"
  | "COMMERCIAL_SUPPLEMENTARY";

export const LEAD_ELIGIBLE_ROLES: readonly EditorialRole[] = ["PROPOSITION"];

export type EditorialTrace = { field: string; text: string; role?: EditorialRole };

export type EditorialBlock = {
  id: EditorialBlockId;
  heading: string;
  paragraphs: string[];
  items: string[];
  trace: EditorialTrace[];
  /**
   * Optional wording for the composition block when the source or operator stated what the list is
   * (components, materials, included items). Absent means the original wording, so existing
   * campaigns render exactly as before.
   */
  wording?: { kicker: string; note: string; countLabel: string };
};

export type EditorialDocument = {
  productName: string;
  blocks: EditorialBlock[];
  limitations: CommercialLimitationCode[];
  benefits: "required" | "omit";
  cta: { href: string; label: string } | null;
};

const SOURCE_ORIGIN = "Declared by the product source";

function keyOf(value: string): string {
  return value.toLowerCase().replace(/[™®©]/g, "").replace(/\s+/g, " ").trim();
}

function showable(value: string): boolean {
  const text = value.trim();
  return Boolean(text) && !isConsumerHealthClaim(text);
}

function ingredientNote(facts: ProductFacts | null, name: string): string | null {
  const entry = (facts?.ingredientContext ?? []).find((item) => {
    if (keyOf(item.ingredient) !== keyOf(name)) return false;
    if (item.copyEligibility !== "YES" || !isCopyEligibleConfidence(item.provenance)) return false;
    if (item.kind !== "NEUTRAL_CONTEXT") return false;
    return showable(item.statement);
  });
  return entry?.statement.trim() ?? null;
}

function addsInformation(next: string, existing: string[]): boolean {
  const key = keyOf(next);
  if (!key) return false;
  if (existing.some((line) => {
    const current = keyOf(line);
    return current === key || current.includes(key);
  })) return false;
  const known = new Set(existing.flatMap((line) => keyOf(line).split(" ")));
  return key.split(" ").some((word) => word.length > 2 && !known.has(word));
}

/**
 * A manufacturer field often mixes the name with support labels and help links.
 * A bare URL or a label that ends in a colon is contact evidence, never a name.
 */
export function isContactFragment(line: string): boolean {
  const text = line.trim();
  return /^(?:https?:\/\/|www\.)\S+$/i.test(text) || /:$/.test(text);
}

function manufacturerName(facts: ProductFacts): string | null {
  const value = copyEligibleScalar(facts.manufacturer, facts.confidence.manufacturer);
  const line = value.split(/\r?\n/).map((item) => item.trim()).find((item) => item && !hasContactDetail(item) && !isContactFragment(item) && showable(item));
  return line ?? null;
}

function operationalRole(field: string): EditorialRole {
  if (field === "manufacturer") return "IDENTITY_PROVENANCE";
  if (field === "returnsInformation") return "RETURNS";
  if (field === "shippingInformation") return "FULFILLMENT";
  return "COMMERCIAL_SUPPLEMENTARY";
}

/**
 * The lead is the paragraph traced as PROPOSITION. A page without one has no lead
 * and the renderer must present the product neutrally, never promoting a secondary line.
 */
export function editorialLead(block: EditorialBlock | null | undefined): { lead: string | null; summary: string[] } {
  if (!block) return { lead: null, summary: [] };
  const roleOf = (text: string) => block.trace.find((item) => item.text === text)?.role;
  const lead = block.paragraphs.find((text) => {
    const role = roleOf(text);
    return role !== undefined && LEAD_ELIGIBLE_ROLES.includes(role);
  }) ?? null;
  return { lead, summary: block.paragraphs.filter((text) => text !== lead) };
}

function compositionWording(
  role: ProductFacts["componentRole"],
  count: number,
): { heading: string; kicker: string; note: string; countLabel: string; countLine: string } | null {
  const many = count !== 1;
  switch (role) {
    case "COMPONENT":
      return { heading: "Declared components", kicker: "Components", note: "Names as declared by the product source.", countLabel: "Components", countLine: `${count} ${many ? "components" : "component"}` };
    case "MATERIAL":
      return { heading: "Declared materials", kicker: "Materials", note: "Names as declared by the product source.", countLabel: "Materials", countLine: `${count} ${many ? "materials" : "material"}` };
    case "INCLUDED_ITEM":
      return { heading: "What is included", kicker: "Included", note: "Items as declared by the product source.", countLabel: "Included items", countLine: `${count} ${many ? "items" : "item"}` };
    default:
      return null;
  }
}

/** Eligible operational facts that are not format. Contact lines stay out. */
function operationalRestatements(facts: ProductFacts | null): Array<{ field: string; text: string }> {
  if (!facts) return [];
  const lines: Array<{ field: string; text: string }> = [];
  const manufacturer = manufacturerName(facts);
  if (manufacturer) lines.push({ field: "manufacturer", text: manufacturer });
  for (const item of copyEligibleOperationalItems(facts)) {
    if (item.field === "productFormat" || !showable(item.statement)) continue;
    lines.push({ field: item.field, text: item.statement });
  }
  return lines;
}

export function buildEditorialDocument(input: {
  facts: ProductFacts | null;
  plan: AdaptivePresentationPlan;
  affiliateDisclosure: string;
  healthDisclaimer?: string | null;
}): EditorialDocument {
  const facts = input.facts;
  const plan = input.plan;
  const productName = facts?.productName.trim() || "";
  const description = facts ? copyEligibleScalar(facts.description, facts.confidence.description) : "";
  const seen = new Set<string>();
  const blocks: EditorialBlock[] = [];

  const remember = (value: string) => {
    const key = keyOf(value);
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };

  const leadCandidates = [
    description,
    ...plan.features,
  ].map((line) => line.trim()).filter((line) => showable(line) && line.length <= 90);
  const lead = leadCandidates.find((line) => {
    if (plan.formatStatement && keyOf(line) === keyOf(plan.formatStatement)) return false;
    if (plan.guarantee && keyOf(line) === keyOf(plan.guarantee)) return false;
    if (plan.price && keyOf(line) === keyOf(plan.price.statement)) return false;
    if (plan.usage.some((usage) => keyOf(usage) === keyOf(line))) return false;
    if (plan.ingredients.some((name) => keyOf(name) === keyOf(line))) return false;
    return true;
  }) ?? null;

  if (productName) {
    const trace: EditorialTrace[] = [{ field: "productName", text: productName }];
    const paragraphs: string[] = [];
    if (lead && remember(lead)) {
      paragraphs.push(lead);
      trace.push({ field: description && keyOf(description) === keyOf(lead) ? "description" : "features", text: lead, role: "PROPOSITION" });
    }
    remember(productName);
    blocks.push({ id: "introduction", heading: productName, paragraphs, items: [], trace });
  }

  if (plan.format !== "unknown" && plan.formatStatement && remember(plan.formatStatement)) {
    blocks.push({
      id: "format",
      heading: "Format",
      paragraphs: [plan.formatStatement],
      items: [],
      trace: [{ field: "productFormat", text: plan.formatStatement, role: "COMMERCIAL_SUPPLEMENTARY" }],
    });
  }

  if (plan.ingredientCount > 0) {
    const notes = plan.ingredients.map((name) => ({ name, note: ingredientNote(facts, name) }));
    const items = notes.map(({ name, note }) => {
      const line = note && keyOf(note) !== keyOf(name) ? `${name} — ${note}` : name;
      remember(line);
      remember(name);
      if (note) remember(note);
      return line;
    });
    // An unstated role keeps the original wording. A stated role only changes the nouns, never the facts.
    const wording = compositionWording(facts?.componentRole, plan.ingredientCount);
    const countLine = wording ? wording.countLine : `${plan.ingredientCount} ingredients`;
    remember(countLine);
    blocks.push({
      id: "ingredients",
      heading: wording ? wording.heading : "Declared composition",
      ...(wording ? { wording: { kicker: wording.kicker, note: wording.note, countLabel: wording.countLabel } } : {}),
      paragraphs: [countLine],
      items,
      trace: [
        { field: "ingredientsOrComponents", text: countLine },
        ...notes.flatMap(({ name, note }) => [
          { field: "ingredientsOrComponents", text: name },
          ...(note && keyOf(note) !== keyOf(name) ? [{ field: "ingredientContext", text: note }] : []),
        ]),
      ],
    });
  }

  const characteristics = plan.benefits === "required"
    ? plan.features.filter((line) => showable(line) && !seen.has(keyOf(line)))
    : [];
  const introduction = blocks.find((item) => item.id === "introduction");
  if (characteristics.length === 1 && introduction) {
    const line = characteristics[0];
    remember(line);
    introduction.paragraphs.push(line);
    introduction.trace.push({ field: "features", text: line, role: "DESCRIPTION_AND_DIFFERENTIATORS" });
  } else if (characteristics.length > 1) {
    for (const line of characteristics) remember(line);
    blocks.push({
      id: "characteristics",
      heading: "Stated by the product source",
      paragraphs: [],
      items: characteristics,
      trace: characteristics.map((item) => ({ field: "features", text: item })),
    });
  }

  const usage = plan.usage.filter((line) => remember(line));
  if (usage.length > 0) {
    blocks.push({
      id: "usage",
      heading: "Use",
      paragraphs: usage,
      items: [],
      trace: usage.map((item) => ({ field: "usageInformation", text: item })),
    });
  }

  if (plan.price && remember(plan.price.statement)) {
    blocks.push({
      id: "price",
      heading: "Price",
      paragraphs: [plan.price.statement],
      items: [],
      trace: [{ field: "pricingInformation", text: plan.price.statement, role: "COMMERCIAL_SUPPLEMENTARY" }],
    });
  }

  if (plan.guarantee && remember(plan.guarantee)) {
    blocks.push({
      id: "guarantee",
      heading: "Guarantee",
      paragraphs: [plan.guarantee, SOURCE_ORIGIN],
      items: [],
      trace: [{ field: "guaranteeInformation", text: plan.guarantee, role: "COMMERCIAL_SUPPLEMENTARY" }],
    });
  }

  const cautions = facts
    ? copyEligibleList(facts.cautions, facts.confidence.cautions).map((line) => line.trim()).filter(showable)
    : [];
  const disclaimer = input.healthDisclaimer?.trim() ?? "";
  const important = [...cautions, ...(disclaimer ? [disclaimer] : [])];
  if (important.length > 0) {
    blocks.push({
      id: "important",
      heading: "Important information",
      paragraphs: important,
      items: [],
      trace: [
        ...cautions.map((item) => ({ field: "cautions", text: item })),
        ...(disclaimer ? [{ field: "healthDisclaimer", text: disclaimer }] : []),
      ],
    });
  }

  const disclosure = input.affiliateDisclosure.trim();
  if (disclosure) {
    blocks.push({
      id: "disclosure",
      heading: "Disclosure",
      paragraphs: [disclosure],
      items: [],
      trace: [{ field: "affiliateDisclosure", text: disclosure }],
    });
  }

  // Operational facts are restated by role in secondary blocks. They never enter the introduction.
  const stated = blocks.flatMap((item) => [...item.paragraphs, ...item.items]);
  const guaranteeBlock = blocks.find((item) => item.id === "guarantee");
  let provenance: EditorialBlock | null = null;
  let fulfillment: EditorialBlock | null = null;
  for (const extra of operationalRestatements(facts)) {
    if (!addsInformation(extra.text, stated) || !remember(extra.text)) continue;
    const role = operationalRole(extra.field);
    let target: EditorialBlock;
    if (role === "IDENTITY_PROVENANCE") {
      provenance ??= { id: "provenance", heading: "Manufacturer", paragraphs: [], items: [], trace: [] };
      target = provenance;
    } else if (role === "RETURNS" && guaranteeBlock) {
      target = guaranteeBlock;
    } else {
      fulfillment ??= { id: "fulfillment", heading: "Order details", paragraphs: [], items: [], trace: [] };
      target = fulfillment;
    }
    target.paragraphs.push(extra.text);
    target.trace.push({ field: extra.field, text: extra.text, role });
    stated.push(extra.text);
  }
  const secondary = [provenance, fulfillment].filter((item): item is EditorialBlock => item !== null);
  if (secondary.length > 0) {
    const anchor = blocks.findIndex((item) => item.id === "important" || item.id === "disclosure");
    blocks.splice(anchor >= 0 ? anchor : blocks.length, 0, ...secondary);
  }

  return {
    productName,
    blocks,
    limitations: plan.limitations,
    benefits: plan.benefits,
    cta: plan.cta,
  };
}
