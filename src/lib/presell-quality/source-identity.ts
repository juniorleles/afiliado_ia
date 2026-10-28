import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { qualityAssessmentRoot } from "@/lib/presell-quality/persist";

export const SOURCE_IDENTITY_STATES = ["VERIFIED", "PARTIALLY_SUPPORTED", "UNRESOLVED", "CONTRADICTED"] as const;
export type SourceIdentityState = (typeof SOURCE_IDENTITY_STATES)[number];

export type SourceIdentityRecord = {
  host: string;
  state: SourceIdentityState;
  role: "MANUFACTURER" | "SELLER_OR_AFFILIATE" | "UNKNOWN" | "CLONE";
  evidence: string[];
  notes: string[];
  confirmedByHuman: boolean;
  confirmedAt: string | null;
};

export type SourceIdentityReview = {
  campaignId: number;
  records: SourceIdentityRecord[];
};

const UNCERTAIN = /vercel\.app|colibrim\.ai/i;

export function classifySourceIdentity(input: {
  host: string;
  officialHosts?: string[];
  acceptedSellerHosts?: string[];
  primaryAffiliateHosts?: string[];
  sourceClass?: string | null;
}): SourceIdentityRecord {
  const host = input.host.toLowerCase();
  const official = (input.officialHosts ?? []).some((item) => host === item || host.endsWith(`.${item}`));
  const acceptedSeller = (input.acceptedSellerHosts ?? []).some((item) => host === item || host.endsWith(`.${item}`));
  const primaryAffiliate = (input.primaryAffiliateHosts ?? []).some((item) => host === item || host.endsWith(`.${item}`));
  const clone = UNCERTAIN.test(host) || (!official && !primaryAffiliate && /defen+der/i.test(host) && !acceptedSeller);
  if (official) {
    return {
      host,
      state: "VERIFIED",
      role: "MANUFACTURER",
      evidence: ["Host matches a confirmed official manufacturer host."],
      notes: ["Manufacturer identity is verified for this campaign."],
      confirmedByHuman: false,
      confirmedAt: null,
    };
  }
  if (clone) {
    return {
      host,
      state: "UNRESOLVED",
      role: "CLONE",
      evidence: ["Host is identity-uncertain or a lookalike."],
      notes: ["Domain similarity is not proof of common ownership."],
      confirmedByHuman: false,
      confirmedAt: null,
    };
  }
  if (primaryAffiliate) {
    return {
      host,
      state: "PARTIALLY_SUPPORTED",
      role: "SELLER_OR_AFFILIATE",
      evidence: ["This host is the user-provided primary affiliate landing page."],
      notes: [
        "User-provided is not manufacturer identity.",
        "Confirming this affiliate page does not confirm the manufacturer.",
        "Domain resemblance to another host is not proof of common ownership.",
      ],
      confirmedByHuman: false,
      confirmedAt: null,
    };
  }
  if (acceptedSeller || input.sourceClass === "AFFILIATE_RESOURCE" || input.sourceClass === "SELLER") {
    return {
      host,
      state: "PARTIALLY_SUPPORTED",
      role: "SELLER_OR_AFFILIATE",
      evidence: acceptedSeller
        ? ["This host already supports accepted seller-stated facts."]
        : ["Source is classified as seller or affiliate resource."],
      notes: [
        "Partial support does not grant manufacturer privileges.",
        "Do not treat the seller as the manufacturer without independent proof.",
      ],
      confirmedByHuman: false,
      confirmedAt: null,
    };
  }
  return {
    host,
    state: "UNRESOLVED",
    role: "UNKNOWN",
    evidence: ["No official or accepted-seller host match."],
    notes: ["Identity stays unresolved until documented."],
    confirmedByHuman: false,
    confirmedAt: null,
  };
}

export function investigateCampaignSourceIdentity(input: {
  campaignId: number;
  hosts: Array<{ host: string; sourceClass?: string | null }>;
  officialHosts?: string[];
  acceptedSellerHosts?: string[];
  primaryAffiliateHosts?: string[];
}): SourceIdentityReview {
  const seen = new Set<string>();
  const records: SourceIdentityRecord[] = [];
  for (const item of input.hosts) {
    const host = item.host.toLowerCase();
    if (!host || seen.has(host)) continue;
    seen.add(host);
    records.push(classifySourceIdentity({
      host,
      officialHosts: input.officialHosts,
      acceptedSellerHosts: input.acceptedSellerHosts,
      primaryAffiliateHosts: input.primaryAffiliateHosts,
      sourceClass: item.sourceClass,
    }));
  }
  return { campaignId: input.campaignId, records };
}

function fileOf(campaignId: number): string {
  return path.join(qualityAssessmentRoot(), String(campaignId), "source-identity.json");
}

export function writeSourceIdentityReview(review: SourceIdentityReview): SourceIdentityReview {
  mkdirSync(path.dirname(fileOf(review.campaignId)), { recursive: true });
  writeFileSync(fileOf(review.campaignId), `${JSON.stringify(review, null, 2)}\n`);
  return review;
}

export function readSourceIdentityReview(campaignId: number): SourceIdentityReview | null {
  if (!existsSync(fileOf(campaignId))) return null;
  try {
    return JSON.parse(readFileSync(fileOf(campaignId), "utf8")) as SourceIdentityReview;
  } catch {
    return null;
  }
}

export function isGenericHostConfirmation(host: string): boolean {
  const value = host.trim().toLowerCase();
  return !value || value.includes(",") || /\band\b|todos|all domains|todas as fontes/i.test(value);
}

export function confirmSourceIdentity(input: {
  campaignId: number;
  host: string;
  state: SourceIdentityState;
  documentation: string;
  review?: SourceIdentityReview | null;
}): SourceIdentityReview {
  if (isGenericHostConfirmation(input.host)) {
    throw new Error("Confirm one host at a time. Generic multi-domain confirmation is blocked.");
  }
  if (input.state === "VERIFIED" && !/manufacturer|official host|json-ld|organization/i.test(input.documentation)) {
    throw new Error("VERIFIED manufacturer identity requires documented proof.");
  }
  const review = input.review ?? readSourceIdentityReview(input.campaignId) ?? { campaignId: input.campaignId, records: [] };
  const host = input.host.toLowerCase();
  const next: SourceIdentityRecord = {
    host,
    state: input.state,
    role: input.state === "VERIFIED" ? "MANUFACTURER" : input.state === "PARTIALLY_SUPPORTED" ? "SELLER_OR_AFFILIATE" : "UNKNOWN",
    evidence: [input.documentation],
    notes: input.state === "VERIFIED" ? ["Human documented manufacturer identity."] : ["Human documented seller/affiliate identity. Not a manufacturer claim."],
    confirmedByHuman: true,
    confirmedAt: new Date().toISOString(),
  };
  const records = review.records.filter((item) => item.host !== host);
  records.push(next);
  return writeSourceIdentityReview({ campaignId: input.campaignId, records });
}
