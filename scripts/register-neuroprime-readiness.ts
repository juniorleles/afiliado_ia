/**
 * Register NeuroPrime readiness without generating LP, ads, or paid calls.
 * Idempotent: reuses campaign slug neuroprime when present.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createCampaign, getCampaignById, getCampaignBySlug, writeCampaignSourceFacts } from "../src/lib/campaigns.ts";
import { getDb } from "../src/lib/db.ts";
import { writeAffiliateProgram } from "../src/lib/affiliate-program.ts";
import { listOfficialPromoAssets, registerOfficialPromoCandidate } from "../src/lib/official-assets/store.ts";
import type { ProductFacts } from "../src/lib/product-facts.ts";

const AFFILIATE_PAGE = "https://theneuroprime.com/affiliates/";
const SALES_PAGE = "https://theneuroprime.com/";
const VERIFIED_AT = "2026-10-15T19:30:00.000Z";
const PRODUCT = "NeuroPrime";

function buildFacts(): ProductFacts {
  return {
    productName: PRODUCT,
    sourceUrl: SALES_PAGE,
    origin: "IMPORTED",
    features: [],
    ingredientsOrComponents: [
      "Moringa",
      "Pine Bark Extract",
      "Ginkgo Biloba",
      "Tamarind",
      "Lion's Mane Mushroom",
      "Chlorella",
      "Bacopa monnieri",
      "Spirulina",
      "Neem",
    ],
    usageInformation: [
      "Take one drop per day, preferably in the morning.",
      "May be taken directly or with tea, coffee, juice, or another beverage.",
      "Shake the bottle well before use.",
    ],
    cautions: [
      "If you currently have a medical condition or you are taking other prescription medication, show a bottle of NeuroPrime to your doctor before you take it.",
    ],
    pricingInformation: "1 bottle $59; 3 bottles $147 total; 6 bottles $234 total.",
    offerFacts: [
      {
        packageName: "1 X BOTTLE",
        unitPrice: "$59",
        quantity: "1",
        totalPrice: "$59",
        sourceUrl: SALES_PAGE,
        confidence: "DIRECT_SOURCE",
      },
      {
        packageName: "3 X BOTTLES",
        unitPrice: "",
        quantity: "3",
        totalPrice: "$147",
        sourceUrl: SALES_PAGE,
        confidence: "DIRECT_SOURCE",
      },
      {
        packageName: "6 X BOTTLES",
        unitPrice: "",
        quantity: "6",
        totalPrice: "$234",
        sourceUrl: SALES_PAGE,
        confidence: "DIRECT_SOURCE",
      },
    ],
    guaranteeInformation: "365-day 100% money-back guarantee.",
    manufacturer: undefined,
    ingredientContext: [
      {
        ingredient: "NeuroPrime",
        statement: "The seller states NeuroPrime is intended to help support memory function.",
        relation: "DESCRIBED_AS",
        attribution: "SELLER",
        provenance: "DIRECT_SOURCE",
        copyEligibility: "NO",
        policyFindings: ["SELLER_HEALTH_CLAIM"],
        sourceUrl: SALES_PAGE,
        sourcePageCategory: "PRODUCT_DETAILS",
        retrievedAt: VERIFIED_AT,
      },
    ],
    shippingInformation: [
      {
        statement: "Every order over 3 comes with free shipping.",
        kind: "OTHER",
        provenance: "DIRECT_SOURCE",
        copyEligibility: "YES",
        policyFindings: [],
        sourceUrl: SALES_PAGE,
        sourcePageCategory: "SHIPPING",
        retrievedAt: VERIFIED_AT,
      },
    ],
    productFormat: {
      value: "drops",
      statement: "Liquid drops; the seller instructs one drop per day.",
      provenance: "DIRECT_SOURCE",
      copyEligibility: "YES",
      policyFindings: [],
      sourceUrl: SALES_PAGE,
      sourcePageCategory: "USAGE",
      retrievedAt: VERIFIED_AT,
    },
    returnsInformation: [
      {
        statement: "365-day money-back guarantee; return unused product for a refund.",
        kind: "RETURN_WINDOW",
        provenance: "DIRECT_SOURCE",
        copyEligibility: "YES",
        policyFindings: [],
        sourceUrl: SALES_PAGE,
        sourcePageCategory: "REFUNDS",
        retrievedAt: VERIFIED_AT,
      },
    ],
    sourceSnippets: [],
    importWarnings: [
      "Facts taken only from the official sales page and affiliate page. Market Intelligence was not used.",
      "Seller memory-support claims are recorded as seller-attributed context with copyEligibility=NO. DIRECT_SOURCE means the seller stated them, not independent verification.",
      "The sales-page scientific reference list was not imported as product evidence.",
      "The phrase 100% compliant on the affiliate page is seller marketing language, not Google Ads approval.",
    ],
    confidence: {
      productName: "DIRECT_SOURCE",
      description: "NOT_FOUND",
      features: "NOT_FOUND",
      ingredientsOrComponents: "DIRECT_SOURCE",
      usageInformation: "DIRECT_SOURCE",
      cautions: "DIRECT_SOURCE",
      pricingInformation: "DIRECT_SOURCE",
      guaranteeInformation: "DIRECT_SOURCE",
      manufacturer: "NOT_FOUND",
    },
    importQuality: "PARTIAL",
    productImageProvenance: "NOT_FOUND",
  };
}

function ensureCampaign() {
  const existing = getCampaignBySlug("neuroprime");
  if (existing) return existing;
  return createCampaign({
    name: PRODUCT,
    slug: "neuroprime",
    headline: "",
    body: "",
    ctaLabel: "",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });
}

function writeBrief(campaignId: number) {
  const brief = {
    version: 1,
    notes: "ClickBank candidate registered for readiness only. No LP generation in this step.",
    productName: PRODUCT,
    marketplace: "clickbank",
    brand: null,
    category: "dietary-supplement",
    country: "US",
    language: "en",
    goal: "educational",
    research: {
      competitors: false,
      reddit: false,
      reviews: false,
      forums: false,
      youtube: false,
      google: false,
      news: false,
    },
    generation: {
      landingPage: false,
      headlines: false,
      descriptions: false,
      rsa: false,
      seo: false,
      faq: false,
    },
  };
  getDb().prepare("UPDATE campaigns SET campaignBriefJson = ?, updatedAt = ? WHERE id = ?").run(
    JSON.stringify(brief),
    new Date().toISOString(),
    campaignId,
  );
}

function registerAssets(campaignId: number) {
  const common = {
    campaignId,
    sourcePage: AFFILIATE_PAGE,
    productName: PRODUCT,
    verifiedAt: VERIFIED_AT,
  };

  registerOfficialPromoCandidate({
    ...common,
    section: "product",
    originalUrl: "https://theneuroprime.com/assets-mbn/images/neuro_xt_blck_btls.avif",
    fileName: "neuro_xt_blck_btls.avif",
    status: "rejected",
    blockReason: "Arquivo AVIF fora dos formatos aceitos pelo Asset Manager (JPEG/PNG/WebP).",
    reviewNote:
      "Exibido na página de afiliados, mas sem seção Product Images com autorização explícita de packshot. Formato AVIF impede validação/armazenamento atual. Texto incorporado não inspecionado pixel a pixel.",
    permissionEvidence: `Arquivo exibido em ${AFFILIATE_PAGE}. Autorização de uso promocional do packshot não está explícita como nas seções Product Images de outros programas. Verificado em ${VERIFIED_AT}.`,
  });

  registerOfficialPromoCandidate({
    ...common,
    section: "campaign",
    originalUrl: "https://go.nutraorganics.co/1n4olw",
    fileName: "banner-collection.zip",
    status: "rejected",
    blockReason: "Pacote ZIP/banners animados não inspecionados pixel a pixel; aprovação automática proibida.",
    reviewNote:
      "A página de afiliados disponibiliza a coleção de banners para download. GIFs animados tipicamente contêm claims. Nenhuma peça foi aprovada.",
    permissionEvidence: `A seção Banners de ${AFFILIATE_PAGE} disponibiliza a coleção para afiliados. A autorização cobre os arquivos listados e não comprova alegação médica. Verificado em ${VERIFIED_AT}.`,
  });

  registerOfficialPromoCandidate({
    ...common,
    section: "campaign",
    originalUrl: "https://affpineal2.qltrk.com/l/theneuroprimebanner",
    fileName: "theneuroprimebanner-pack",
    status: "rejected",
    blockReason: "Pacote de banners não inspecionado pixel a pixel; aprovação automática proibida.",
    reviewNote: "Link oficial de download de banners na página de afiliados. Sem aprovação.",
    permissionEvidence: `Link de download listado na seção Banners de ${AFFILIATE_PAGE}. Verificado em ${VERIFIED_AT}.`,
  });
}

function writeEvidence(campaignId: number) {
  const dir = path.join(process.cwd(), "data", "evidence", "neuroprime-readiness-v1");
  mkdirSync(dir, { recursive: true });
  const campaign = getCampaignById(campaignId);
  const assets = listOfficialPromoAssets(campaignId);
  const payload = {
    verifiedAt: VERIFIED_AT,
    campaignId,
    slug: campaign?.slug,
    publicationStatus: campaign?.publicationStatus,
    productSource: SALES_PAGE,
    affiliateProgram: "ClickBank",
    affiliateTerms: AFFILIATE_PAGE,
    clickbankVendor: "neuroprime",
    brandPpc: "BLOCKED",
    genericSearchPpc: "UNKNOWN",
    googleAdsPolicy: "REVIEW_REQUIRED",
    affiliateHoplink: null,
    directCheckoutLinking: "FORBIDDEN",
    assets: assets.map((asset) => ({
      id: asset.id,
      section: asset.section,
      originalUrl: asset.originalUrl,
      status: asset.status,
      blockReason: asset.blockReason,
      reviewNote: asset.reviewNote,
    })),
    notes: [
      "Affiliates can NOT run any PPC brand campaigns and may not bid on NeuroPrime branded keywords.",
      "Generic Search PPC is not expressly confirmed as allowed; traffic profile mentions PPC without naming Google Search generic.",
      "Direct linking to cart/order forms is forbidden.",
      "Copying ads or landing pages of other affiliates is forbidden.",
      "100% compliant on the affiliate page is not Google Ads approval.",
    ],
  };
  writeFileSync(path.join(dir, "readiness.json"), JSON.stringify(payload, null, 2));
}

async function main() {
  const campaign = ensureCampaign();
  writeCampaignSourceFacts(campaign.id, JSON.stringify(buildFacts()));
  writeBrief(campaign.id);
  writeAffiliateProgram(campaign.id, {
    version: 1,
    platform: "ClickBank",
    vendorId: "neuroprime",
    affiliatePageUrl: AFFILIATE_PAGE,
    termsUrl: AFFILIATE_PAGE,
    termsVerifiedAt: VERIFIED_AT,
    productSalesUrl: SALES_PAGE,
    brandPpc: "BLOCKED",
    genericSearchPpc: "UNKNOWN",
    googleAdsPolicy: "REVIEW_REQUIRED",
    directCheckoutLinking: "FORBIDDEN",
    personalHoplink: null,
    notes: [
      "Brand PPC blocked by affiliate terms.",
      "Generic Search PPC left UNKNOWN until express program confirmation and Google policy review.",
      "No personal ClickBank affiliate ID is stored.",
      "Seller phrase 100% compliant is not Google approval.",
    ],
  });
  getDb()
    .prepare(
      `UPDATE campaigns
       SET productAssetStatus = COALESCE(productAssetStatus, 'NEEDS_ASSET'),
           productImageSrc = NULL,
           productImageProvenance = NULL,
           updatedAt = ?
       WHERE id = ?`,
    )
    .run(new Date().toISOString(), campaign.id);
  registerAssets(campaign.id);
  writeEvidence(campaign.id);

  const saved = getCampaignById(campaign.id);
  const assets = listOfficialPromoAssets(campaign.id);
  console.log(
    JSON.stringify(
      {
        campaignId: saved?.id,
        slug: saved?.slug,
        publicationStatus: saved?.publicationStatus,
        productImageSrc: saved?.productImageSrc,
        affiliateUrl: saved?.affiliateUrl,
        assetCount: assets.length,
        approved: assets.filter((a) => a.status === "approved").length,
        rejected: assets.filter((a) => a.status === "rejected").length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
