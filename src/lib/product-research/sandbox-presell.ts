import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { productResearchRoot } from "@/lib/product-research/store";
import type { ReviewContentStatus } from "@/lib/lp-generator/types";

export type SandboxPresellPointer = {
  campaignId: number;
  generationId: string;
  researchRunId: string;
  productContractStatus: string;
  contentStatus: ReviewContentStatus;
  previewPath: string;
  createdAt: string;
  updatedAt: string;
};

function pointerFile(campaignId: number): string {
  return path.join(productResearchRoot(), String(campaignId), "sandbox-presell.json");
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

export function readSandboxPresellPointer(campaignId: number): SandboxPresellPointer | null {
  const file = pointerFile(campaignId);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as SandboxPresellPointer;
    if (parsed.campaignId !== campaignId || !parsed.generationId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSandboxPresellPointer(pointer: SandboxPresellPointer): SandboxPresellPointer {
  const next = { ...pointer, updatedAt: new Date().toISOString() };
  writeAtomic(pointerFile(pointer.campaignId), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}
