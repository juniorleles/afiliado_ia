import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PRODUCT_RESEARCH_VERSION, type ProductResearchRun } from "@/lib/product-research/types";

export function productResearchRoot(): string {
  const override = process.env.AIA_PRODUCT_RESEARCH_ROOT;
  if (override) return path.isAbsolute(override) ? override : path.join(process.cwd(), override);
  return path.join(process.cwd(), "data", "product-research");
}

function campaignDir(campaignId: number): string {
  return path.join(productResearchRoot(), String(campaignId));
}

function runPath(campaignId: number, runId: string): string {
  return path.join(campaignDir(campaignId), "runs", `${runId}.json`);
}

function indexPath(campaignId: number): string {
  return path.join(campaignDir(campaignId), "index.json");
}

function readJson<T>(file: string): T | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export function listProductResearchRuns(campaignId: number): string[] {
  const index = readJson<{ latestRunId?: string; runIds?: string[] }>(indexPath(campaignId));
  return index?.runIds ?? [];
}

export function readProductResearchRun(campaignId: number, runId: string): ProductResearchRun | null {
  const run = readJson<ProductResearchRun>(runPath(campaignId, runId));
  if (!run || run.campaignId !== campaignId || run.version !== PRODUCT_RESEARCH_VERSION) return null;
  return run;
}

export function readLatestProductResearch(campaignId: number): ProductResearchRun | null {
  const index = readJson<{ latestRunId?: string }>(indexPath(campaignId));
  if (!index?.latestRunId) return null;
  return readProductResearchRun(campaignId, index.latestRunId);
}

export function writeProductResearchRun(run: ProductResearchRun): ProductResearchRun {
  const dir = path.join(campaignDir(run.campaignId), "runs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(runPath(run.campaignId, run.runId), `${JSON.stringify(run, null, 2)}\n`);
  const previous = readJson<{ runIds?: string[] }>(indexPath(run.campaignId));
  const runIds = [...new Set([...(previous?.runIds ?? []), run.runId])];
  writeFileSync(indexPath(run.campaignId), `${JSON.stringify({ latestRunId: run.runId, runIds }, null, 2)}\n`);
  return run;
}

export function activeResearchRun(campaignId: number): ProductResearchRun | null {
  const latest = readLatestProductResearch(campaignId);
  if (!latest) return null;
  if (latest.status !== "QUEUED" && latest.status !== "RESEARCHING") return null;
  return latest;
}
