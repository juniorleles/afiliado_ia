import { publicItemText } from "@/lib/product-showcase/v4/presentation";
import type { V4Model } from "@/lib/product-showcase/v4/model";
import { shouldRenderSection } from "@/lib/product-showcase/v4/model";
import { PREMIUM_CTA_LABEL } from "@/lib/presell-quality/premium-design";
import { premiumSlotsFromModel } from "@/lib/presell-quality/premium-slots";
import { PRESELL_SECTION_REGISTRY } from "@/lib/presell-template/section-registry";
import { PRESELL_STANDARD_ID, PRESELL_STANDARD_VERSION, type PresellStandardSectionId } from "@/lib/presell-template/standard-v1";
import type {
  PresellProductFormat,
  PresellTemplateDocument,
  TemplateAnnouncement,
  TemplateClaimTrace,
  TemplateSectionView,
} from "@/lib/presell-template/template-contract";

const DIGITAL =
  /\b(digital|ebook|e-book|online course|video course|download|pdf|software|membership|module|webinar)\b/i;
const URGENCY = /\b(limited[- ]time|hurry|only \d+ left|act now|today only|countdown)\b/i;

function evidenceOf(model: V4Model, path: string): string[] {
  const direct = model.contract.evidence.filter((item) => item.field === path || item.field.endsWith(`.${path}`)).map((item) => item.id);
  return direct;
}

function formatOf(model: V4Model): PresellProductFormat {
  const kind = `${model.contract.identity.productKind ?? ""} ${model.copy.headline.text}`;
  if (DIGITAL.test(kind)) return "DIGITAL";
  if ((model.contract.components ?? []).some((item) => item.role === "INGREDIENT")) return "PHYSICAL";
  if ((model.contract.operational?.shipping ?? []).length) return "PHYSICAL";
  if ((model.contract.components ?? []).some((item) => item.role === "INCLUDED_ITEM" || item.role === "COMPONENT")) {
    return DIGITAL.test(model.contract.components!.map((item) => item.name).join(" ")) ? "DIGITAL" : "UNKNOWN";
  }
  return "UNKNOWN";
}

function uniqueClaims(claims: TemplateClaimTrace[]): TemplateClaimTrace[] {
  const seen = new Set<string>();
  const out: TemplateClaimTrace[] = [];
  for (const claim of claims) {
    const key = claim.text.toLowerCase();
    if (!claim.text || seen.has(key)) continue;
    seen.add(key);
    out.push(claim);
  }
  return out;
}

function announcementFrom(model: V4Model): TemplateAnnouncement | null {
  const slots = premiumSlotsFromModel(model);
  const chip = slots.evidenceChips.find((item) => /dispatch|refund|day seller-stated/i.test(item.label));
  if (!chip) return null;
  if (URGENCY.test(chip.label)) return null;
  return {
    message: chip.label,
    evidenceRefs: evidenceOf(model, chip.icon === "shield" ? "guarantee" : "shipping"),
    commercialUrgency: false,
  };
}

function visible(model: V4Model, type: NonNullable<(typeof PRESELL_SECTION_REGISTRY)[number]["blueprintType"]>): boolean {
  return shouldRenderSection({
    type,
    blueprint: model.blueprint,
    hopSlot: model.hopSlot,
    hasHeroImage: Boolean(model.commercialImage),
  });
}

function sectionClaims(model: V4Model, id: PresellStandardSectionId): TemplateClaimTrace[] {
  const slots = premiumSlotsFromModel(model);
  if (id === "PREMIUM_HERO") {
    return uniqueClaims(
      [
        { text: slots.headline, evidenceRefs: evidenceOf(model, "description"), contractPath: "identity.productName" },
        ...(slots.subheadline
          ? [{ text: slots.subheadline, evidenceRefs: evidenceOf(model, "description"), contractPath: "valueProposition.headline" }]
          : []),
      ].filter((item) => item.text),
    );
  }
  if (id === "PRODUCT_OVERVIEW") {
    const section = model.blueprint.sections.find((item) => item.sectionType === "differentiators") ?? model.blueprint.sections.find((item) => item.sectionType === "benefits");
    const items = [
      ...(model.contract.description ? [{ text: publicItemText(model.contract.description.text), evidenceRefs: model.contract.description.evidenceRefs, contractPath: "description" }] : []),
      ...(model.contract.identity.productKind
        ? [{ text: model.contract.identity.productKind, evidenceRefs: evidenceOf(model, "productKind"), contractPath: "identity.productKind" }]
        : []),
      ...((section?.items.length ? section.items : section?.body.map((item) => ({ text: item })) ?? []).map((item) => ({
        text: publicItemText(item.text.text),
        evidenceRefs: evidenceOf(model, "features"),
        contractPath: "features",
      }))),
    ];
    return uniqueClaims(items);
  }
  if (id === "HOW_IT_WORKS") {
    return uniqueClaims(
      slots.usage.map((text) => ({ text, evidenceRefs: evidenceOf(model, "howItWorks"), contractPath: "usage" })),
    );
  }
  if (id === "INGREDIENTS_OR_MODULES") {
    return uniqueClaims(
      slots.ingredients.map((item) => ({
        text: item.detail ? `${item.name}: ${item.detail}` : item.name,
        evidenceRefs: evidenceOf(model, "ingredients"),
        contractPath: "components",
      })),
    );
  }
  if (id === "GUARANTEE") {
    return uniqueClaims(
      slots.guarantee.statements.map((text) => ({ text, evidenceRefs: evidenceOf(model, "guarantee"), contractPath: "guarantee" })),
    );
  }
  if (id === "SHIPPING_OR_ACCESS") {
    return uniqueClaims(
      slots.fulfillment
        .filter((item) => item.kind === "DISPATCH" || item.kind === "DELIVERY")
        .map((item) => ({ text: item.body, evidenceRefs: evidenceOf(model, "shipping"), contractPath: "operational.shipping" })),
    );
  }
  if (id === "TRUST_INFORMATION") {
    return uniqueClaims(
      slots.fulfillment
        .filter((item) => item.kind === "PAYMENT" || item.kind === "RETURNS")
        .map((item) => ({
          text: item.body,
          evidenceRefs: evidenceOf(model, item.kind === "PAYMENT" ? "payment" : "returns"),
          contractPath: item.kind === "PAYMENT" ? "offer" : "operational.returns",
        })),
    );
  }
  if (id === "PREMIUM_FAQ") {
    return uniqueClaims(slots.faq.map((item) => ({ text: item.question, evidenceRefs: evidenceOf(model, "faq"), contractPath: "faq" })));
  }
  if (id === "LEGAL_FOOTER") {
    const disclosure = model.contract.legal.affiliateDisclosure;
    return uniqueClaims(
      disclosure
        ? [{ text: disclosure, evidenceRefs: [] as string[], contractPath: "legal.affiliateDisclosure" }]
        : [],
    );
  }
  if (id === "COMMERCIAL_CTA") {
    return [];
  }
  if (id === "VERIFIED_TESTIMONIALS") {
    return [];
  }
  if (id === "ANNOUNCEMENT_BAR") {
    const bar = announcementFrom(model);
    return bar ? [{ text: bar.message, evidenceRefs: bar.evidenceRefs, contractPath: "operational" }] : [];
  }
  return [];
}

export function mapPresellStandardV1(model: V4Model): PresellTemplateDocument {
  const slots = premiumSlotsFromModel(model);
  const announcement = announcementFrom(model);
  const used = new Set<string>();
  const mark = (text: string) => used.add(text.toLowerCase());
  const unused = (text: string) => !used.has(text.toLowerCase());

  const sections: TemplateSectionView[] = PRESELL_SECTION_REGISTRY.map((entry) => {
    const claims = sectionClaims(model, entry.id).filter((item) => unused(item.text));
    let present = false;
    let omittedReason: string | null = null;
    if (entry.id === "PREMIUM_HERO") {
      present = Boolean(model.contract.identity.productName);
      if (!present) omittedReason = "Product name is missing.";
    } else if (entry.id === "LEGAL_FOOTER") {
      present = Boolean(model.contract.legal.affiliateDisclosure) && model.contract.legal.trustLinks.length > 0;
      if (!present) omittedReason = "Affiliate disclosure or trust links are missing.";
    } else if (entry.id === "ANNOUNCEMENT_BAR") {
      present = Boolean(announcement);
      omittedReason = present ? null : "No verified commercial message is eligible.";
    } else if (entry.id === "VERIFIED_TESTIMONIALS") {
      present = false;
      omittedReason = "No authentic authorized testimonials are on the Product Contract.";
    } else if (entry.id === "COMMERCIAL_CTA") {
      present = true;
    } else if (entry.id === "TRUST_INFORMATION") {
      present = claims.length > 0;
      omittedReason = present ? null : "No verified rating, payment, or returns fact remains after hero packing.";
    } else if (entry.id === "SHIPPING_OR_ACCESS") {
      present = claims.length > 0;
      omittedReason = present ? null : "No verified dispatch, delivery, or access fact remains.";
    } else if (entry.id === "PRODUCT_OVERVIEW") {
      present = claims.length > 0 && (visible(model, "differentiators") || visible(model, "benefits") || Boolean(model.contract.description));
      omittedReason = present ? null : "No approved overview facts.";
    } else if (entry.id === "HOW_IT_WORKS") {
      present = claims.length > 0;
      omittedReason = present ? null : "No approved usage or access steps.";
    } else if (entry.id === "INGREDIENTS_OR_MODULES") {
      present = claims.length > 0;
      omittedReason = present ? null : "No approved ingredients or modules.";
    } else if (entry.id === "GUARANTEE") {
      present = claims.length > 0;
      omittedReason = present ? null : "No approved guarantee terms.";
    } else if (entry.id === "PREMIUM_FAQ") {
      present = claims.length > 0;
      omittedReason = present ? null : "No approved FAQ answers.";
    }
    if (present) claims.forEach((item) => mark(item.text));
    return {
      id: entry.id,
      present,
      required: entry.required,
      omittedReason: present ? null : omittedReason,
      title: entry.id.replace(/_/g, " "),
      evidenceRefs: [...new Set(claims.flatMap((item) => item.evidenceRefs))],
      claims: present ? claims : [],
    };
  });

  return {
    standardId: PRESELL_STANDARD_ID,
    version: PRESELL_STANDARD_VERSION,
    productName: model.contract.identity.productName,
    productFormat: formatOf(model),
    announcement,
    sections,
    testimonials: {
      policy: "OMIT_UNLESS_AUTHENTIC_AUTHORIZED",
      status: "SECTION_OMITTED",
      reason: "Testimonials require origin, evidence, reuse permission, and product match. None are present.",
    },
    cta: { enabled: false, href: null, label: PREMIUM_CTA_LABEL },
    legalLinks: model.contract.legal.trustLinks.filter((item) => item.href.startsWith("/") || item.href.startsWith("https://")),
    disclosure: slots.disclosure,
  };
}

export function renderedTemplateSections(document: PresellTemplateDocument): TemplateSectionView[] {
  return document.sections.filter((item) => item.present);
}
