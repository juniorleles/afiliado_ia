import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const PREMIUM_PRESELL_DESIGN_STANDARD_ID = "PREMIUM_PRESELL_DESIGN_STANDARD_V1";
export const PREMIUM_PRESELL_DESIGN_STANDARD_VERSION = "1";
export const PREMIUM_REFERENCE_RELATIVE_PATH = "design-references/premium-presell-reference.png";
export const PREMIUM_REFERENCE_EVALUATOR_PATH = "/admin/lab/design-references/premium-presell-reference";

export const PREMIUM_REFERENCE_VISUAL_TRAITS = [
  "Split commercial hero with a dominant product packshot",
  "Serif display headline and readable supporting lead",
  "High-contrast orange primary CTA",
  "Icon-led informational chips and cards",
  "Numbered usage steps when usage facts exist",
  "Visual ingredient or feature row when those facts exist",
  "Highlighted seller-stated guarantee band when a guarantee exists",
  "Logistics checklist when shipping or returns facts exist",
  "FAQ accordion when source questions exist",
  "Complete footer with legal links and disclosure",
  "Responsive stacked mobile packing",
] as const;

export const PREMIUM_REFERENCE_FORBIDDEN_CONTENT = [
  "Fictional testimonials and star ratings",
  "Unverified FDA or GMP seals",
  "Invented discounts, prices, or free shipping",
  "Medical or efficacy promises not in the Product Contract",
] as const;

export type PremiumDesignStandard = {
  id: typeof PREMIUM_PRESELL_DESIGN_STANDARD_ID;
  version: typeof PREMIUM_PRESELL_DESIGN_STANDARD_VERSION;
  relativePath: typeof PREMIUM_REFERENCE_RELATIVE_PATH;
  absolutePath: string;
  registered: boolean;
  hash: string | null;
  byteLength: number | null;
  dimensions: { width: number; height: number } | null;
  mediaType: "image/png";
  visualTraits: typeof PREMIUM_REFERENCE_VISUAL_TRAITS;
  forbiddenCommercialCopy: typeof PREMIUM_REFERENCE_FORBIDDEN_CONTENT;
  evaluatorPath: typeof PREMIUM_REFERENCE_EVALUATOR_PATH;
  accessibleToEvaluator: boolean;
  reason: string | null;
};

function pngDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) return null;
  const png = buffer[0] === 0x89 && buffer.toString("ascii", 1, 4) === "PNG";
  if (!png) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export function premiumReferencePath(root = process.cwd()): string {
  return path.join(root, PREMIUM_REFERENCE_RELATIVE_PATH);
}

export function readPremiumReferenceBytes(root = process.cwd()): Buffer | null {
  const file = premiumReferencePath(root);
  if (!existsSync(file)) return null;
  const buffer = readFileSync(file);
  return buffer.length ? buffer : null;
}

export function loadPremiumPresellDesignStandard(root = process.cwd()): PremiumDesignStandard {
  const absolutePath = premiumReferencePath(root);
  const bytes = readPremiumReferenceBytes(root);
  if (!bytes) {
    return {
      id: PREMIUM_PRESELL_DESIGN_STANDARD_ID,
      version: PREMIUM_PRESELL_DESIGN_STANDARD_VERSION,
      relativePath: PREMIUM_REFERENCE_RELATIVE_PATH,
      absolutePath,
      registered: false,
      hash: null,
      byteLength: null,
      dimensions: null,
      mediaType: "image/png",
      visualTraits: PREMIUM_REFERENCE_VISUAL_TRAITS,
      forbiddenCommercialCopy: PREMIUM_REFERENCE_FORBIDDEN_CONTENT,
      evaluatorPath: PREMIUM_REFERENCE_EVALUATOR_PATH,
      accessibleToEvaluator: false,
      reason: `Official reference PNG is missing at ${PREMIUM_REFERENCE_RELATIVE_PATH}. A textual description is not a substitute.`,
    };
  }
  const dimensions = pngDimensions(bytes);
  const png = Boolean(dimensions);
  return {
    id: PREMIUM_PRESELL_DESIGN_STANDARD_ID,
    version: PREMIUM_PRESELL_DESIGN_STANDARD_VERSION,
    relativePath: PREMIUM_REFERENCE_RELATIVE_PATH,
    absolutePath,
    registered: png,
    hash: createHash("sha256").update(bytes).digest("hex"),
    byteLength: bytes.length,
    dimensions,
    mediaType: "image/png",
    visualTraits: PREMIUM_REFERENCE_VISUAL_TRAITS,
    forbiddenCommercialCopy: PREMIUM_REFERENCE_FORBIDDEN_CONTENT,
    evaluatorPath: PREMIUM_REFERENCE_EVALUATOR_PATH,
    accessibleToEvaluator: png,
    reason: png ? null : "The file exists but is not a readable PNG.",
  };
}

export function persistPremiumDesignStandardRecord(root = process.cwd()): PremiumDesignStandard {
  const standard = loadPremiumPresellDesignStandard(root);
  const dir = path.join(root, "design-references");
  mkdirSync(dir, { recursive: true });
  const portable = { ...standard, absolutePath: PREMIUM_REFERENCE_RELATIVE_PATH };
  writeFileSync(path.join(dir, "premium-presell-design-standard-v1.json"), `${JSON.stringify(portable, null, 2)}\n`);
  return standard;
}
