import type { LandingDocument } from "@/lib/landing-composer/types";
import { emptyProductFacts, type OperationalFact, type ProductFacts, type ProductFormatFact } from "@/lib/product-facts";
import { buildAdaptivePlan, type AdaptivePresentationPlan } from "@/lib/product-showcase/adaptive-plan";
import { buildEditorialDocument, type EditorialDocument } from "@/lib/product-showcase/editorial";
import { buildProductShowcase, type ProductShowcaseModel } from "@/lib/product-showcase/model";
import { AFFILIATE_DISCLOSURE_TEXT, PUBLIC_FOOTER_LINKS, TRUST_EDITORIAL, getPublicSiteName } from "@/lib/public-site";

/**
 * Synthetic homologation fixtures. Not campaigns and not real products.
 * The renderer is not branched by product.
 */

export const HOMOLOGATION_CASES = ["capsule", "few", "thin", "operational", "described"] as const;
export type HomologationCase = (typeof HOMOLOGATION_CASES)[number];

const PACKSHOT = { src: "/lab-fixtures/synthetic-packshot.svg", alt: "Northwind Capsule product image" };

function formatFact(value: string, statement: string, sourceUrl: string): ProductFormatFact {
  return {
    value,
    statement,
    provenance: "DIRECT_SOURCE",
    copyEligibility: "YES",
    policyFindings: [],
    sourceUrl,
    sourcePageCategory: "PRODUCT_DETAILS",
  };
}

function allow(facts: ProductFacts, field: "description" | "features" | "ingredientsOrComponents" | "usageInformation" | "pricingInformation" | "guaranteeInformation" | "cautions") {
  facts.confidence[field] = "DIRECT_SOURCE";
}

function documentFor(name: string, fingerprint: string): LandingDocument {
  return {
    version: 1,
    campaignId: 0,
    language: "en",
    generatedAt: "2026-10-19T00:00:00.000Z",
    sections: [
      { sectionId: "hero", content: { headline: name, subheadline: null }, warnings: [] },
      { sectionId: "footer", content: { productName: name }, warnings: [] },
    ],
    seo: null,
    schema: null,
    metadata: { approachId: null, compositionTimeMs: 0, inputFingerprint: fingerprint, cached: false, included: [], omitted: [] },
    validationStatus: "PASS",
    renderStatus: "READY",
    warnings: [],
    errors: [],
  };
}

export type HomologationFixture = {
  id: HomologationCase;
  synthetic: true;
  label: string;
  facts: ProductFacts;
  plan: AdaptivePresentationPlan;
  editorial: EditorialDocument;
  model: ProductShowcaseModel;
  ppc: { brandPpc: "ALLOWED" | "BLOCKED" | "UNKNOWN"; genericSearchPpc: "ALLOWED" | "BLOCKED" | "UNKNOWN" } | null;
};

function render(facts: ProductFacts, plan: AdaptivePresentationPlan, editorial: EditorialDocument, image: { src: string; alt: string } | null, cta: { href: string; label: string } | null): ProductShowcaseModel {
  const base = buildProductShowcase(documentFor(facts.productName, "homologation-fixture"), {
    mode: "facts",
    siteName: getPublicSiteName(),
    affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT,
    review: TRUST_EDITORIAL,
    footerLinks: [...PUBLIC_FOOTER_LINKS],
    image,
    cta,
  });
  return { ...base, productName: facts.productName, adaptivePlan: plan, editorial, image, cta };
}

function operationalFact<K extends string>(kind: K, statement: string, sourceUrl: string): OperationalFact<K> {
  return { statement, kind, provenance: "DIRECT_SOURCE", copyEligibility: "YES", policyFindings: [], sourceUrl, sourcePageCategory: "PRODUCT_DETAILS" };
}

export function buildHomologationFixture(id: HomologationCase): HomologationFixture {
  if (id === "operational" || id === "described") {
    const source = "https://example.test/harbor-tonic";
    const facts = emptyProductFacts("Harbor Tonic", source, "IMPORTED");
    facts.manufacturer = "Harbor Works";
    facts.confidence.manufacturer = "DIRECT_SOURCE";
    facts.shippingInformation = [operationalFact("DELIVERY_ESTIMATE", "Orders ship within two business days.", source)];
    facts.returnsInformation = [operationalFact("RETURN_WINDOW", "Unopened items may be returned within 30 days.", source)];
    if (id === "described") {
      allow(facts, "description");
      facts.description = "A bottled herbal tonic.";
      allow(facts, "ingredientsOrComponents");
      facts.ingredientsOrComponents = ["Harbor leaf", "Salt bark", "River malt"];
      allow(facts, "guaranteeInformation");
      facts.guaranteeInformation = "45-day refund";
    }
    const plan = buildAdaptivePlan({ facts });
    const editorial = buildEditorialDocument({ facts, plan, affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT });
    return {
      id,
      synthetic: true,
      label: id === "operational"
        ? "Synthetic product with only operational facts and no proven proposition. Not a real product."
        : "Synthetic product with a description plus manufacturer, shipping and returns. Not a real product.",
      facts,
      plan,
      editorial,
      model: render(facts, plan, editorial, null, null),
      ppc: null,
    };
  }
  if (id === "capsule") {
    const source = "https://example.test/northwind-capsule";
    const facts = emptyProductFacts("Northwind Capsule", source, "IMPORTED");
    allow(facts, "description");
    facts.description = "A daily capsule.";
    allow(facts, "features");
    facts.features = ["Bottle of 30"];
    allow(facts, "ingredientsOrComponents");
    facts.ingredientsOrComponents = ["Northpetal", "Ambergill"];
    allow(facts, "usageInformation");
    facts.usageInformation = ["Take one capsule with water"];
    allow(facts, "pricingInformation");
    facts.pricingInformation = "One bottle for USD 49";
    allow(facts, "guaranteeInformation");
    facts.guaranteeInformation = "60-day refund";
    allow(facts, "cautions");
    facts.cautions = ["This product is not intended to diagnose, treat, cure, or prevent any disease."];
    facts.productFormat = formatFact("capsule", "Once-daily capsule", source);
    const plan = buildAdaptivePlan({
      facts,
      approvedPackshot: PACKSHOT,
      cta: { href: "https://hop.example/northwind", label: "See offer" },
      ppc: { brandPpc: "ALLOWED", genericSearchPpc: "ALLOWED" },
    });
    const editorial = buildEditorialDocument({ facts, plan, affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT });
    return {
      id,
      synthetic: true,
      label: "Synthetic capsule with commercial facts and a lab packshot. Not a real product.",
      facts,
      plan,
      editorial,
      model: render(facts, plan, editorial, PACKSHOT, plan.cta),
      ppc: { brandPpc: "ALLOWED", genericSearchPpc: "ALLOWED" },
    };
  }
  if (id === "few") {
    const source = "https://example.test/two-leaf";
    const facts = emptyProductFacts("Two Leaf", source, "IMPORTED");
    allow(facts, "ingredientsOrComponents");
    facts.ingredientsOrComponents = ["Northpetal", "River malt"];
    allow(facts, "usageInformation");
    facts.usageInformation = ["Take one capsule with water"];
    allow(facts, "guaranteeInformation");
    facts.guaranteeInformation = "30-day refund";
    facts.productFormat = formatFact("capsule", "Capsule in a bottle", source);
    const plan = buildAdaptivePlan({ facts });
    const editorial = buildEditorialDocument({ facts, plan, affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT });
    return {
      id,
      synthetic: true,
      label: "Synthetic product with few ingredients. Not a real product.",
      facts,
      plan,
      editorial,
      model: render(facts, plan, editorial, null, null),
      ppc: null,
    };
  }
  const facts = emptyProductFacts("Blank Product", "https://example.test/blank-product", "IMPORTED");
  const plan = buildAdaptivePlan({ facts });
  const editorial = buildEditorialDocument({ facts, plan, affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT });
  return {
    id: "thin",
    synthetic: true,
    label: "Synthetic product with insufficient commercial information. Not a real product.",
    facts,
    plan,
    editorial,
    model: render(facts, plan, editorial, null, null),
    ppc: null,
  };
}
