import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { HopRecord, OfficialOfferClick } from "@/lib/affiliate-hop/types";

export const DEFAULT_HOP_ROOT = path.join(process.cwd(), "data", "affiliate-hops");

const PRODUCT_KEY = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function assertProductKey(productKey: string): string {
  const key = productKey.trim().toLowerCase();
  if (!PRODUCT_KEY.test(key)) throw new Error("productKey is not a safe store identifier");
  return key;
}

function recordFile(productKey: string, root: string): string {
  return path.join(root, assertProductKey(productKey), "hop.json");
}

function clickFile(productKey: string, root: string): string {
  return path.join(root, assertProductKey(productKey), "clicks.json");
}

function writeAtomic(file: string, body: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, body, "utf8");
  try {
    renameSync(tmp, file);
  } catch {
    writeFileSync(file, body, "utf8");
    try {
      unlinkSync(tmp);
    } catch {
      /* leftover tmp */
    }
  }
}

export function readHopRecord(productKey: string, root = DEFAULT_HOP_ROOT): HopRecord | null {
  const file = recordFile(productKey, root);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as HopRecord;
  } catch {
    return null;
  }
}

export function writeHopRecord(record: HopRecord, root = DEFAULT_HOP_ROOT): void {
  writeAtomic(recordFile(record.productKey, root), `${JSON.stringify(record, null, 2)}\n`);
}

export function readClicks(productKey: string, root = DEFAULT_HOP_ROOT): OfficialOfferClick[] {
  const file = clickFile(productKey, root);
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as OfficialOfferClick[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeClicks(productKey: string, clicks: OfficialOfferClick[], root = DEFAULT_HOP_ROOT): void {
  writeAtomic(clickFile(productKey, root), `${JSON.stringify(clicks, null, 2)}\n`);
}
