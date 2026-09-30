import type { VisualDirectionFamily } from "@/lib/visual-concept/types";

export const DIRECTION_GUIDANCE: Record<VisualDirectionFamily, string> = {
  PREMIUM_EDITORIAL:
    "A premium editorial website design. Use refined typography, generous whitespace, large imagery, restrained surfaces, and a sophisticated multi-section rhythm. This is a long-form webpage, not a magazine advertisement or a poster.",
  PREMIUM_PRODUCT:
    "A premium product-led website design, not a premium product advertisement. The product is visually important inside a complete multi-section website system. Use a strong hero stage, large intentional product moments, direct-to-consumer presentation, visual depth, and alternating sections. Do not redraw the supplied packshot, label, logo, or packaging text.",
  PREMIUM_CONVERSION:
    "A premium conversion website with clear hierarchy, scannable sections, decision support, one strong primary action, structured information, and high readability. This is a complete webpage, not an aggressive advertorial and not an isolated promotional creative.",
};
