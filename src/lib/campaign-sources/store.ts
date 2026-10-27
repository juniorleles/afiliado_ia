import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { inspectPublicHttpsUrl } from "@/lib/real-product-assets/ssrf";
import { classifySubmittedUrl, sanitizeSharedUrl } from "@/lib/campaign-sources/classify";
import type {
  CampaignSource,
  CampaignSourceInput,
  SourceType,
} from "@/lib/campaign-sources/types";

function rootDir(): string {
  const override = process.env.AIA_CAMPAIGN_SOURCES_ROOT;
  if (override) return override;
  return join(process.cwd(), "data", "campaign-sources");
}

function dirFor(campaignId: number): string {
  return join(rootDir(), String(campaignId));
}

function fileFor(campaignId: number): string {
  return join(dirFor(campaignId), "sources.json");
}

function sourceId(campaignId: number, type: SourceType, url: string): string {
  return `src-${createHash("sha1").update(`${campaignId}|${type}|${url}`).digest("hex").slice(0, 12)}`;
}

export function readCampaignSources(campaignId: number): CampaignSource[] {
  const file = fileFor(campaignId);
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { sources?: CampaignSource[] };
    return Array.isArray(parsed.sources) ? parsed.sources : [];
  } catch {
    return [];
  }
}

export function writeCampaignSources(campaignId: number, sources: CampaignSource[]): CampaignSource[] {
  mkdirSync(dirFor(campaignId), { recursive: true });
  writeFileSync(fileFor(campaignId), `${JSON.stringify({ campaignId, sources }, null, 2)}\n`, "utf8");
  return sources;
}

function buildSource(
  campaignId: number,
  type: SourceType,
  raw: string | null | undefined,
): CampaignSource | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;
  const inspected = inspectPublicHttpsUrl(trimmed);
  const originalUrl = inspected.ok ? inspected.url.toString() : trimmed;
  const purpose = classifySubmittedUrl(originalUrl, type);
  const normalized = inspected.ok ? inspected.url.toString() : sanitizeSharedUrl(originalUrl);
  return {
    sourceId: sourceId(campaignId, purpose.sourceType, normalized),
    campaignId,
    sourceType: purpose.sourceType,
    originalUrl,
    normalizedUrl: normalized,
    finalUrl: null,
    sourceStatus: purpose.sourceStatus,
    sourceClassification: null,
    discoveryMethod: "OPERATOR",
    submittedBy: "OPERATOR",
    fetchedAt: null,
    verificationStatus: "UNVERIFIED",
    evidenceIds: [],
    notes: purpose.notes,
  };
}

export function displaySalesUrl(sources: CampaignSource[]): string {
  const sales = sources.find((item) => {
    if (item.sourceType !== "SALES_PAGE") return false;
    if (item.sourceStatus === "CHECKOUT_SUSPECTED") return false;
    return classifySubmittedUrl(item.originalUrl, "SALES_PAGE").fetchable;
  });
  return sales?.originalUrl ?? "";
}

export function upsertCampaignSource(campaignId: number, type: SourceType, raw: string | null | undefined): CampaignSource[] {
  const next = buildSource(campaignId, type, raw);
  const current = readCampaignSources(campaignId);
  if (!next) return current;
  if (next.sourceStatus === "CHECKOUT_SUSPECTED") {
    const kept = current.filter((item) => item.sourceId !== next.sourceId);
    return writeCampaignSources(campaignId, [...kept, next]);
  }
  const kept = current.filter((item) => {
    if (item.sourceId === next.sourceId) return false;
    if (type === "SALES_PAGE" && item.sourceType === "SALES_PAGE" && item.sourceStatus !== "CHECKOUT_SUSPECTED") return false;
    if (type !== "SALES_PAGE" && item.sourceType === type && item.sourceStatus !== "CHECKOUT_SUSPECTED") return false;
    return true;
  });
  return writeCampaignSources(campaignId, [...kept, next]);
}

export function mergeCampaignSources(campaignId: number, input: CampaignSourceInput): CampaignSource[] {
  if (input.salesUrl) upsertCampaignSource(campaignId, "SALES_PAGE", input.salesUrl);
  if (input.affiliateResourceUrl) upsertCampaignSource(campaignId, "AFFILIATE_RESOURCE", input.affiliateResourceUrl);
  if (input.authorizedDestinationUrl) upsertCampaignSource(campaignId, "AUTHORIZED_DESTINATION", input.authorizedDestinationUrl);
  if (input.trackingHopUrl) upsertCampaignSource(campaignId, "TRACKING_HOPLINK", input.trackingHopUrl);
  return readCampaignSources(campaignId);
}

export function syncCampaignSources(campaignId: number, input: CampaignSourceInput): CampaignSource[] {
  const next = [
    buildSource(campaignId, "SALES_PAGE", input.salesUrl),
    buildSource(campaignId, "AFFILIATE_RESOURCE", input.affiliateResourceUrl),
    buildSource(campaignId, "AUTHORIZED_DESTINATION", input.authorizedDestinationUrl),
    buildSource(campaignId, "TRACKING_HOPLINK", input.trackingHopUrl),
  ].filter((source): source is CampaignSource => Boolean(source));
  return writeCampaignSources(campaignId, next);
}

export function upsertTrackingHopSource(
  campaignId: number,
  hopUrl: string,
  validation: {
    sourceStatus: CampaignSource["sourceStatus"];
    finalUrl: string | null;
    sourceClassification: string | null;
    notes: string[];
    redirectChain?: CampaignSource["redirectChain"];
    destinationClassification?: string | null;
    blockReason?: string | null;
    fetchedAt: string;
  },
): CampaignSource[] {
  const purpose = classifySubmittedUrl(hopUrl, "TRACKING_HOPLINK");
  const inspected = inspectPublicHttpsUrl(hopUrl);
  const originalUrl = inspected.ok ? inspected.url.toString() : hopUrl.trim();
  const record: CampaignSource = {
    sourceId: sourceId(campaignId, "TRACKING_HOPLINK", originalUrl),
    campaignId,
    sourceType: "TRACKING_HOPLINK",
    originalUrl,
    normalizedUrl: inspected.ok ? inspected.url.toString() : sanitizeSharedUrl(originalUrl),
    finalUrl: validation.finalUrl,
    sourceStatus: validation.sourceStatus,
    sourceClassification: validation.sourceClassification,
    discoveryMethod: "OPERATOR",
    submittedBy: "OPERATOR",
    fetchedAt: validation.fetchedAt,
    verificationStatus: "UNVERIFIED",
    evidenceIds: [],
    notes: [...purpose.notes, ...validation.notes],
    redirectChain: validation.redirectChain,
    destinationClassification: validation.destinationClassification ?? null,
    blockReason: validation.blockReason ?? null,
  };
  const current = readCampaignSources(campaignId);
  const next = [...current.filter((item) => item.sourceType !== "TRACKING_HOPLINK"), record];
  return writeCampaignSources(campaignId, next);
}

export function markCampaignSourceFetched(
  campaignId: number,
  sourceIdValue: string,
  patch: Partial<Pick<CampaignSource, "sourceStatus" | "finalUrl" | "sourceClassification" | "fetchedAt" | "evidenceIds">>,
): CampaignSource[] {
  const sources = readCampaignSources(campaignId).map((source) =>
    source.sourceId === sourceIdValue ? { ...source, ...patch } : source,
  );
  return writeCampaignSources(campaignId, sources);
}
