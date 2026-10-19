import { getDb } from "@/lib/db";
import { SECTION_STATUSES, type LandingBlueprint } from "@/lib/landing-blueprint/types";

function isBlueprint(value: unknown): value is LandingBlueprint {
  if (typeof value !== "object" || value === null) return false;
  const row = value as LandingBlueprint;
  return row.version === 1
    && typeof row.campaignId === "number"
    && typeof row.blueprintVersion === "number"
    && Array.isArray(row.sections)
    && row.sections.every((section) => (SECTION_STATUSES as readonly string[]).includes(section.generationStatus));
}

export function readStoredLandingBlueprint(campaignId: number): LandingBlueprint | null {
  const row = getDb().prepare("SELECT landingBlueprintJson FROM campaigns WHERE id = ?").get(campaignId) as
    | { landingBlueprintJson: string | null }
    | undefined;
  if (!row?.landingBlueprintJson) return null;
  try {
    const parsed = JSON.parse(row.landingBlueprintJson) as unknown;
    return isBlueprint(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredLandingBlueprint(campaignId: number, blueprint: LandingBlueprint): void {
  getDb().prepare("UPDATE campaigns SET landingBlueprintJson = ? WHERE id = ?").run(JSON.stringify(blueprint), campaignId);
}
