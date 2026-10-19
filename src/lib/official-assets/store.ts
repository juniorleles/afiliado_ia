import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/db";
import { getCampaignById, setCampaignHeroPackshot } from "@/lib/campaigns";
import {
  extractOfficialPromoImages,
  officialToolsPageAllowed,
  type OfficialSection,
} from "@/lib/official-assets/extract";
import {
  permissionEvidence,
  productNameInAsset,
  promoImageLandingBlock,
  validateOfficialFile,
} from "@/lib/official-assets/review";

export type OfficialAssetStatus = "pending" | "approved" | "rejected";

export type OfficialPromoAsset = {
  id: number;
  campaignId: number;
  sourcePage: string;
  section: OfficialSection;
  originalUrl: string;
  fileName: string;
  status: OfficialAssetStatus;
  blockReason: string | null;
  reviewNote: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  format: string | null;
  productMatch: "confirmed" | "unconfirmed";
  permissionEvidence: string;
  verifiedAt: string;
  localFile: string | null;
  isHero: boolean;
};

type AssetRow = Omit<OfficialPromoAsset, "isHero" | "section" | "status" | "productMatch"> & {
  section: string;
  status: string;
  productMatch: string;
  isHero: number;
};

function mapRow(row: AssetRow): OfficialPromoAsset {
  return {
    ...row,
    section: row.section === "campaign" ? "campaign" : "product",
    status: row.status === "approved" || row.status === "rejected" ? row.status : "pending",
    productMatch: row.productMatch === "confirmed" ? "confirmed" : "unconfirmed",
    isHero: row.isHero === 1,
  };
}

export function campaignAssetDir(campaignId: number): string {
  return path.join(process.cwd(), "data", "campaign-assets", String(campaignId));
}

export function listOfficialPromoAssets(campaignId: number): OfficialPromoAsset[] {
  const rows = getDb()
    .prepare("SELECT * FROM official_promo_assets WHERE campaignId = ? ORDER BY id")
    .all(campaignId) as AssetRow[];
  return rows.map(mapRow);
}

export function storedProductName(sourceFactsJson: string | null, fallback: string): string {
  try {
    const parsed = JSON.parse(sourceFactsJson || "{}") as { productName?: unknown };
    if (typeof parsed.productName === "string" && parsed.productName.trim() && parsed.productName !== "NOT_FOUND") {
      return parsed.productName.trim();
    }
  } catch {
    return fallback;
  }
  return fallback;
}

export function discoverOfficialPromoHtml(input: {
  campaignId: number;
  pageUrl: string;
  html: string;
  productName: string;
  verifiedAt?: string;
}): { saved: number; error?: string } {
  if (!officialToolsPageAllowed(input.pageUrl)) {
    return { saved: 0, error: "Só uma página HTTPS do fabricante pode ser consultada. Buscadores não são fonte." };
  }
  const images = extractOfficialPromoImages(input.html, input.pageUrl);
  if (images.length === 0) {
    return { saved: 0, error: "A página não tem as seções Product Images e Campaign Images." };
  }
  const verifiedAt = input.verifiedAt ?? new Date().toISOString();
  const now = verifiedAt;
  const db = getDb();
  const existing = db.prepare(
    "SELECT id, status FROM official_promo_assets WHERE campaignId = ? AND originalUrl = ?",
  );
  const insert = db.prepare(
    `INSERT INTO official_promo_assets (
      campaignId, sourcePage, section, originalUrl, fileName, status, blockReason, reviewNote,
      width, height, bytes, format, productMatch, permissionEvidence, verifiedAt, localFile, isHero,
      createdAt, updatedAt
    ) VALUES (
      @campaignId, @sourcePage, @section, @originalUrl, @fileName, @status, @blockReason, NULL,
      NULL, NULL, NULL, @format, @productMatch, @permissionEvidence, @verifiedAt, NULL, 0,
      @createdAt, @updatedAt
    )`,
  );
  let saved = 0;
  const write = db.transaction(() => {
    for (const image of images) {
      const prior = existing.get(input.campaignId, image.originalUrl) as { id: number; status: string } | undefined;
      if (prior) continue;
      const blockReason = promoImageLandingBlock(`${image.fileName} ${image.originalUrl}`);
      insert.run({
        campaignId: input.campaignId,
        sourcePage: image.sourcePage,
        section: image.section,
        originalUrl: image.originalUrl,
        fileName: image.fileName,
        status: blockReason ? "rejected" : "pending",
        blockReason,
        format: image.fileName.split(".").pop()?.toLowerCase() || null,
        productMatch: productNameInAsset(input.productName, image.originalUrl, image.fileName),
        permissionEvidence: permissionEvidence(image.section, image.sourcePage, verifiedAt),
        verifiedAt,
        createdAt: now,
        updatedAt: now,
      });
      saved += 1;
    }
  });
  write();
  return { saved };
}

/**
 * Register one manufacturer-listed promo file without approving it.
 * Use when the affiliate page names the file outside Product Images / Campaign Images headings.
 */
export function registerOfficialPromoCandidate(input: {
  campaignId: number;
  sourcePage: string;
  section: OfficialSection;
  originalUrl: string;
  fileName: string;
  productName: string;
  status: OfficialAssetStatus;
  blockReason?: string | null;
  reviewNote?: string | null;
  permissionEvidence: string;
  verifiedAt: string;
}): { id: number; created: boolean } {
  if (!officialToolsPageAllowed(input.sourcePage)) {
    throw new Error("Só uma página HTTPS do fabricante pode ser a origem.");
  }
  if (input.originalUrl.includes("demo-assets") || input.sourcePage.includes("demo-assets")) {
    throw new Error("Demo assets cannot be assigned to a campaign.");
  }
  if (input.status === "approved") {
    throw new Error("Candidatos não podem ser registrados já aprovados.");
  }
  const db = getDb();
  const prior = db
    .prepare("SELECT id FROM official_promo_assets WHERE campaignId = ? AND originalUrl = ?")
    .get(input.campaignId, input.originalUrl) as { id: number } | undefined;
  if (prior) return { id: prior.id, created: false };
  const nameBlock = promoImageLandingBlock(`${input.fileName} ${input.originalUrl}`);
  const status = nameBlock ? "rejected" : input.status;
  const blockReason = nameBlock || input.blockReason || null;
  const result = db
    .prepare(
      `INSERT INTO official_promo_assets (
        campaignId, sourcePage, section, originalUrl, fileName, status, blockReason, reviewNote,
        width, height, bytes, format, productMatch, permissionEvidence, verifiedAt, localFile, isHero,
        createdAt, updatedAt
      ) VALUES (
        @campaignId, @sourcePage, @section, @originalUrl, @fileName, @status, @blockReason, @reviewNote,
        NULL, NULL, NULL, @format, @productMatch, @permissionEvidence, @verifiedAt, NULL, 0,
        @createdAt, @updatedAt
      )`,
    )
    .run({
      campaignId: input.campaignId,
      sourcePage: input.sourcePage,
      section: input.section,
      originalUrl: input.originalUrl,
      fileName: input.fileName,
      status,
      blockReason,
      reviewNote: input.reviewNote ?? null,
      format: input.fileName.split(".").pop()?.toLowerCase() || null,
      productMatch: productNameInAsset(input.productName, input.originalUrl, input.fileName),
      permissionEvidence: input.permissionEvidence,
      verifiedAt: input.verifiedAt,
      createdAt: input.verifiedAt,
      updatedAt: input.verifiedAt,
    });
  return { id: Number(result.lastInsertRowid), created: true };
}

export function rejectOfficialPromoAsset(campaignId: number, assetId: number, reviewNote: string): void {
  const note = reviewNote.trim();
  if (note.length < 8) throw new Error("Informe o motivo da rejeição.");
  const asset = listOfficialPromoAssets(campaignId).find((item) => item.id === assetId);
  if (!asset || asset.status === "rejected") throw new Error("Arquivo indisponível para rejeição.");
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE official_promo_assets
       SET status = 'rejected', reviewNote = @reviewNote, isHero = 0, updatedAt = @updatedAt
       WHERE id = @id AND campaignId = @campaignId`,
    )
    .run({ reviewNote: note, updatedAt: now, id: assetId, campaignId });
  if (asset.isHero) clearHeroIfMatches(campaignId, asset.localFile);
}

function clearHeroIfMatches(campaignId: number, localFile: string | null): void {
  const campaign = getCampaignById(campaignId);
  if (!campaign || !localFile) return;
  if (campaign.productImageSrc === localFile) setCampaignHeroPackshot(campaignId, null, null);
}

export function approveOfficialPromoAsset(input: {
  campaignId: number;
  assetId: number;
  bytes: Buffer;
  embeddedTextCleared: boolean;
  productMatchConfirmed: boolean;
}): OfficialPromoAsset {
  const asset = listOfficialPromoAssets(input.campaignId).find((item) => item.id === input.assetId);
  if (!asset || asset.status !== "pending" || asset.blockReason) {
    throw new Error("Este arquivo não pode entrar na página.");
  }
  if (!input.embeddedTextCleared) throw new Error("O texto incorporado ainda não foi revisado.");
  if (asset.productMatch !== "confirmed" && !input.productMatchConfirmed) {
    throw new Error("A correspondência com o produto não foi confirmada.");
  }
  if (asset.originalUrl.includes("demo-assets")) throw new Error("Demo assets cannot be assigned to a campaign.");
  const checked = validateOfficialFile(input.bytes);
  if ("error" in checked) throw new Error(checked.error);
  const localName = `${asset.id}.${checked.format === "jpeg" ? "jpg" : checked.format}`;
  const directory = campaignAssetDir(input.campaignId);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, localName), input.bytes);
  const localFile = `/media/campaign-asset/${input.campaignId}/${localName}`;
  const now = new Date().toISOString();
  const db = getDb();
  db.prepare("UPDATE official_promo_assets SET isHero = 0, updatedAt = ? WHERE campaignId = ? AND isHero = 1").run(now, input.campaignId);
  db.prepare(
    `UPDATE official_promo_assets
     SET status = 'approved', width = @width, height = @height, bytes = @bytes, format = @format,
         localFile = @localFile, isHero = 1, updatedAt = @updatedAt
     WHERE id = @id AND campaignId = @campaignId`,
  ).run({
    width: checked.width,
    height: checked.height,
    bytes: input.bytes.length,
    format: checked.format,
    localFile,
    updatedAt: now,
    id: asset.id,
    campaignId: input.campaignId,
  });
  setCampaignHeroPackshot(input.campaignId, localFile, "MANUAL");
  const saved = listOfficialPromoAssets(input.campaignId).find((item) => item.id === asset.id);
  if (!saved) throw new Error("Falha ao gravar o arquivo aprovado.");
  return saved;
}

export function readApprovedCampaignAsset(campaignId: number, fileName: string): { body: Buffer; contentType: string } | null {
  if (!/^\d+\.(?:jpg|png|webp)$/.test(fileName)) return null;
  const asset = listOfficialPromoAssets(campaignId).find((item) => item.localFile?.endsWith(`/${fileName}`));
  if (!asset || asset.status !== "approved" || !asset.localFile || asset.localFile.includes("demo-assets")) return null;
  const fullPath = path.join(campaignAssetDir(campaignId), fileName);
  if (!existsSync(fullPath)) return null;
  const body = readFileSync(fullPath);
  const mime = asset.format === "png" ? "image/png" : asset.format === "webp" ? "image/webp" : "image/jpeg";
  return { body, contentType: mime };
}
