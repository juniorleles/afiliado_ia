import { classifyAssetCandidate, isViablePackshotRole } from "@/lib/assets/classify";
import { discoverSourceAssets } from "@/lib/assets/discover";
import { probeRemoteImage } from "@/lib/assets/probe";
import { classifyAssetRoleWithAi } from "@/lib/assets/vision";
import { isUnusableProductAspect } from "@/lib/presell-display";
import { storeProductImageBuffer } from "@/lib/product-image";
import type { AssetCandidate, AssetRole, ClassificationMethod } from "@/lib/assets/types";

export const MAX_ASSET_PROBES = 18;

export type ProbedCandidate = AssetCandidate & {
  decodedWidth: number;
  decodedHeight: number;
  bytes: number;
  finalUrl: string;
  downloaded: boolean;
  probedScore: number;
  mime: string;
  buffer: Buffer;
};

export type AcquisitionResult = {
  discovered: AssetCandidate[];
  downloaded: number;
  withRealDimensions: number;
  packshotCandidates: ProbedCandidate[];
  lifestyleCandidates: ProbedCandidate[];
  rejected: AssetCandidate[];
  selected: null | {
    url: string;
    finalUrl: string;
    filename: string;
    localPath: string;
    width: number;
    height: number;
    role: AssetRole;
    provenance: "DIRECT_SOURCE";
    classificationMethod: ClassificationMethod;
    packshotScore: number;
  };
};

function probedScore(candidate: AssetCandidate, width: number, height: number, role: AssetCandidate["role"]): number {
  if (!width || !height) return candidate.packshotScore;
  if (isUnusableProductAspect(width, height)) return -1;
  let score = candidate.packshotScore;
  const minSide = Math.min(width, height);
  const ratio = width / height;
  if (ratio >= 0.62 && ratio <= 1.45) score += 24;
  else if (ratio >= 0.5 && ratio <= 1.7) score += 10;
  if (minSide >= 700) score += 22;
  else if (minSide >= 400) score += 14;
  else if (minSide < 240) score -= 40;
  if (role === "PRODUCT_PACKSHOT") score += 12;
  if (role === "PRODUCT_LIFESTYLE") score += 6;
  return score;
}

function probeRank(candidate: AssetCandidate): number {
  const unknownDims = !candidate.width && !candidate.height ? 8 : 0;
  return candidate.packshotScore + unknownDims;
}

function shouldProbe(candidate: AssetCandidate): boolean {
  if (candidate.rejectReason === "tracking-pixel") return false;
  if (candidate.role === "BRAND_LOGO") return false;
  if (candidate.rejectReason === "promo-banner") return false;
  if (candidate.rejectReason === "icon-or-badge") return false;
  if (candidate.rejectReason === "testimonial-avatar") return false;
  return true;
}

export async function acquireBestProductAsset(html: string, pageUrl: string): Promise<AcquisitionResult> {
  const discovered = discoverSourceAssets(html, pageUrl);
  const rejected = discovered.filter((item) => item.rejected);
  const ranked = [...discovered]
    .filter(shouldProbe)
    .sort((a, b) => probeRank(b) - probeRank(a))
    .slice(0, MAX_ASSET_PROBES);

  const probed: ProbedCandidate[] = [];
  for (const candidate of ranked) {
    const remote = await probeRemoteImage(candidate.url);
    if (!remote) continue;
    const classified = classifyAssetCandidate({
      url: candidate.url,
      alt: candidate.alt,
      title: candidate.title,
      width: remote.width,
      height: remote.height,
      tagHtml: candidate.tagHtml,
      className: candidate.className,
      parentHint: candidate.parentHint,
      source: candidate.source,
    });
    const score = probedScore(candidate, remote.width, remote.height, classified.role);
    probed.push({
      ...candidate,
      width: remote.width,
      height: remote.height,
      role: classified.role,
      rejected: classified.rejected || score < 0,
      rejectReason: classified.rejected ? classified.rejectReason : score < 0 ? "extreme-aspect" : null,
      packshotScore: Math.max(classified.packshotScore, score),
      decodedWidth: remote.width,
      decodedHeight: remote.height,
      bytes: remote.bytes,
      finalUrl: remote.finalUrl,
      downloaded: true,
      probedScore: score,
      mime: remote.mime,
      buffer: remote.buffer,
    });
  }

  const withDims = probed.filter((item) => item.decodedWidth > 0 && item.decodedHeight > 0);
  const viable = withDims
    .filter((item) => !item.rejected && item.probedScore >= 20 && isViablePackshotRole(item.role))
    .sort((a, b) => b.probedScore - a.probedScore);

  let chosen: ProbedCandidate | null = viable.find((item) => item.role === "PRODUCT_PACKSHOT") || viable[0] || null;

  const uncertain = chosen && chosen.role === "UNCERTAIN" ? chosen : null;
  if (uncertain) {
    const ai = await classifyAssetRoleWithAi({
      mime: uncertain.mime,
      base64: uncertain.buffer.toString("base64"),
    });
    if (ai) {
      const rejectedByAi =
        ai.role === "UNUSABLE" ||
        ai.role === "BRAND_LOGO" ||
        ai.role === "INGREDIENT_VISUAL" ||
        ai.role === "DECORATIVE_SOURCE";
      const classified: ProbedCandidate = {
        ...uncertain,
        role: ai.role === "UNCERTAIN" ? uncertain.role : ai.role,
        classificationMethod: "AI_CLASSIFIED",
        rejected: rejectedByAi,
      };
      chosen = classified.rejected
        ? viable.find((item) => item.url !== classified.url && item.role === "PRODUCT_PACKSHOT") || null
        : classified;
    }
  }

  const packshots = withDims.filter((item) => item.role === "PRODUCT_PACKSHOT" && !item.rejected);
  const lifestyles = withDims.filter((item) => item.role === "PRODUCT_LIFESTYLE" && !item.rejected);

  const empty: AcquisitionResult = {
    discovered,
    downloaded: probed.length,
    withRealDimensions: withDims.length,
    packshotCandidates: packshots,
    lifestyleCandidates: lifestyles,
    rejected,
    selected: null,
  };

  if (!chosen || chosen.rejected) return empty;
  if (chosen.role !== "PRODUCT_PACKSHOT" && chosen.role !== "PRODUCT_LIFESTYLE" && chosen.role !== "UNCERTAIN") {
    return empty;
  }

  const stored = storeProductImageBuffer(chosen.buffer, chosen.mime, "DIRECT_SOURCE");
  if (!stored) return empty;

  const role: AssetRole = chosen.role === "PRODUCT_LIFESTYLE" ? "PRODUCT_LIFESTYLE" : "PRODUCT_PACKSHOT";

  return {
    ...empty,
    selected: {
      url: chosen.url,
      finalUrl: chosen.finalUrl,
      filename: stored.filename,
      localPath: stored.src,
      width: chosen.decodedWidth,
      height: chosen.decodedHeight,
      role,
      provenance: "DIRECT_SOURCE",
      classificationMethod: chosen.classificationMethod,
      packshotScore: chosen.probedScore,
    },
  };
}
