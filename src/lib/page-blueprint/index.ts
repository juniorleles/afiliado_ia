export { PAGE_BLUEPRINT_VERSION, SALES_COPY_VERSION } from "@/lib/page-blueprint/types";
export type { PageBlueprint, SalesCopy, EditorialQualityReport, GroundingReport } from "@/lib/page-blueprint/types";
export { buildSalesCopy } from "@/lib/page-blueprint/copy";
export { buildPageBlueprint } from "@/lib/page-blueprint/blueprint";
export { evaluateEditorialQuality } from "@/lib/page-blueprint/quality";
export { validateSalesCopy, validateBlueprint } from "@/lib/page-blueprint/validate";
export { applyCopyIntelligence, offlineCopyAdapter } from "@/lib/page-blueprint/adapter";
export { readableBlueprint } from "@/lib/page-blueprint/readable";
