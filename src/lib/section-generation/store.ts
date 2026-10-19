import { getDb } from "@/lib/db";
import { SECTION_IDS, type GeneratedSections, type SectionGeneration } from "@/lib/section-generation/types";

function isSection(value: unknown): value is SectionGeneration {
  if (typeof value !== "object" || value === null) return false;
  const row = value as SectionGeneration;
  return (SECTION_IDS as readonly string[]).includes(row.sectionId)
    && (row.status === "GENERATED" || row.status === "FAILED")
    && typeof row.confidence === "number"
    && typeof row.generationTime === "number"
    && typeof row.inputFingerprint === "string"
    && Array.isArray(row.evidenceUsed)
    && Array.isArray(row.warnings)
    && Array.isArray(row.reasoning);
}

function isBundle(value: unknown): value is GeneratedSections {
  if (typeof value !== "object" || value === null) return false;
  const row = value as GeneratedSections;
  return row.version === 1
    && typeof row.campaignId === "number"
    && typeof row.generatedAt === "string"
    && typeof row.averageGenerationTimeMs === "number"
    && Array.isArray(row.sections)
    && row.sections.length === SECTION_IDS.length
    && row.sections.every(isSection);
}

export function readStoredGeneratedSections(campaignId: number): GeneratedSections | null {
  const row = getDb().prepare("SELECT generatedSectionsJson FROM campaigns WHERE id = ?").get(campaignId) as
    | { generatedSectionsJson: string | null }
    | undefined;
  if (!row?.generatedSectionsJson) return null;
  try {
    const parsed = JSON.parse(row.generatedSectionsJson) as unknown;
    return isBundle(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredGeneratedSections(campaignId: number, bundle: GeneratedSections): void {
  getDb().prepare("UPDATE campaigns SET generatedSectionsJson = ? WHERE id = ?").run(JSON.stringify(bundle), campaignId);
}
