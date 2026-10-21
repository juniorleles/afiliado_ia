export { ENRICHMENT_VERSION } from "@/lib/product-enrichment/types";
export type { EnrichmentResult, EnrichmentSource, CompletenessSnapshot } from "@/lib/product-enrichment/types";
export { enrichProduct } from "@/lib/product-enrichment/pipeline";
export { labSources } from "@/lib/product-enrichment/lab-sources";
export { completenessOf, completenessDelta } from "@/lib/product-enrichment/completeness";
export { extractSources } from "@/lib/product-enrichment/extract";
