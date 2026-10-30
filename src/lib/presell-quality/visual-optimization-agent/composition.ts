import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { qualityAssessmentRoot } from "@/lib/presell-quality/persist";
import type {
  AppliedChange,
  CopyChange,
  LayoutChange,
  VisualComposition,
} from "./types.ts";
import { isAllowedCopyOp, isAllowedLayoutOp, isForbiddenAgentTarget } from "./schema.ts";

export const SOURCE_CANDIDATE_COMPOSITION: VisualComposition = {
  version: 1,
  executionId: "54BO",
  iteration: 0,
  hero: {
    density: "sparse",
    columns: "copy-product-facts",
    packshotScale: "md",
    minHeight: "none",
    packagesInFold: false,
  },
  copy: { tone: "compliance", compliancePlacement: "inline" },
  packages: { density: "plain", priceEmphasis: "display", highlight: "none" },
  identity: { radius: "soft", cardElevation: "flat", buttonWeight: "quiet" },
};

export const IMPROVED_SEED_COMPOSITION: VisualComposition = {
  version: 1,
  executionId: "54BP",
  iteration: 1,
  hero: {
    density: "compact",
    columns: "copy-product-facts",
    packshotScale: "xl",
    minHeight: "content",
    packagesInFold: true,
  },
  copy: { tone: "commercial", compliancePlacement: "aside" },
  packages: { density: "featured", priceEmphasis: "display", highlight: "middle" },
  identity: { radius: "crisp", cardElevation: "raised", buttonWeight: "strong" },
};

function compositionFile(campaignId: number): string {
  return path.join(qualityAssessmentRoot(), String(campaignId), "visual-optimization.json");
}

export function defaultVisualComposition(executionId: string, iteration = 1): VisualComposition {
  return { ...IMPROVED_SEED_COMPOSITION, executionId, iteration };
}

export function readVisualComposition(campaignId: number): VisualComposition | null {
  const file = compositionFile(campaignId);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as VisualComposition;
  } catch {
    return null;
  }
}

export function writeVisualComposition(campaignId: number, composition: VisualComposition): VisualComposition {
  const file = compositionFile(campaignId);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(composition, null, 2)}\n`);
  return composition;
}

export function cloneComposition(composition: VisualComposition): VisualComposition {
  return JSON.parse(JSON.stringify(composition)) as VisualComposition;
}

const VALUE_MAP: Record<string, readonly string[]> = {
  SET_HERO_DENSITY: ["sparse", "balanced", "compact"],
  SET_PACKSHOT_SCALE: ["sm", "md", "lg", "xl"],
  SET_HERO_COLUMNS: ["copy-product-facts", "product-copy-facts", "copy-product"],
  SET_HERO_MIN_HEIGHT: ["none", "content"],
  SET_PACKAGE_DENSITY: ["plain", "featured"],
  SET_PRICE_EMPHASIS: ["body", "display"],
  SET_PACKAGE_HIGHLIGHT: ["none", "middle", "best-value"],
  SET_COPY_TONE: ["compliance", "commercial"],
  SET_COMPLIANCE_PLACEMENT: ["inline", "aside", "footer-band"],
  SET_CARD_ELEVATION: ["flat", "raised"],
  SET_BUTTON_WEIGHT: ["quiet", "strong"],
  SET_RADIUS: ["soft", "crisp"],
};

function applyOne(composition: VisualComposition, change: LayoutChange | CopyChange): AppliedChange {
  const op = change.op;
  if (isForbiddenAgentTarget(op)) {
    return { op, value: String(change.value ?? ""), applied: false, reason: "Forbidden target (gate, contract, publication, or ads)." };
  }
  if (op === "MOVE_COMPLIANCE" || op === "PRESENT_COMMERCIAL_TONE" || isAllowedCopyOp(op)) {
    if (op === "MOVE_COMPLIANCE") {
      composition.copy.compliancePlacement = "aside";
      return { op, value: "aside", applied: true, reason: "Compliance copy moved to a dedicated aside." };
    }
    if (op === "PRESENT_COMMERCIAL_TONE" || op === "SET_COPY_TONE") {
      composition.copy.tone = "commercial";
      return { op, value: "commercial", applied: true, reason: "Hero copy uses commercial presentation of approved facts." };
    }
  }
  if (!isAllowedLayoutOp(op)) {
    return { op, value: String(change.value ?? ""), applied: false, reason: "Operation is not in the controlled composition schema." };
  }
  const value = change.value;
  if (op === "SET_PACKAGES_IN_FOLD") {
    composition.hero.packagesInFold = value === true || value === "true";
    return { op, value: composition.hero.packagesInFold, applied: true, reason: "Package placement updated." };
  }
  const allowed = VALUE_MAP[op];
  const text = String(value);
  if (!allowed?.includes(text)) {
    return { op, value: text, applied: false, reason: `Value ${text} is not allowed for ${op}.` };
  }
  if (op === "SET_HERO_DENSITY") composition.hero.density = text as VisualComposition["hero"]["density"];
  if (op === "SET_PACKSHOT_SCALE") composition.hero.packshotScale = text as VisualComposition["hero"]["packshotScale"];
  if (op === "SET_HERO_COLUMNS") composition.hero.columns = text as VisualComposition["hero"]["columns"];
  if (op === "SET_HERO_MIN_HEIGHT") composition.hero.minHeight = text as VisualComposition["hero"]["minHeight"];
  if (op === "SET_PACKAGE_DENSITY") composition.packages.density = text as VisualComposition["packages"]["density"];
  if (op === "SET_PRICE_EMPHASIS") composition.packages.priceEmphasis = text as VisualComposition["packages"]["priceEmphasis"];
  if (op === "SET_PACKAGE_HIGHLIGHT") composition.packages.highlight = text as VisualComposition["packages"]["highlight"];
  if (op === "SET_COPY_TONE") composition.copy.tone = text as VisualComposition["copy"]["tone"];
  if (op === "SET_COMPLIANCE_PLACEMENT") composition.copy.compliancePlacement = text as VisualComposition["copy"]["compliancePlacement"];
  if (op === "SET_CARD_ELEVATION") composition.identity.cardElevation = text as VisualComposition["identity"]["cardElevation"];
  if (op === "SET_BUTTON_WEIGHT") composition.identity.buttonWeight = text as VisualComposition["identity"]["buttonWeight"];
  if (op === "SET_RADIUS") composition.identity.radius = text as VisualComposition["identity"]["radius"];
  return { op, value: text, applied: true, reason: "Applied through the structured composition." };
}

export function applyVisualPlan(
  current: VisualComposition,
  input: { layout_changes: LayoutChange[]; copy_changes: CopyChange[]; iteration: number; executionId: string },
): { composition: VisualComposition; applied: AppliedChange[] } {
  const composition = cloneComposition(current);
  composition.iteration = input.iteration;
  composition.executionId = input.executionId;
  const applied: AppliedChange[] = [];
  for (const change of [...input.layout_changes, ...input.copy_changes]) {
    applied.push(applyOne(composition, change));
  }
  return { composition, applied };
}

export function confirmedDefectPlan(): { layout_changes: LayoutChange[]; copy_changes: CopyChange[] } {
  return {
    layout_changes: [
      { op: "SET_HERO_DENSITY", value: "compact" },
      { op: "SET_PACKSHOT_SCALE", value: "xl" },
      { op: "SET_HERO_MIN_HEIGHT", value: "content" },
      { op: "SET_PACKAGES_IN_FOLD", value: true },
      { op: "SET_PACKAGE_DENSITY", value: "featured" },
      { op: "SET_PRICE_EMPHASIS", value: "display" },
      { op: "SET_PACKAGE_HIGHLIGHT", value: "middle" },
      { op: "SET_CARD_ELEVATION", value: "raised" },
      { op: "SET_BUTTON_WEIGHT", value: "strong" },
      { op: "SET_RADIUS", value: "crisp" },
    ],
    copy_changes: [
      { op: "PRESENT_COMMERCIAL_TONE" },
      { op: "MOVE_COMPLIANCE" },
    ],
  };
}

export function compositionDataAttributes(composition: VisualComposition): Record<string, string> {
  return {
    "data-hero-density": composition.hero.density,
    "data-packshot-scale": composition.hero.packshotScale,
    "data-hero-columns": composition.hero.columns,
    "data-hero-min-height": composition.hero.minHeight,
    "data-packages-in-fold": composition.hero.packagesInFold ? "1" : "0",
    "data-copy-tone": composition.copy.tone,
    "data-compliance": composition.copy.compliancePlacement,
    "data-package-density": composition.packages.density,
    "data-price-emphasis": composition.packages.priceEmphasis,
    "data-package-highlight": composition.packages.highlight,
    "data-card-elevation": composition.identity.cardElevation,
    "data-button-weight": composition.identity.buttonWeight,
    "data-radius": composition.identity.radius,
  };
}
