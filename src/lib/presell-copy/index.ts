export { PRESELL_COPY_VERSION } from "@/lib/presell-copy/types";
export type { ClaimAuditRow, ConversionHandoff, SellerStatementClass, SellerStatementDecision } from "@/lib/presell-copy/types";
export { classifySellerStatement, attributionAllowed, auditBlockedClaim } from "@/lib/presell-copy/policy";
export { restateOperationalGuarantee, composeNeutralOverviewFromFacts, needsGuaranteeRestatement } from "@/lib/presell-copy/restate";
export { applyEvidenceAwareCopy } from "@/lib/presell-copy/compose";
export { buildConversionHandoff } from "@/lib/presell-copy/handoff";
export { auditSellerStatements, classifyEvidenceInventory } from "@/lib/presell-copy/audit";
