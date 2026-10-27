import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { GenerationRecord, GenerationState, GenerationSummary } from "@/lib/lp-generator/types";
import { LP_GENERATOR_VERSION } from "@/lib/lp-generator/types";
import type { V4Model } from "@/lib/product-showcase/v4/model";

export const DEFAULT_GENERATION_ROOT = path.join(process.cwd(), "data", "lp-generations");

const TERMINAL: GenerationState[] = ["PREVIEW_READY", "NEEDS_REVIEW", "FAILED"];
const IN_FLIGHT: GenerationState[] = [
  "CREATED",
  "RESEARCHING",
  "BUILDING_CONTRACT",
  "GENERATING_STRATEGY",
  "GENERATING_COPY",
  "SELECTING_ASSETS",
  "RENDERING",
  "VALIDATING",
];

function dirOf(id: string, root: string): string {
  return path.join(root, id);
}

function recordFile(id: string, root: string): string {
  return path.join(dirOf(id, root), "generation.json");
}

function modelFile(id: string, root: string): string {
  return path.join(dirOf(id, root), "model.json");
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

export function emptyRecord(input: GenerationRecord["input"], id: string, hash: string, now: string): GenerationRecord {
  return {
    version: LP_GENERATOR_VERSION,
    id,
    hash,
    status: "CREATED",
    input,
    productKey: "",
    sources: [],
    limitations: [],
    assets: { productKey: "", approvedUsed: [], approvedAvailable: 0, pendingCount: 0, blockedCount: 0 },
    defects: [],
    errors: [],
    timings: { createdAt: now, updatedAt: now, startedAt: null, finishedAt: null, durationMs: null, stages: [] },
    previewPath: null,
  };
}

export function readGeneration(id: string, root = DEFAULT_GENERATION_ROOT): GenerationRecord | null {
  const file = recordFile(id, root);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as GenerationRecord;
  } catch {
    return null;
  }
}

export function writeGeneration(record: GenerationRecord, root = DEFAULT_GENERATION_ROOT): void {
  const next = { ...record, timings: { ...record.timings, updatedAt: new Date().toISOString() } };
  writeAtomic(recordFile(record.id, root), `${JSON.stringify(next, null, 2)}\n`);
}

export function readGenerationModel(id: string, root = DEFAULT_GENERATION_ROOT): V4Model | null {
  const file = modelFile(id, root);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as V4Model;
  } catch {
    return null;
  }
}

export function writeGenerationModel(id: string, model: V4Model, root = DEFAULT_GENERATION_ROOT): void {
  writeAtomic(modelFile(id, root), `${JSON.stringify(model)}\n`);
}

export function listGenerations(root = DEFAULT_GENERATION_ROOT): GenerationSummary[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readGeneration(entry.name, root))
    .filter((item): item is GenerationRecord => Boolean(item))
    .sort((a, b) => b.timings.updatedAt.localeCompare(a.timings.updatedAt))
    .map((item) => ({
      id: item.id,
      hash: item.hash,
      productName: item.input.productName,
      productKey: item.productKey,
      status: item.status,
      createdAt: item.timings.createdAt,
      updatedAt: item.timings.updatedAt,
      previewPath: item.previewPath,
    }));
}

export function findReusableGeneration(hash: string, root = DEFAULT_GENERATION_ROOT): GenerationRecord | null {
  const rows = listGenerations(root)
    .filter((item) => item.hash === hash)
    .map((item) => readGeneration(item.id, root))
    .filter((item): item is GenerationRecord => Boolean(item));
  const inflight = rows.find((item) => IN_FLIGHT.includes(item.status));
  if (inflight) return inflight;
  const ready = rows.find((item) => item.status === "PREVIEW_READY" || item.status === "NEEDS_REVIEW");
  return ready ?? null;
}

export function isTerminal(status: GenerationState): boolean {
  return TERMINAL.includes(status);
}
