import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { qualityAssessmentRoot } from "@/lib/presell-quality/persist";

export const DESIGN_CHECKPOINT_FILES = [
  "src/app/premium-design-engine.css",
  "src/components/design-system/premium-blocks.tsx",
  "src/lib/design-system/tokens.ts",
  "src/lib/presell-quality/premium-slots.ts",
] as const;

export type DesignCheckpointFile = {
  path: (typeof DESIGN_CHECKPOINT_FILES)[number] | string;
  sha256: string;
  contents: string;
};

export type DesignCheckpoint = {
  id: string;
  campaignId: number;
  generationId: string;
  createdAt: string;
  sourceCommit: string | null;
  files: DesignCheckpointFile[];
  screenshotHashes: string[];
  notes: string[];
};

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createDesignCheckpoint(input: {
  campaignId: number;
  generationId: string;
  sourceCommit?: string | null;
  screenshotHashes?: string[];
  notes?: string[];
  root?: string;
  id?: string;
  extraFiles?: string[];
}): DesignCheckpoint {
  const root = input.root ?? process.cwd();
  const listed = [
    ...DESIGN_CHECKPOINT_FILES,
    ...(input.extraFiles ?? []).filter((relative) => !(DESIGN_CHECKPOINT_FILES as readonly string[]).includes(relative)),
  ];
  const files = listed.map((relative) => {
    const absolute = path.join(root, relative);
    const contents = existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
    return { path: relative, sha256: hashText(contents), contents };
  });
  const checkpoint: DesignCheckpoint = {
    id: input.id ?? `chk-${Date.now().toString(36)}`,
    campaignId: input.campaignId,
    generationId: input.generationId,
    createdAt: new Date().toISOString(),
    sourceCommit: input.sourceCommit ?? null,
    files,
    screenshotHashes: input.screenshotHashes ?? [],
    notes: input.notes ?? [],
  };
  const dir = path.join(qualityAssessmentRoot(), String(input.campaignId), "design-checkpoints");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${checkpoint.id}.json`), `${JSON.stringify({ ...checkpoint, files: files.map(({ contents, ...rest }) => rest) }, null, 2)}\n`);
  writeFileSync(path.join(dir, `${checkpoint.id}.files.json`), `${JSON.stringify(checkpoint, null, 2)}\n`);
  return checkpoint;
}

export function createDesignCheckpointFromFiles(input: {
  id: string;
  campaignId: number;
  generationId: string;
  sourceCommit?: string | null;
  screenshotHashes?: string[];
  notes?: string[];
  files: Array<{ path: string; contents: string }>;
}): DesignCheckpoint {
  const files = input.files.map((item) => ({
    path: item.path,
    sha256: hashText(item.contents),
    contents: item.contents,
  }));
  const checkpoint: DesignCheckpoint = {
    id: input.id,
    campaignId: input.campaignId,
    generationId: input.generationId,
    createdAt: new Date().toISOString(),
    sourceCommit: input.sourceCommit ?? null,
    files,
    screenshotHashes: input.screenshotHashes ?? [],
    notes: input.notes ?? [],
  };
  const dir = path.join(qualityAssessmentRoot(), String(input.campaignId), "design-checkpoints");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${checkpoint.id}.json`), `${JSON.stringify({ ...checkpoint, files: files.map(({ contents, ...rest }) => rest) }, null, 2)}\n`);
  writeFileSync(path.join(dir, `${checkpoint.id}.files.json`), `${JSON.stringify(checkpoint, null, 2)}\n`);
  return checkpoint;
}

export function restoreDesignCheckpoint(
  checkpoint: DesignCheckpoint,
  options: { root?: string; confirm: true },
): { restored: string[]; skipped: string[] } {
  const root = options.root ?? process.cwd();
  const restored: string[] = [];
  const skipped: string[] = [];
  for (const file of checkpoint.files) {
    if (!DESIGN_CHECKPOINT_FILES.includes(file.path as (typeof DESIGN_CHECKPOINT_FILES)[number]) && !file.path.startsWith("src/")) {
      skipped.push(file.path);
      continue;
    }
    const absolute = path.join(root, file.path);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, file.contents);
    restored.push(file.path);
  }
  return { restored, skipped };
}

export function checkpointDiffers(left: DesignCheckpoint, right: DesignCheckpoint): boolean {
  const leftMap = new Map(left.files.map((item) => [item.path, item.sha256]));
  return right.files.some((item) => leftMap.get(item.path) !== item.sha256);
}
