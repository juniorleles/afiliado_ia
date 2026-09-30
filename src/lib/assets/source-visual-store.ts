import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { EmbeddedTextStatus, IngredientAssetAuthority } from "@/lib/assets/ingredient-visual-association";

export type StoredIngredientVisual = {
  sourceUrl: string;
  assetUrl: string;
  localSrc: string | null;
  sourceSection: string;
  associatedFactType: "ingredient";
  associatedFactValue: string;
  associationMethod: "same-card";
  associationConfidence: "high" | "conflict";
  embeddedTextStatus: EmbeddedTextStatus;
  assetAuthority: IngredientAssetAuthority;
};

type StoredFile = {
  sourceUrl: string;
  records: StoredIngredientVisual[];
};

function sourceKey(sourceUrl: string): string {
  return createHash("sha256").update(sourceUrl.trim()).digest("hex").slice(0, 24);
}

export function sourceVisualDir(sourceUrl: string, root = path.join(process.cwd(), "data", "source-visuals", "v1")): string {
  return path.join(root, sourceKey(sourceUrl));
}

export function readIngredientVisuals(sourceUrl: string | null | undefined, root?: string): StoredIngredientVisual[] {
  const url = sourceUrl?.trim();
  if (!url) return [];
  const file = path.join(sourceVisualDir(url, root), "associations.json");
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as StoredFile;
    if (!Array.isArray(parsed.records)) return [];
    return parsed.records.filter((record) => record.associatedFactType === "ingredient" && record.associationMethod === "same-card");
  } catch {
    return [];
  }
}

export function writeIngredientVisuals(sourceUrl: string, records: readonly StoredIngredientVisual[], root?: string): void {
  const dir = sourceVisualDir(sourceUrl, root);
  mkdirSync(dir, { recursive: true });
  const body: StoredFile = { sourceUrl, records: [...records] };
  writeFileSync(path.join(dir, "associations.json"), `${JSON.stringify(body, null, 2)}\n`, "utf8");
}
