import { FORBIDDEN_REFERENCE_CHROME } from "@/lib/presell-quality/premium-design";
import type { V4Model } from "@/lib/product-showcase/v4/model";
import { mapPresellStandardV1 } from "@/lib/presell-template/template-content-mapper";
import { validatePresellTemplateDocument } from "@/lib/presell-template/template-validator";
import { PRESELL_REQUIRED_SECTIONS } from "@/lib/presell-template/standard-v1";

export type TemplatePreflightStatus = "PREFLIGHT_PASSED" | "PREFLIGHT_BLOCKED";

export type TemplatePreflightCheck = {
  code: string;
  ok: boolean;
  message: string;
};

export type TemplateQualityPreflight = {
  status: TemplatePreflightStatus;
  visualScoreAssigned: false;
  paidEvaluationAuthorized: false;
  checks: TemplatePreflightCheck[];
};

const PLACEHOLDER = /\b(lorem ipsum|todo|tbd|xxx+|your product here|sample copy)\b/i;
const FICTIONAL_HOST = /\.(invalid|test)\b/i;

export function runTemplateQualityPreflight(input: {
  model: V4Model;
  markup: string;
  contractValid: boolean;
}): TemplateQualityPreflight {
  const document = mapPresellStandardV1(input.model);
  const validation = validatePresellTemplateDocument(document);
  const checks: TemplatePreflightCheck[] = [];
  const add = (code: string, ok: boolean, message: string) => {
    checks.push({ code, ok, message });
  };

  add("PRODUCT_IDENTIFIED", Boolean(input.model.contract.identity.productName.trim()), "Product name is present.");
  add("PRODUCT_CONTRACT_VALID", input.contractValid, input.contractValid ? "Product Contract is valid." : "Product Contract is invalid.");
  add("TEMPLATE_DOCUMENT", validation.ok, validation.ok ? "Template document is valid." : validation.issues.map((item) => item.message).join(" "));
  const hero = input.model.commercialImage;
  add(
    "AUTHORIZED_IMAGES",
    !hero || Boolean(hero.src.startsWith("/") || hero.src.startsWith("https://")),
    hero ? "Hero image has a real src." : "No hero image; editorial hero is allowed.",
  );
  add("BROKEN_IMAGE_MARKERS", !/src=["']["']/.test(input.markup), "No empty image sources.");
  add("PLACEHOLDERS", !PLACEHOLDER.test(input.markup), "No visible placeholders.");
  add("FORBIDDEN_CHROME", !FORBIDDEN_REFERENCE_CHROME.test(input.markup), "No invented seals, testimonials, or discounts.");
  add("FICTIONAL_URLS", !FICTIONAL_HOST.test(input.markup), "No .invalid/.test URLs in the page.");
  add(
    "REQUIRED_SECTIONS",
    PRESELL_REQUIRED_SECTIONS.every((id) => document.sections.find((item) => item.id === id)?.present),
    "Required template sections are present.",
  );
  add(
    "OPTIONAL_OMISSIONS",
    document.sections.filter((item) => !item.present).every((item) => Boolean(item.omittedReason)),
    "Optional sections are omitted with a reason.",
  );
  add("LEGAL_FOOTER", Boolean(document.disclosure) && document.legalLinks.length > 0, "Legal footer has disclosure and real links.");
  add("CTA_DISABLED", document.cta.enabled === false && document.cta.href === null && !input.model.hopHref, "Commercial CTA stays disabled.");
  add("TESTIMONIALS_POLICY", document.testimonials.status === "SECTION_OMITTED", "Unverified testimonials are omitted.");
  add("RENDER_MARKUP", input.markup.includes('data-v4="page"') && input.markup.includes("data-presell-standard"), "Page markup rendered.");

  const blocked = checks.some((item) => !item.ok);
  return {
    status: blocked ? "PREFLIGHT_BLOCKED" : "PREFLIGHT_PASSED",
    visualScoreAssigned: false,
    paidEvaluationAuthorized: false,
    checks,
  };
}
