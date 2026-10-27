import {
  CONTENT_QUALITY_RULE_VERSION,
  inspectContentQuality,
  type ContentQualityReport,
  type ContentQualityStatus,
} from "@/lib/lp-generator/content-quality";
import type { ConversionBrief } from "@/lib/conversion-strategy/types";
import type { ProductContract } from "@/lib/product-contract/types";
import type { SalesCopy } from "@/lib/page-blueprint/types";
import type { Defect } from "@/lib/quality-gate/types";

export type QualityInspectionRecord = {
  gate: "CONTENT_QUALITY_GATE";
  ruleVersion: typeof CONTENT_QUALITY_RULE_VERSION;
  status: ContentQualityStatus;
  defects: Array<{
    code: string;
    severity: Defect["severity"];
    field: string;
    evidence: string[];
    message: string;
  }>;
  timestamp: string;
  action: string;
  resultAfterCorrection: ContentQualityStatus;
  persistence: "CONSISTENT" | "INCONSISTENT";
  replayDefectIds: string[];
  reason?: string;
};

function defectRows(defects: Defect[]): QualityInspectionRecord["defects"] {
  return defects.map((item) => ({
    code: item.id,
    severity: item.severity,
    field: item.evidence.join(" | "),
    evidence: item.evidence,
    message: item.message,
  }));
}

export function persistQualityInspection(input: {
  copy: SalesCopy;
  contract: ProductContract;
  brief: ConversionBrief;
  repaired: ContentQualityReport;
  timestamp: string;
}): QualityInspectionRecord {
  const replay = inspectContentQuality({ copy: input.copy, contract: input.contract, brief: input.brief });
  const storedIds = [...input.repaired.defects.map((item) => item.id)].sort();
  const replayIds = [...replay.map((item) => item.id)].sort();
  const replayStatus: ContentQualityStatus = replay.length === 0 ? (input.repaired.repairs.length ? "REPAIRED" : "PASS") : "BLOCKED";
  const consistent = storedIds.join("|") === replayIds.join("|") && input.repaired.status === replayStatus;
  return {
    gate: "CONTENT_QUALITY_GATE",
    ruleVersion: CONTENT_QUALITY_RULE_VERSION,
    status: input.repaired.status,
    defects: defectRows(input.repaired.defects),
    timestamp: input.timestamp,
    action: input.repaired.repairs.length ? input.repaired.repairs.join("; ") : "none",
    resultAfterCorrection: input.repaired.status,
    persistence: consistent ? "CONSISTENT" : "INCONSISTENT",
    replayDefectIds: replayIds,
    ...(consistent ? {} : { reason: "Stored content-quality defects do not match a replay on the final copy." }),
  };
}

export function replayQualityInspection(input: {
  copy: SalesCopy;
  contract: ProductContract;
  brief: ConversionBrief;
  stored: QualityInspectionRecord | undefined;
}): { persistence: "CONSISTENT" | "INCONSISTENT"; reason?: string; replayDefectIds: string[] } {
  if (!input.stored) {
    return { persistence: "INCONSISTENT", reason: "qualityInspection is missing from the generation record", replayDefectIds: [] };
  }
  const replay = persistQualityInspection({
    copy: input.copy,
    contract: input.contract,
    brief: input.brief,
    repaired: {
      status: input.stored.status,
      defects: input.stored.defects.map((item) => ({
        id: item.code,
        kind: "EDITORIAL_QUALITY",
        severity: item.severity,
        gate: "EDITORIAL_QUALITY_GATE",
        message: item.message,
        evidence: item.evidence,
        files: [],
        fixable: true,
        acceptance: "replay",
      })),
      repairs: input.stored.action === "none" ? [] : [input.stored.action],
      copy: input.copy,
    },
    timestamp: input.stored.timestamp,
  });
  return { persistence: replay.persistence, reason: replay.reason, replayDefectIds: replay.replayDefectIds };
}
