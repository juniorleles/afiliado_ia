import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { qualityAssessmentRoot } from "@/lib/presell-quality/persist";
import { extractComparableNumbers } from "@/lib/presell-quality/copy-validate";
import type {
  AppliedChange,
  ApprovedCopyInventory,
  CommercialCopyPlan,
  CommercialCopyState,
  CopyChange,
  FactMappingRow,
  LayoutChange,
  VisualComposition,
} from "./types.ts";
import { applyVisualPlan } from "./composition.ts";
import { isForbiddenAgentTarget } from "./schema.ts";
import { EDITORIAL_HEADLINE_MAX_WORDS, EDITORIAL_SUBHEADLINE_MAX_WORDS } from "./types.ts";
import { isFactDumpHeadline, wordCount } from "./editorial-rules.ts";

const COPY_TEXT_OPS = ["SET_HEADLINE", "SET_SUBHEADLINE", "SET_HERO_BODY", "SET_CTA_LABEL", "REWRITE_HEADLINE", "REWRITE_SUBHEADLINE"];

const MEDICAL =
  /\b(blood sugar|fat[- ]burn(?:ing)?|clinically proven|scientifically proven|cures?|treats?|prevents?|brain[- ]fog|energy crashes?|drop pounds|diabetes|fda[- ]approved|guaranteed results)\b/i;
const URGENCY = /\b(limited time|act now|only \d+ left|scarcity)\b/i;
const SANDBOX = /\b(preview only|commercial checkout is not enabled|quality status|generation id|execution-54)\b/i;
const INVENTED_BENEFIT =
  /\b(unlock|wellness|boost|transform|revitalize|satisfaction guarantee|feel better|results you can|miracle|clinically)\b/i;

function copyFile(campaignId: number): string {
  return path.join(qualityAssessmentRoot(), String(campaignId), "commercial-copy.json");
}

export function buildSeedCommercialCopy(input: ApprovedCopyInventory & { executionId: string; iteration?: number }): CommercialCopyState {
  const name = input.productName.trim() || "This product";
  const quantities = input.packages.map((item) => item.quantity).filter(Boolean);
  const qtyPhrase = quantities.join(", ");
  const days = input.guaranteeDays;
  const ingredients = input.ingredients.map((item) => item.trim()).filter(Boolean);
  const headline =
    days && qtyPhrase
      ? `${name} — ${qtyPhrase} with a ${days}-day seller refund window`
      : qtyPhrase
        ? `${name} — seller-listed ${qtyPhrase}`
        : ingredients.length
          ? `${name} — listed formula with ${ingredients.length} named botanicals`
          : `${name} — seller-listed product details`;
  const subheadline = ingredients.length
    ? `Listed botanicals: ${ingredients.join(", ")}.`
    : input.productKind?.trim() || "Compare the seller-listed packages below.";
  const heroBody = qtyPhrase
    ? "Compare bottle counts, per-bottle prices, totals, shipping terms, and extras as listed by the seller."
    : "Review the seller-listed details in the sections below.";
  return {
    version: 1,
    executionId: input.executionId,
    iteration: input.iteration ?? 1,
    headline: {
      text: headline,
      supportingFactIds: ["identity.productName", ...(qtyPhrase ? ["pricing.packages"] : []), ...(days ? ["guarantee.days"] : [])],
    },
    subheadline: {
      text: subheadline,
      supportingFactIds: ingredients.length ? ["ingredients"] : input.productKind ? ["identity.productKind"] : ["identity.productName"],
    },
    heroBody: {
      text: heroBody,
      supportingFactIds: qtyPhrase ? ["pricing.packages"] : ["identity.productName"],
    },
    ctaLabel: qtyPhrase ? "See packages" : "See product details",
  };
}

export function readCommercialCopy(campaignId: number): CommercialCopyState | null {
  const file = copyFile(campaignId);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as CommercialCopyState;
  } catch {
    return null;
  }
}

export function writeCommercialCopy(campaignId: number, copy: CommercialCopyState): CommercialCopyState {
  const file = copyFile(campaignId);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(copy, null, 2)}\n`);
  return copy;
}

export function cloneCommercialCopy(copy: CommercialCopyState): CommercialCopyState {
  return JSON.parse(JSON.stringify(copy)) as CommercialCopyState;
}

function inventoryCorpus(inventory: ApprovedCopyInventory): string {
  return [
    inventory.productName,
    inventory.productKind ?? "",
    inventory.description,
    inventory.usage,
    inventory.guarantee,
    inventory.ingredients.join(" "),
    ...inventory.packages.flatMap((item) => [
      item.quantity,
      item.unitPrice,
      item.currentTotal,
      item.duration,
      item.shippingTerm,
      ...item.bonuses,
    ]),
    ...inventory.approvedExcerpts,
    inventory.guaranteeDays != null ? String(inventory.guaranteeDays) : "",
    String(inventory.ingredients.length),
  ]
    .join(" ")
    .toLowerCase();
}

export function copyChangeIsGrounded(
  proposed: string,
  supportingFactIds: string[],
  inventory: ApprovedCopyInventory,
  field: "headline" | "subheadline" | "heroBody" | "ctaLabel",
): { ok: boolean; reason: string } {
  const text = proposed.replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, reason: "Empty copy is rejected." };
  if (!supportingFactIds.length) return { ok: false, reason: "Copy changes require supporting fact ids." };
  if (MEDICAL.test(text)) return { ok: false, reason: "Blocked medical or efficacy language." };
  if (INVENTED_BENEFIT.test(text) && !INVENTED_BENEFIT.test(inventoryCorpus(inventory))) {
    return { ok: false, reason: "Copy introduces a benefit claim that is not in approved facts." };
  }
  if (URGENCY.test(text)) return { ok: false, reason: "Urgency or scarcity language is not approved." };
  if (SANDBOX.test(text) && field !== "ctaLabel") return { ok: false, reason: "Sandbox chrome cannot enter commercial copy." };
  if (field === "headline" && text.toLowerCase() === inventory.productName.trim().toLowerCase()) {
    return { ok: false, reason: "Headline cannot be only the product name." };
  }
  if (field === "headline" && inventory.productName.trim() && !text.toLowerCase().includes(inventory.productName.trim().toLowerCase())) {
    return { ok: false, reason: "Headline must keep the product identity." };
  }
  if (field === "ctaLabel" && /\b(buy now|checkout|order now|complete purchase)\b/i.test(text)) {
    return { ok: false, reason: "CTA cannot simulate a live checkout." };
  }
  const corpus = inventoryCorpus(inventory);
  const unknownNumbers = extractComparableNumbers(text).filter((item) => {
    if (corpus.includes(item)) return false;
    if (inventory.packages.some((pack) => pack.quantity.includes(item) || pack.unitPrice.includes(item) || pack.currentTotal.includes(item))) {
      return false;
    }
    return true;
  });
  if (unknownNumbers.length) {
    return { ok: false, reason: `Copy introduces numbers not present in approved facts: ${unknownNumbers.join(", ")}.` };
  }
  if (/\b(two drops)\b/i.test(text) && /\bdroppers?\b/i.test(inventory.usage) && !/\bdroppers?\b/i.test(text)) {
    return { ok: false, reason: "Usage copy cannot replace droppers with drops." };
  }
  return { ok: true, reason: "Copy restates approved facts." };
}

export function mapApprovedFacts(copy: CommercialCopyState, inventory: ApprovedCopyInventory): FactMappingRow[] {
  const rows: Array<{ field: keyof Pick<CommercialCopyState, "headline" | "subheadline" | "heroBody">; value: CommercialCopyState["headline"] }> = [
    { field: "headline", value: copy.headline },
    { field: "subheadline", value: copy.subheadline },
    { field: "heroBody", value: copy.heroBody },
  ];
  return rows.map((row) => {
    const check = copyChangeIsGrounded(row.value.text, row.value.supportingFactIds, inventory, row.field);
    return {
      field: row.field,
      text: row.value.text,
      supportingFactIds: row.value.supportingFactIds,
      grounded: check.ok,
      reason: check.reason,
    };
  });
}

function applyCopyOp(
  copy: CommercialCopyState,
  change: CopyChange,
  inventory: ApprovedCopyInventory,
): AppliedChange {
  const op = change.op;
  if (isForbiddenAgentTarget(op)) {
    return { op, value: String(change.value ?? ""), applied: false, reason: "Forbidden target (gate, contract, publication, or ads)." };
  }
  const field =
    op === "SET_HEADLINE" || op === "REWRITE_HEADLINE"
      ? "headline"
      : op === "SET_SUBHEADLINE" || op === "REWRITE_SUBHEADLINE"
        ? "subheadline"
        : op === "SET_HERO_BODY"
          ? "heroBody"
          : op === "SET_CTA_LABEL"
            ? "ctaLabel"
            : null;
  if (!field) {
    return { op, value: String(change.value ?? ""), applied: false, reason: "Copy operation is handled by the composition schema." };
  }
  const proposed = String(change.value ?? "").replace(/\s+/g, " ").trim();
  const supporting =
    field === "ctaLabel"
      ? ["identity.productName"]
      : field === "headline"
        ? copy.headline.supportingFactIds.length
          ? copy.headline.supportingFactIds
          : ["identity.productName", ...(inventory.packages.length ? ["pricing.packages"] : []), ...(inventory.guaranteeDays ? ["guarantee.days"] : [])]
        : field === "subheadline"
          ? copy.subheadline.supportingFactIds.length
            ? copy.subheadline.supportingFactIds
            : inventory.ingredients.length
              ? ["ingredients"]
              : ["identity.productName"]
          : copy.heroBody.supportingFactIds.length
            ? copy.heroBody.supportingFactIds
            : inventory.packages.length
              ? ["pricing.packages"]
              : ["identity.productName"];
  const check = copyChangeIsGrounded(proposed, supporting, inventory, field);
  if (!check.ok) return { op, value: proposed, applied: false, reason: check.reason };
  if (op === "REWRITE_HEADLINE") {
    if (wordCount(proposed) > EDITORIAL_HEADLINE_MAX_WORDS) {
      return { op, value: proposed, applied: false, reason: "HEADLINE_TOO_LONG" };
    }
    if (isFactDumpHeadline(proposed)) {
      return { op, value: proposed, applied: false, reason: "HEADLINE_FACT_DUMP" };
    }
  }
  if (op === "REWRITE_SUBHEADLINE" && wordCount(proposed) > EDITORIAL_SUBHEADLINE_MAX_WORDS) {
    return { op, value: proposed, applied: false, reason: "Subheadline exceeds the editorial word limit." };
  }
  if (field === "headline") copy.headline = { text: proposed, supportingFactIds: supporting };
  if (field === "subheadline") copy.subheadline = { text: proposed, supportingFactIds: supporting };
  if (field === "heroBody") copy.heroBody = { text: proposed, supportingFactIds: supporting };
  if (field === "ctaLabel") copy.ctaLabel = proposed;
  return { op, value: proposed, applied: true, reason: check.reason };
}

export function applyCommercialPlan(input: {
  composition: VisualComposition;
  copy: CommercialCopyState;
  layout_changes: LayoutChange[];
  copy_changes: CopyChange[];
  inventory: ApprovedCopyInventory;
  iteration: number;
  executionId: string;
}): { composition: VisualComposition; copy: CommercialCopyState; applied: AppliedChange[]; factMapping: FactMappingRow[] } {
  const visual = applyVisualPlan(input.composition, {
    layout_changes: input.layout_changes,
    copy_changes: input.copy_changes.filter((item) => !COPY_TEXT_OPS.includes(item.op)),
    iteration: input.iteration,
    executionId: input.executionId,
  });
  const copy = cloneCommercialCopy(input.copy);
  copy.executionId = input.executionId;
  copy.iteration = input.iteration;
  const applied = [...visual.applied];
  for (const change of input.copy_changes) {
    if (COPY_TEXT_OPS.includes(change.op)) {
      applied.push(applyCopyOp(copy, change, input.inventory));
    }
  }
  return {
    composition: visual.composition,
    copy,
    applied,
    factMapping: mapApprovedFacts(copy, input.inventory),
  };
}

export function confirmedConversionPlan(iteration: number, inventory: ApprovedCopyInventory, current: CommercialCopyState): {
  layout_changes: LayoutChange[];
  copy_changes: CopyChange[];
} {
  const seed = buildSeedCommercialCopy({ ...inventory, executionId: current.executionId, iteration });
  if (iteration <= 1) {
    return {
      layout_changes: [
        { op: "SET_COPY_TONE", value: "commercial" },
        { op: "SET_SANDBOX_PLACEMENT", value: "admin" },
        { op: "SET_COMPLIANCE_PLACEMENT", value: "aside" },
      ],
      copy_changes: [
        { op: "MOVE_SANDBOX_TO_ADMIN" },
        { op: "SET_HEADLINE", value: seed.headline.text },
        { op: "SET_SUBHEADLINE", value: seed.subheadline.text },
        { op: "SET_HERO_BODY", value: seed.heroBody.text },
        { op: "SET_CTA_LABEL", value: seed.ctaLabel },
      ],
    };
  }
  if (iteration === 2) {
    return {
      layout_changes: [
        { op: "SET_OFFER_COMPARE", value: true },
        { op: "SET_PACKAGE_DENSITY", value: "featured" },
        { op: "SET_PACKAGE_HIGHLIGHT", value: "best-value" },
        { op: "SET_PRICE_EMPHASIS", value: "display" },
      ],
      copy_changes: [{ op: "SET_CTA_LABEL", value: seed.ctaLabel }],
    };
  }
  return {
    layout_changes: [
      { op: "SET_HIDE_HERO_CHIPS", value: true },
      { op: "SET_PRODUCT_PRESENTATION", value: "editorial" },
      { op: "SET_SECTION_JOURNEY", value: "packages-first" },
      { op: "SET_BUTTON_WEIGHT", value: "strong" },
      { op: "SET_RADIUS", value: "crisp" },
    ],
    copy_changes: [{ op: "HIDE_HERO_CHIPS" }],
  };
}

export function emptyCommercialCopyPlan(current: CommercialCopyState): CommercialCopyPlan {
  return {
    headline: { current: current.headline.text, proposed: current.headline.text, supporting_fact_ids: current.headline.supportingFactIds },
    subheadline: {
      current: current.subheadline.text,
      proposed: current.subheadline.text,
      supporting_fact_ids: current.subheadline.supportingFactIds,
    },
    section_changes: [],
    offer_presentation: [],
    visual_changes: [],
    conversion_improvements: [],
    compliance_risks: [],
  };
}

export function inventoryFromPage(input: {
  productName: string;
  productKind?: string | null;
  ingredients: string[];
  description?: string;
  usage?: string;
  guarantee?: string;
  guaranteeDays?: number | null;
  packages: ApprovedCopyInventory["packages"];
  approvedExcerpts?: string[];
}): ApprovedCopyInventory {
  return {
    productName: input.productName,
    productKind: input.productKind ?? null,
    ingredients: input.ingredients,
    description: input.description ?? "",
    usage: input.usage ?? "",
    guarantee: input.guarantee ?? "",
    guaranteeDays: input.guaranteeDays ?? null,
    packages: input.packages,
    approvedExcerpts: input.approvedExcerpts ?? [],
  };
}
