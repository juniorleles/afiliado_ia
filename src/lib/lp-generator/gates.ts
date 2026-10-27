import { validateProductContract } from "@/lib/product-contract/validate";
import { validateConversionBrief } from "@/lib/conversion-strategy/validate";
import { validateBlueprint, validateSalesCopy } from "@/lib/page-blueprint/validate";
import { evaluateEditorialQuality } from "@/lib/page-blueprint/quality";
import { inspectEditorialNeutrality } from "@/lib/editorial-neutrality/inspect";
import { composeGates } from "@/lib/quality-gate/gates";
import { diskFreeGb, diskIsBelowStop } from "@/lib/quality-gate/disk";
import type { Defect, GateId, GateResult } from "@/lib/quality-gate/types";
import type { ConversionBrief } from "@/lib/conversion-strategy/types";
import type { ProductContract } from "@/lib/product-contract/types";
import type { PageBlueprint, SalesCopy } from "@/lib/page-blueprint/types";
import type { V4Model } from "@/lib/product-showcase/v4/model";
import type { ProductCatalog } from "@/lib/real-product-assets/types";
import type { ContentQualityStatus } from "@/lib/lp-generator/content-quality";
import type { GateLabelMap } from "@/lib/lp-generator/types";

function defect(partial: Omit<Defect, "fixable" | "acceptance" | "files"> & { files?: string[] }): Defect {
  return {
    ...partial,
    files: partial.files ?? [],
    fixable: false,
    acceptance: "do not invent facts, hops or images to clear a gate",
  };
}

export function pipelineDefects(input: {
  contract: ProductContract;
  brief: ConversionBrief;
  copy: SalesCopy;
  blueprint: PageBlueprint;
  model: V4Model;
  catalog: ProductCatalog | null;
}): Defect[] {
  const defects: Defect[] = [];
  const contractCheck = validateProductContract(input.contract);
  for (const item of contractCheck.violations) {
    defects.push(
      defect({
        id: `contract-${item.rule}-${item.path}`,
        kind: item.rule === "IMAGE_AUTHORITY" ? "AUTHORIZATION" : "UNGROUNDED_CLAIM",
        severity: "BLOCKING",
        gate: item.rule === "IMAGE_AUTHORITY" ? "COMMERCIAL_AUTHORIZATION_GATE" : "CONTENT_GROUNDING_GATE",
        message: item.message,
        evidence: [item.path],
      }),
    );
  }

  const briefCheck = validateConversionBrief(input.brief, input.contract);
  for (const item of briefCheck.violations) {
    defects.push(
      defect({
        id: `brief-${item.rule}-${item.path}`,
        kind: "CONVERSION_BRIEF",
        severity: "BLOCKING",
        gate: "CONTENT_GROUNDING_GATE",
        message: item.message,
        evidence: [item.path],
      }),
    );
  }

  const copyCheck = validateSalesCopy(input.copy, input.contract, input.brief);
  for (const item of copyCheck.violations) {
    defects.push(
      defect({
        id: `copy-${item.rule}-${item.path}`,
        kind: item.rule === "CTA" ? "INVALID_CTA" : "UNGROUNDED_CLAIM",
        severity: "BLOCKING",
        gate: item.rule === "CTA" ? "COMMERCIAL_AUTHORIZATION_GATE" : "CONTENT_GROUNDING_GATE",
        message: item.message,
        evidence: [item.path],
      }),
    );
  }

  const blueprintCheck = validateBlueprint(input.blueprint, input.contract, input.brief);
  for (const item of blueprintCheck.violations) {
    defects.push(
      defect({
        id: `blueprint-${item.rule}-${item.path}`,
        kind: item.rule === "CTA" ? "INVALID_CTA" : "UNGROUNDED_CLAIM",
        severity: "BLOCKING",
        gate: item.rule === "CTA" ? "COMMERCIAL_AUTHORIZATION_GATE" : "CONTENT_GROUNDING_GATE",
        message: item.message,
        evidence: [item.path],
      }),
    );
  }

  const editorial = evaluateEditorialQuality({
    copy: input.copy,
    blueprint: input.blueprint,
    contract: input.contract,
    brief: input.brief,
  });
  for (const item of editorial.blocking) {
    defects.push(
      defect({
        id: `editorial-${item.code}`,
        kind: item.code === "CTA_UNAUTHORIZED" ? "INVALID_CTA" : "EDITORIAL_QUALITY",
        severity: "BLOCKING",
        gate: item.code === "CTA_UNAUTHORIZED" ? "COMMERCIAL_AUTHORIZATION_GATE" : "EDITORIAL_QUALITY_GATE",
        message: item.message,
        evidence: [item.path],
      }),
    );
  }

  for (const finding of inspectEditorialNeutrality(input.copy)) {
    if (finding.action === "KEEP") continue;
    defects.push(
      defect({
        id: `neutrality-${finding.path}`,
        kind: "EDITORIAL_NEUTRALITY",
        severity: "BLOCKING",
        gate: "EDITORIAL_NEUTRALITY_GATE",
        message: `${finding.classification}: ${finding.reasons[0] ?? finding.rule}`,
        evidence: [finding.path, finding.originalText],
      }),
    );
  }

  if (input.model.hopHref && input.model.hopSlot !== "none" && input.contract.cta.state !== "AUTHORIZED") {
    defects.push(
      defect({
        id: "hop-unauthorized",
        kind: "INVALID_CTA",
        severity: "BLOCKING",
        gate: "COMMERCIAL_AUTHORIZATION_GATE",
        message: "A purchase CTA was rendered without an authorized hop.",
        evidence: ["cta"],
      }),
    );
  }

  const used = [input.model.commercialImage, ...(input.model.galleryImages ?? [])].filter(Boolean);
  for (const image of used) {
    const approved = input.catalog?.images.find(
      (item) => item.status === "USER_APPROVED" && image && publicFileMatches(item.productKey, item.id, image.src),
    );
    if (!approved) {
      defects.push(
        defect({
          id: `asset-${image!.src}`,
          kind: "AUTHORIZATION",
          severity: "BLOCKING",
          gate: "COMMERCIAL_AUTHORIZATION_GATE",
          message: "A rendered image is not a persisted USER_APPROVED asset.",
          evidence: [image!.src],
        }),
      );
    }
  }

  const free = diskFreeGb();
  if (diskIsBelowStop(free)) {
    defects.push(
      defect({
        id: "disk",
        kind: "DISK",
        severity: "BLOCKING",
        gate: "TECHNICAL_GATE",
        message: `C: has ${free} GB free; operations stop below 5 GB.`,
        evidence: [],
      }),
    );
  }

  return defects;
}

function publicFileMatches(productKey: string, imageId: string, src: string): boolean {
  return src === `/admin/lab/real-assets/file/${productKey}/${imageId}`;
}

export function evaluateGenerationGates(input: {
  defects: Defect[];
  contentQuality?: ContentQualityStatus;
}): { gates: Record<GateId, GateResult>; labels: GateLabelMap } {
  const gates = composeGates({
    defects: input.defects,
    visualReview: "NOT_EVALUATED",
    htmlProbed: false,
  });
  const editorialPass = gates.EDITORIAL_QUALITY_GATE.verdict === "PASS" && input.contentQuality !== "BLOCKED";
  const neutralityPass = gates.EDITORIAL_NEUTRALITY_GATE.verdict === "PASS";
  const labels: GateLabelMap = {
    TECHNICAL_PASS: gates.TECHNICAL_GATE.verdict === "PASS",
    CONTENT_PASS: gates.CONTENT_GROUNDING_GATE.verdict === "PASS" && editorialPass && neutralityPass,
    CONTENT_QUALITY_STATUS: input.contentQuality ?? (editorialPass ? "PASS" : "BLOCKED"),
    ASSET_AUTHORIZATION_PASS: !input.defects.some((item) => item.kind === "AUTHORIZATION" && item.severity === "BLOCKING"),
    COMMERCIAL_POLICY_PASS: gates.COMMERCIAL_AUTHORIZATION_GATE.verdict === "PASS",
    VISUAL_REVIEW_PENDING: gates.VISUAL_REVIEW_GATE.verdict !== "FAIL",
    HUMAN_APPROVAL_PENDING: true,
  };
  return { gates, labels };
}
