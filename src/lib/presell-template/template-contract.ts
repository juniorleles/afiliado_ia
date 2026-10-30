import type { PresellStandardSectionId } from "@/lib/presell-template/standard-v1";
import { PRESELL_STANDARD_ID, PRESELL_STANDARD_VERSION } from "@/lib/presell-template/standard-v1";

export type PresellProductFormat = "PHYSICAL" | "DIGITAL" | "UNKNOWN";

export type TemplateClaimTrace = {
  text: string;
  evidenceRefs: string[];
  contractPath: string;
};

export type TemplateSectionView = {
  id: PresellStandardSectionId;
  present: boolean;
  required: boolean;
  omittedReason: string | null;
  title: string | null;
  evidenceRefs: string[];
  claims: TemplateClaimTrace[];
};

export type TemplateAnnouncement = {
  message: string;
  evidenceRefs: string[];
  commercialUrgency: false;
};

export type TemplateTestimonialsPolicy = {
  policy: "OMIT_UNLESS_AUTHENTIC_AUTHORIZED";
  status: "SECTION_OMITTED" | "RENDERED";
  reason: string;
};

export type PresellTemplateDocument = {
  standardId: typeof PRESELL_STANDARD_ID;
  version: typeof PRESELL_STANDARD_VERSION;
  productName: string;
  productFormat: PresellProductFormat;
  announcement: TemplateAnnouncement | null;
  sections: TemplateSectionView[];
  testimonials: TemplateTestimonialsPolicy;
  cta: { enabled: false; href: null; label: string };
  legalLinks: Array<{ href: string; label: string }>;
  disclosure: string | null;
};
