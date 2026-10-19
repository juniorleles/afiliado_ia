import { getDb } from "@/lib/db";
import { BODY_ORDER, type LandingDocument } from "@/lib/landing-composer/types";

function isDocument(value: unknown): value is LandingDocument {
  if (typeof value !== "object" || value === null) return false;
  const row = value as LandingDocument;
  return row.version === 1
    && typeof row.campaignId === "number"
    && typeof row.language === "string"
    && typeof row.generatedAt === "string"
    && Array.isArray(row.sections)
    && row.sections.every((section) => typeof section.sectionId === "string" && section.content !== null && typeof section.content === "object")
    && (row.validationStatus === "PASS" || row.validationStatus === "ERROR")
    && (row.renderStatus === "READY" || row.renderStatus === "INCOMPLETE")
    && Array.isArray(row.warnings)
    && Array.isArray(row.errors)
    && typeof row.metadata?.inputFingerprint === "string"
    && typeof row.metadata.compositionTimeMs === "number"
    && row.sections.every((section) => (BODY_ORDER as readonly string[]).includes(section.sectionId));
}

export function readStoredLandingDocument(campaignId: number): LandingDocument | null {
  const row = getDb().prepare("SELECT landingDocumentJson FROM campaigns WHERE id = ?").get(campaignId) as
    | { landingDocumentJson: string | null }
    | undefined;
  if (!row?.landingDocumentJson) return null;
  try {
    const parsed = JSON.parse(row.landingDocumentJson) as unknown;
    return isDocument(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredLandingDocument(campaignId: number, document: LandingDocument): void {
  getDb().prepare("UPDATE campaigns SET landingDocumentJson = ? WHERE id = ?").run(JSON.stringify(document), campaignId);
}
