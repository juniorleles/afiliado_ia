import { QUALITY_DIMENSION_WEIGHTS, QUALITY_TARGET, type QualityDimension } from "@/lib/presell-quality/types";

export const QUALITY_DIMENSION_CRITERIA: Record<QualityDimension, { label: string; weight: number; looksFor: string[] }> = {
  DESIGN_HIERARCHY: {
    label: "Design e hierarquia visual",
    weight: QUALITY_DIMENSION_WEIGHTS.DESIGN_HIERARCHY,
    looksFor: [
      "A clear above-the-fold hierarchy with product identity first",
      "A hero that is not an empty band of type alone when a packshot exists",
      "Consistent spacing, typography, and section rhythm",
    ],
  },
  COPY_CLARITY: {
    label: "Copy e clareza editorial",
    weight: QUALITY_DIMENSION_WEIGHTS.COPY_CLARITY,
    looksFor: [
      "A readable product description grounded in approved facts",
      "Section titles that match the meaning of the content",
      "No promotional remainder, invented benefits, or audit jargon",
    ],
  },
  DEPTH_ORGANIZATION: {
    label: "Profundidade e organização",
    weight: QUALITY_DIMENSION_WEIGHTS.DEPTH_ORGANIZATION,
    looksFor: [
      "Enough approved facts to form a complete presell",
      "Usage, composition, and operational facts in distinct sections",
      "No isolated leftover blocks that read as unfinished",
    ],
  },
  IMAGES_COMPOSITION: {
    label: "Imagens e composição",
    weight: QUALITY_DIMENSION_WEIGHTS.IMAGES_COMPOSITION,
    looksFor: [
      "An approved packshot used as the hero when one exists",
      "Gallery hierarchy that does not treat every asset as equal",
      "No unapproved or promotional-only images in commercial slots",
    ],
  },
  MOBILE_EXPERIENCE: {
    label: "Experiência mobile",
    weight: QUALITY_DIMENSION_WEIGHTS.MOBILE_EXPERIENCE,
    looksFor: [
      "Readable type and tap targets at 390px",
      "No essential overflow or collapsed hero",
      "CTA and disclosure remain visible",
    ],
  },
  TRANSPARENCY_LEGIBILITY: {
    label: "Transparência e legibilidade",
    weight: QUALITY_DIMENSION_WEIGHTS.TRANSPARENCY_LEGIBILITY,
    looksFor: [
      "Affiliate disclosure and legal footer present",
      "Sandbox or preview CTAs are not presented as a live hop",
      "Seller-stated operational facts are restated, not promised",
    ],
  },
};

export function qualityTarget(): number {
  return QUALITY_TARGET;
}
