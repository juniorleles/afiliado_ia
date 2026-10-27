import { isHealthEfficacyStatement } from "@/lib/ingredient-context";
import { isPromotionalOrCta } from "@/lib/import-heuristics";
import type { InfoClass } from "@/lib/research-coverage/types";

const TESTIMONIAL = /\b(verified buyer|testimonial|★★|five stars|i tried this and|changed my life)\b/i;
const HEALTH = /\b(clinically proven|scientifically proven|cures?|treats?|heals?|diagnos|supports? gums|healthy mouth)\b/i;
const COMMERCIAL = /[$€£]\s*\d|\b\d+\s*%\s*off\b|\bfree shipping\b|\bbuy \d+ get\b|\bautoship\b/i;

export function classifyInformationKind(text: string): InfoClass {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "UNKNOWN";
  if (TESTIMONIAL.test(t)) return "TESTIMONIAL";
  if (isPromotionalOrCta(t)) return "PROMOTIONAL";
  if (COMMERCIAL.test(t)) return "COMMERCIAL_UPDATING";
  if (HEALTH.test(t) || isHealthEfficacyStatement(t)) return "HEALTH_CLAIM";
  if (/\b(we|the seller|the manufacturer) (states?|says?|offers?|covers?)\b/i.test(t) || /\bguarantee|refund|return within\b/i.test(t)) {
    return "SELLER_STATEMENT";
  }
  if (t.length >= 8 && t.length <= 240) return "FACTUAL_DESCRIPTIVE";
  return "UNKNOWN";
}
