import type { Metadata } from "next";
import { ProductShowcasePremiumV1 } from "@/components/product-showcase/product-showcase-premium-v1";
import type { LandingDocument } from "@/lib/landing-composer/types";
import { emptyProductFacts, type ProductFormatFact } from "@/lib/product-facts";
import { buildAdaptivePlan } from "@/lib/product-showcase/adaptive-plan";
import { buildEditorialDocument } from "@/lib/product-showcase/editorial";
import { buildProductShowcase } from "@/lib/product-showcase/model";
import { AFFILIATE_DISCLOSURE_TEXT, PUBLIC_FOOTER_LINKS, getPublicSiteName } from "@/lib/public-site";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Powder fixture",
  robots: { index: false, follow: false },
};

const FORMAT: ProductFormatFact = {
  value: "powder",
  statement: "Powder in a pouch",
  provenance: "DIRECT_SOURCE",
  copyEligibility: "YES",
  policyFindings: [],
  sourceUrl: "https://example.test/cedar-powder",
  sourcePageCategory: "PRODUCT_DETAILS",
};

function fixtureDocument(): LandingDocument {
  return {
    version: 1,
    campaignId: 0,
    language: "en",
    generatedAt: "2026-10-19T00:00:00.000Z",
    sections: [
      { sectionId: "hero", content: { headline: "Cedar Powder", subheadline: null }, warnings: [] },
      { sectionId: "footer", content: { productName: "Cedar Powder" }, warnings: [] },
    ],
    seo: null,
    schema: null,
    metadata: { approachId: null, compositionTimeMs: 0, inputFingerprint: "powder-fixture", cached: false, included: [], omitted: [] },
    validationStatus: "PASS",
    renderStatus: "READY",
    warnings: [],
    errors: [],
  };
}

/**
 * In-memory powder fixture. It is not a campaign and it is not published.
 */
export default function PowderFixturePage() {
  const facts = emptyProductFacts("Cedar Powder", "https://example.test/cedar-powder", "IMPORTED");
  facts.confidence.usageInformation = "DIRECT_SOURCE";
  facts.usageInformation = ["Powder in a pouch", "Mix one level scoop with water"];
  facts.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
  facts.ingredientsOrComponents = ["Cedar bark", "River malt"];
  facts.confidence.pricingInformation = "DIRECT_SOURCE";
  facts.pricingInformation = "One pouch for USD 36";
  facts.confidence.guaranteeInformation = "DIRECT_SOURCE";
  facts.guaranteeInformation = "30-day refund";
  facts.confidence.cautions = "DIRECT_SOURCE";
  facts.cautions = ["This product is not intended to diagnose, treat, cure, or prevent any disease."];
  facts.productFormat = FORMAT;
  const plan = buildAdaptivePlan({ facts });
  const editorial = buildEditorialDocument({
    facts,
    plan,
    affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT,
  });
  const model = buildProductShowcase(fixtureDocument(), {
    mode: "facts",
    siteName: getPublicSiteName(),
    affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT,
    footerLinks: [...PUBLIC_FOOTER_LINKS],
  });
  return (
    <ProductShowcasePremiumV1
      model={{ ...model, productName: "Cedar Powder", adaptivePlan: plan, editorial, image: null, cta: null }}
      labHref="/admin/lab/product-showcase-demo"
      showLabBar={false}
    />
  );
}
