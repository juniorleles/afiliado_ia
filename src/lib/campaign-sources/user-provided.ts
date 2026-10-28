import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inspectPublicHttpsUrl } from "@/lib/real-product-assets/ssrf";
import { classifySubmittedUrl, sanitizeSharedUrl } from "@/lib/campaign-sources/classify";
import { classifyUrlRoles, type UrlRole } from "@/lib/campaign-sources/roles";
import { readCampaignSources, writeCampaignSources } from "@/lib/campaign-sources/store";
import type { CampaignSource } from "@/lib/campaign-sources/types";

export type UserProvidedAffiliateRecord = {
  campaignId: number;
  origin: "USER_PROVIDED";
  recordedAt: string;
  verificationStatus: "UNVERIFIED";
  commerciallyAuthorized: false;
  usedAsActiveCta: false;
  originalUrl: string;
  host: string;
  path: string;
  attribution: Record<string, string>;
  publicUrl: string;
  roles: UrlRole[];
  notes: string[];
};

const ATTRIBUTION_KEYS = /^(hop|hopid|tid|sid|affid|affiliateid|clickid|subid)$/i;

function rootDir(): string {
  const override = process.env.AIA_CAMPAIGN_SOURCES_ROOT;
  if (override) return override;
  return join(process.cwd(), "data", "campaign-sources");
}

function privateFile(campaignId: number): string {
  return join(rootDir(), String(campaignId), "user-provided-affiliate.json");
}

function attributionOf(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const url = new URL(raw);
    for (const [key, value] of url.searchParams.entries()) {
      if (ATTRIBUTION_KEYS.test(key)) out[key] = value;
    }
  } catch {
    return out;
  }
  return out;
}

export function readUserProvidedAffiliateUrl(campaignId: number): UserProvidedAffiliateRecord | null {
  const file = privateFile(campaignId);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as UserProvidedAffiliateRecord;
  } catch {
    return null;
  }
}

export function publicAffiliateView(record: UserProvidedAffiliateRecord): Omit<UserProvidedAffiliateRecord, "originalUrl" | "attribution"> & {
  originalUrl: string;
  attribution: Record<string, "REDACTED">;
} {
  const attribution = Object.fromEntries(Object.keys(record.attribution).map((key) => [key, "REDACTED" as const]));
  return {
    ...record,
    originalUrl: record.publicUrl,
    attribution,
  };
}

function sourceId(campaignId: number, sanitized: string): string {
  return `src-${createHash("sha1").update(`${campaignId}|USER_PROVIDED|${sanitized}`).digest("hex").slice(0, 12)}`;
}

function markHistoricalFixtures(sources: CampaignSource[]): CampaignSource[] {
  return sources.map((item) => {
    const hopFixture = /[?&]hop=z+/i.test(item.originalUrl) || /[?&]hop=z+/i.test(item.normalizedUrl);
    if (!hopFixture) return item;
    const notes = item.notes.includes("HISTORICAL_FIXTURE")
      ? item.notes
      : [...item.notes, "HISTORICAL_FIXTURE", "Not the current user-provided affiliate URL."];
    return { ...item, origin: "HISTORICAL_FIXTURE" as const, notes };
  });
}

export function registerUserProvidedAffiliateUrl(input: {
  campaignId: number;
  url: string;
  recordedAt?: string;
}): UserProvidedAffiliateRecord {
  const trimmed = input.url.trim();
  const inspected = inspectPublicHttpsUrl(trimmed);
  if (!inspected.ok) throw new Error(inspected.reason);
  const url = inspected.url;
  const roles = classifyUrlRoles(url.toString());
  const purpose = classifySubmittedUrl(url.toString());
  const record: UserProvidedAffiliateRecord = {
    campaignId: input.campaignId,
    origin: "USER_PROVIDED",
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    verificationStatus: "UNVERIFIED",
    commerciallyAuthorized: false,
    usedAsActiveCta: false,
    originalUrl: url.toString(),
    host: url.hostname.toLowerCase(),
    path: url.pathname || "/",
    attribution: attributionOf(url.toString()),
    publicUrl: sanitizeSharedUrl(url.toString()),
    roles: roles.roles,
    notes: [
      ...roles.notes,
      "PRIMARY_AFFILIATE_LANDING_PAGE: read-only extraction is allowed for this registered URL.",
      "USER_PROVIDED is not COMMERCIALLY_AUTHORIZED.",
      "The URL is not an active public CTA.",
      purpose.notes[0] ?? purpose.sourceStatus,
    ].filter((item, index, all) => item && all.indexOf(item) === index),
  };
  mkdirSync(join(rootDir(), String(input.campaignId)), { recursive: true });
  writeFileSync(privateFile(input.campaignId), `${JSON.stringify(record, null, 2)}\n`);

  const publicRecord: CampaignSource = {
    sourceId: sourceId(input.campaignId, record.publicUrl),
    campaignId: input.campaignId,
    sourceType: purpose.sourceType,
    originalUrl: record.publicUrl,
    normalizedUrl: record.publicUrl,
    finalUrl: null,
    sourceStatus: purpose.sourceStatus,
    sourceClassification: roles.roles.join(","),
    discoveryMethod: "OPERATOR",
    submittedBy: "USER",
    fetchedAt: null,
    verificationStatus: "UNVERIFIED",
    evidenceIds: [],
    notes: record.notes,
    origin: "USER_PROVIDED",
    roles: roles.roles,
    attributionStoredPrivately: true,
  };
  const current = markHistoricalFixtures(readCampaignSources(input.campaignId));
  const next = [...current.filter((item) => item.origin !== "USER_PROVIDED" && item.sourceId !== publicRecord.sourceId), publicRecord];
  writeCampaignSources(input.campaignId, next);
  return record;
}
