import { AFFILIATE_HOP_VERSION, type HopAuthorizationStatus, type HopRecord } from "@/lib/affiliate-hop/types";
import { validateHopFormat } from "@/lib/affiliate-hop/format";
import { assertProductKey } from "@/lib/affiliate-hop/store";

const PREVIEW_OR_PROD: HopAuthorizationStatus[] = ["AUTHORIZED_FOR_PREVIEW", "AUTHORIZED_FOR_PRODUCTION"];

export function registerHop(input: { productKey: string; href: string; now?: string }): HopRecord {
  const now = input.now ?? new Date().toISOString();
  const format = validateHopFormat(input.href);
  return {
    version: AFFILIATE_HOP_VERSION,
    productKey: assertProductKey(input.productKey),
    href: format.ok ? input.href.trim() : input.href.trim(),
    platform: "clickbank",
    authorization: format.ok ? "PENDING_VALIDATION" : "BLOCKED",
    format,
    probe: null,
    registeredAt: now,
    updatedAt: now,
  };
}

export function markValidated(record: HopRecord, now = new Date().toISOString()): HopRecord {
  if (record.authorization === "BLOCKED" || !record.format.ok) return { ...record, authorization: "BLOCKED", updatedAt: now };
  if (PREVIEW_OR_PROD.includes(record.authorization)) return { ...record, updatedAt: now };
  return { ...record, authorization: "VALIDATED", updatedAt: now };
}

/**
 * Preview and production require an explicit operator flag.
 * Technical validation never promotes those states.
 */
export function authorizeHop(
  record: HopRecord,
  target: "AUTHORIZED_FOR_PREVIEW" | "AUTHORIZED_FOR_PRODUCTION",
  explicit: boolean,
  now = new Date().toISOString(),
): HopRecord {
  if (!explicit) return record;
  if (record.authorization === "BLOCKED" || !record.format.ok) return record;
  if (record.authorization !== "VALIDATED" && record.authorization !== "AUTHORIZED_FOR_PREVIEW") return record;
  if (target === "AUTHORIZED_FOR_PRODUCTION" && record.authorization !== "AUTHORIZED_FOR_PREVIEW" && record.authorization !== "VALIDATED") {
    return record;
  }
  return { ...record, authorization: target, updatedAt: now };
}

export function ctaMayRender(record: HopRecord | null): boolean {
  if (!record?.format.ok) return false;
  if (record.probe?.status === "FAIL") return false;
  return record.authorization === "AUTHORIZED_FOR_PREVIEW" || record.authorization === "AUTHORIZED_FOR_PRODUCTION";
}

export function productionPublicationBlocked(record: HopRecord | null): boolean {
  return record?.authorization !== "AUTHORIZED_FOR_PRODUCTION";
}
