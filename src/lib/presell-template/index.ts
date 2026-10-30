export {
  PRESELL_STANDARD_ID,
  PRESELL_STANDARD_VERSION,
  PRESELL_STANDARD_REFERENCE,
  PRESELL_STANDARD_SECTION_IDS,
  PRESELL_REQUIRED_SECTIONS,
  PRESELL_OPTIONAL_SECTIONS,
  EXECUTION_54BC_PAID_AI_BUDGET_USD,
} from "@/lib/presell-template/standard-v1";
export { PRESELL_SECTION_REGISTRY, presellSectionRegistryRecord } from "@/lib/presell-template/section-registry";
export { mapPresellStandardV1, renderedTemplateSections } from "@/lib/presell-template/template-content-mapper";
export { validatePresellTemplateDocument } from "@/lib/presell-template/template-validator";
export { runTemplateQualityPreflight } from "@/lib/presell-template/template-quality-preflight";
export { producerEvidenceLibraryFromRun, PRODUCER_EVIDENCE_STATES } from "@/lib/presell-template/producer-evidence";
export type { PresellTemplateDocument, TemplateSectionView } from "@/lib/presell-template/template-contract";
export type { TemplateQualityPreflight, TemplatePreflightStatus } from "@/lib/presell-template/template-quality-preflight";
export type { ProducerEvidenceLibrary, ProducerEvidenceState } from "@/lib/presell-template/producer-evidence";
