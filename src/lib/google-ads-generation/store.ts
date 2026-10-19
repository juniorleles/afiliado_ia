import { getDb } from "@/lib/db";
import type { GoogleAdsPackage } from "@/lib/google-ads-generation/types";

function isPackage(value: unknown): value is GoogleAdsPackage {
  if (typeof value !== "object" || value === null) return false;
  const row = value as GoogleAdsPackage;
  return row.version === 1
    && typeof row.campaignId === "number"
    && typeof row.finalUrl === "string"
    && Array.isArray(row.headlines)
    && Array.isArray(row.descriptions)
    && Array.isArray(row.negativeKeywords)
    && (row.policy?.status === "PASS" || row.policy?.status === "FAIL")
    && typeof row.assetStrength?.score === "number";
}

export function readStoredGoogleAdsPackage(campaignId: number): GoogleAdsPackage | null {
  const row = getDb().prepare("SELECT googleAdsPackageJson FROM campaigns WHERE id = ?").get(campaignId) as
    | { googleAdsPackageJson: string | null }
    | undefined;
  if (!row?.googleAdsPackageJson) return null;
  try {
    const parsed = JSON.parse(row.googleAdsPackageJson) as unknown;
    return isPackage(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredGoogleAdsPackage(campaignId: number, bundle: GoogleAdsPackage): void {
  getDb().prepare("UPDATE campaigns SET googleAdsPackageJson = ? WHERE id = ?").run(JSON.stringify(bundle), campaignId);
}
