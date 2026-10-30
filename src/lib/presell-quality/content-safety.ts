import type { V4Model } from "@/lib/product-showcase/v4/model";
import { renderedCopyFromModel } from "@/lib/presell-quality/context";
import type { ContentManifest } from "@/lib/presell-quality/content-manifest";
import { galleryHasDuplicateSrc } from "@/lib/presell-quality/apply-declared-media";

export type ContentSafetyFinding = { code: string; message: string };

export type ContentSafetyReport = {
  gate: "PASS" | "FAIL";
  findings: ContentSafetyFinding[];
  unsupportedClaimsFound: boolean;
  commercialConditionsPreserved: boolean;
  packshotAssetId: string | null;
  commercialCtaEnabled: boolean;
  publicationReady: boolean;
};

const MEDICAL =
  /\b(blood sugar|fat[- ]burn(?:ing)?|clinically proven|scientifically proven|cures?|treats?|prevents?|brain[- ]fog|energy crashes?|drop pounds|perfect blood sugar|fda[- ]approved|gmp certified facility)\b/i;
const INVENTED_COMMERCIAL =
  /\b(free shipping|frete gr[aá]tis|limited[- ]time|buy \d+ get|discount package|\$\d+|guaranteed delivery|entrega garantida)\b/i;
const TESTIMONIAL = /\b(thousands of people|i tried|changed my life|star review|customer testimonial)\b/i;
const MANUFACTURER = /\b(manufactured in the united states|we are the manufacturer|fabricante oficial)\b/i;
const SECURITY_OVERCLAIM =
  /\b(compra 100% segura|segurança garantida|pagamento sem qualquer risco|purchase 100% safe|guaranteed secure(?:ity)?|fully secure transaction)\b/i;
const GUARANTEED_TRANSIT = /\b(guaranteed (?:to )?(?:arrive|deliver)|prazo garantido)\b/i;
const HOP_TRACK = /data-v4-track="official_offer_click"/i;

export function disableCommercialCta(model: V4Model): V4Model {
  return {
    ...model,
    hopSlot: "none",
    hopHref: undefined,
    hopLabel: undefined,
  };
}

export function hydrateFaqSection(model: V4Model): V4Model {
  const entries = model.copy.faq.filter((item) => item.question.text.trim() && item.answer.text.trim());
  if (!entries.length) return model;
  return {
    ...model,
    blueprint: {
      ...model.blueprint,
      sections: model.blueprint.sections.map((section) => {
        if (section.sectionType !== "faq") return section;
        return {
          ...section,
          items: entries.map((item) => ({ title: item.question, text: item.answer })),
        };
      }),
    },
  };
}

function copyWithoutApprovedExcerpts(copy: string, approved: string[]): string {
  let next = copy;
  for (const excerpt of [...approved].sort((left, right) => right.length - left.length)) {
    const value = excerpt.replace(/\s+/g, " ").trim();
    if (value.length < 3) continue;
    next = next.split(value).join(" ");
  }
  return next;
}

export function evaluateContentSafety(input: {
  model: V4Model;
  markup: string;
  manifest: ContentManifest;
  packshotAssetId: string | null;
  usedAssetIds: string[];
  botanicalAssetIds: string[];
  approvedCommercialExcerpts?: string[];
}): ContentSafetyReport {
  const copy = `${renderedCopyFromModel(input.model)}\n${input.markup}`;
  const commercialCopy = copyWithoutApprovedExcerpts(copy, input.approvedCommercialExcerpts ?? []);
  const findings: ContentSafetyFinding[] = [];
  const blockedExcerpts = input.manifest.blockedClaims
    .map((item) => item.excerpt.replace(/\s+/g, " ").trim().slice(0, 80))
    .filter((item) => item.length > 24);
  for (const excerpt of blockedExcerpts) {
    if (copy.toLowerCase().includes(excerpt.toLowerCase())) {
      findings.push({ code: "BLOCKED_CLAIM_REUSED", message: `Blocked excerpt leaked into copy: ${excerpt.slice(0, 60)}` });
    }
  }
  if (MEDICAL.test(copy)) findings.push({ code: "MEDICAL_CLAIM", message: "Blocked medical or efficacy language appears in the page." });
  if (INVENTED_COMMERCIAL.test(commercialCopy)) findings.push({ code: "INVENTED_COMMERCIAL", message: "Invented price, discount, or guaranteed shipping language appears." });
  if (TESTIMONIAL.test(copy)) findings.push({ code: "FICTIONAL_TESTIMONIAL", message: "Testimonial or unverified social proof appears." });
  if (MANUFACTURER.test(copy)) findings.push({ code: "INVENTED_MANUFACTURER", message: "Manufacturer identity was invented." });
  if (SECURITY_OVERCLAIM.test(copy)) findings.push({ code: "SSL_OVERCLAIM", message: "Payment/SSL language was strengthened into a security guarantee." });
  if (GUARANTEED_TRANSIT.test(copy)) findings.push({ code: "DELIVERY_OVERCLAIM", message: "An estimated delivery window was restated as a guarantee." });
  const commercialCtaEnabled = Boolean(input.model.hopHref) || HOP_TRACK.test(input.markup);
  if (commercialCtaEnabled) findings.push({ code: "CTA_ENABLED", message: "Commercial CTA is enabled." });
  if (input.model.contract.publication.approval !== "REQUIRED") {
    findings.push({ code: "PUBLICATION_READY", message: "Publication approval is not required." });
  }
  if (input.botanicalAssetIds.some((id) => input.usedAssetIds.includes(id))) {
    findings.push({ code: "BOTANICAL_AS_COMPOSITION", message: "A botanical image was used as composition proof." });
  }
  if (input.packshotAssetId && !input.usedAssetIds.includes(input.packshotAssetId) && !input.model.commercialImage) {
    findings.push({ code: "PACKSHOT_MISSING", message: "The approved packshot was not used." });
  }
  if (galleryHasDuplicateSrc(input.model.galleryImages, input.model.commercialImage?.src)) {
    findings.push({ code: "DUPLICATE_GALLERY", message: "Gallery repeats the hero image." });
  }
  const faqValue = input.manifest.allowedFacts.find((item) => item.field === "faq")?.value ?? "";
  const hay = copy.toLowerCase();
  const shippingRequired = /5\s*(e|to|-)\s*10\s*dias|5 to 10 days|24 horas [úu]teis|24 working hours/i.test(faqValue);
  const paymentRequired = /pagamento [úu]nico|one[- ]time payment|ssl/i.test(faqValue);
  const emptyRequired = /empty bottles|frascos vazios/i.test(faqValue);
  const hoursRequired = /48 hours|48 horas/i.test(faqValue);
  const shippingOk = !shippingRequired || /\b(5 to 10 days|24 working hours)\b/i.test(copy);
  const paymentOk = !paymentRequired || (/\bone[- ]time payment\b/i.test(hay) && /seller/i.test(copy));
  const guaranteeOk = /\b60 days\b/i.test(copy) && (!emptyRequired || /\bempty bottles\b/i.test(copy)) && (!hoursRequired || /\b48 hours\b/i.test(copy));
  const commercialConditionsPreserved = shippingOk && paymentOk && guaranteeOk;
  if (!commercialConditionsPreserved) {
    findings.push({ code: "COMMERCIAL_CONDITIONS", message: "Approved commercial conditions are missing or restated incorrectly." });
  }
  return {
    gate: findings.length ? "FAIL" : "PASS",
    findings,
    unsupportedClaimsFound: findings.some((item) =>
      ["MEDICAL_CLAIM", "BLOCKED_CLAIM_REUSED", "FICTIONAL_TESTIMONIAL", "INVENTED_MANUFACTURER"].includes(item.code),
    ),
    commercialConditionsPreserved,
    packshotAssetId: input.packshotAssetId,
    commercialCtaEnabled,
    publicationReady: false,
  };
}
