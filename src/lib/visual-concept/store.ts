import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import type { ArtDirectionBrief } from "@/lib/visual-concept/art-director";
import type { ConceptMetadata, VisualBrief, VisualDirectionKey } from "@/lib/visual-concept/types";

export type StoredConcept = {
  key: VisualDirectionKey;
  metadata: ConceptMetadata;
  imageFile: string;
};

export type StoredRun = {
  generationId: string;
  generationRequestId: string;
  contentVersion: string;
  createdAt: string;
  concepts: StoredConcept[];
};

export function visualDesignRoot(root = path.join(process.cwd(), "data", "visual-design")): string {
  return root;
}

function campaignDir(root: string, slug: string): string {
  if (!/^[a-z0-9-]+$/i.test(slug)) throw new Error("invalid campaign slug");
  return path.join(root, slug);
}

function readJson<T>(file: string): T | null {
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

export function findRunByRequest(root: string, slug: string, requestId: string): StoredRun | null {
  const file = path.join(campaignDir(root, slug), "requests", `${requestId}.json`);
  return readJson<StoredRun>(file);
}

export function findRunByContentVersion(root: string, slug: string, contentVersion: string): StoredRun | null {
  const runsDir = path.join(campaignDir(root, slug), "runs");
  if (!existsSync(runsDir)) return null;
  for (const generationId of readdirSync(runsDir)) {
    const run = readRun(root, slug, generationId);
    if (run?.contentVersion === contentVersion) return run;
  }
  return null;
}

export function readRun(root: string, slug: string, generationId: string): StoredRun | null {
  if (!/^[a-zA-Z0-9-]+$/.test(generationId)) return null;
  const dir = path.join(campaignDir(root, slug), "runs", generationId);
  const summary = readJson<{ generationRequestId: string; contentVersion: string; createdAt: string }>(
    path.join(dir, "run.json"),
  );
  if (!summary) return null;
  const concepts: StoredConcept[] = [];
  for (const key of ["a", "b", "c"] as const) {
    const metadata = readJson<ConceptMetadata>(path.join(dir, "concepts", key, "metadata.json"));
    const imageFile = path.join(dir, "concepts", key, `concept.${metadata?.format || "jpeg"}`);
    if (!metadata || !existsSync(imageFile)) continue;
    concepts.push({ key, metadata, imageFile });
  }
  if (concepts.length === 0) return null;
  return {
    generationId,
    generationRequestId: summary.generationRequestId,
    contentVersion: summary.contentVersion,
    createdAt: summary.createdAt,
    concepts,
  };
}

export function listRuns(root: string, slug: string): StoredRun[] {
  const runsDir = path.join(campaignDir(root, slug), "runs");
  if (!existsSync(runsDir)) return [];
  return readdirSync(runsDir)
    .map((generationId) => readRun(root, slug, generationId))
    .filter((run): run is StoredRun => Boolean(run))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveRun(input: {
  root: string;
  slug: string;
  generationId: string;
  generationRequestId: string;
  contentVersion: string;
  createdAt: string;
  brief: VisualBrief;
  artDirections?: ArtDirectionBrief[];
  concepts: Array<{ key: VisualDirectionKey; metadata: ConceptMetadata; bytes: Buffer; rawBytes?: Buffer }>;
}): StoredRun {
  const dir = path.join(campaignDir(input.root, input.slug), "runs", input.generationId);
  mkdirSync(path.join(dir, "concepts"), { recursive: true });
  mkdirSync(path.join(campaignDir(input.root, input.slug), "requests"), { recursive: true });
  writeFileSync(path.join(dir, "brief.json"), JSON.stringify(input.brief, null, 2));
  if (input.artDirections && input.artDirections.length > 0) {
    writeFileSync(path.join(dir, "art-direction.json"), JSON.stringify(input.artDirections, null, 2));
  }
  writeFileSync(
    path.join(dir, "run.json"),
    JSON.stringify(
      {
        generationId: input.generationId,
        generationRequestId: input.generationRequestId,
        generationReason: input.concepts[0]?.metadata.generationReason ?? "",
        contentVersion: input.contentVersion,
        createdAt: input.createdAt,
      },
      null,
      2,
    ),
  );
  const concepts: StoredConcept[] = [];
  for (const concept of input.concepts) {
    const conceptDir = path.join(dir, "concepts", concept.key);
    mkdirSync(conceptDir, { recursive: true });
    const imageFile = path.join(conceptDir, `concept.${concept.metadata.format}`);
    writeFileSync(imageFile, concept.bytes);
    if (concept.rawBytes && concept.rawBytes.length > 0) {
      writeFileSync(path.join(conceptDir, `raw.${concept.metadata.format}`), concept.rawBytes);
    }
    writeFileSync(path.join(conceptDir, "metadata.json"), JSON.stringify(concept.metadata, null, 2));
    concepts.push({ key: concept.key, metadata: concept.metadata, imageFile });
  }
  const stored: StoredRun = {
    generationId: input.generationId,
    generationRequestId: input.generationRequestId,
    contentVersion: input.contentVersion,
    createdAt: input.createdAt,
    concepts,
  };
  writeFileSync(
    path.join(campaignDir(input.root, input.slug), "requests", `${input.generationRequestId}.json`),
    JSON.stringify(stored, null, 2),
  );
  return stored;
}

export type DirectionSelection = {
  visualDirectionSelected: string;
  generationId: string;
  directionKey: VisualDirectionKey;
  selectedAt: string;
  humanPublicationApproved: false;
};

export function readSelection(root: string, slug: string): DirectionSelection | null {
  return readJson<DirectionSelection>(path.join(campaignDir(root, slug), "selection.json"));
}

export function saveSelection(root: string, slug: string, selection: DirectionSelection): void {
  const dir = campaignDir(root, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "selection.json"), JSON.stringify(selection, null, 2));
}

export type StoredVisualMaster = {
  directory: string;
  masterFile: string;
  rawFile: string | null;
  metadataFile: string;
};

export function visualMasterDirectory(root: string, slug: string): string {
  return path.join(campaignDir(root, slug), "visual-master");
}

export function visualMasterAttemptExists(root: string, slug: string): boolean {
  const directory = visualMasterDirectory(root, slug);
  return existsSync(path.join(directory, "master.png")) || existsSync(path.join(directory, "raw.png"));
}

export function readVisualMaster(root: string, slug: string): StoredVisualMaster | null {
  const directory = visualMasterDirectory(root, slug);
  const masterFile = path.join(directory, "master.png");
  const metadataFile = path.join(directory, "metadata.json");
  if (!existsSync(masterFile) || !existsSync(metadataFile)) return null;
  const rawFile = path.join(directory, "raw.png");
  return { directory, masterFile, rawFile: existsSync(rawFile) ? rawFile : null, metadataFile };
}

export function saveVisualMaster(input: {
  root: string;
  slug: string;
  brief: unknown;
  artDirection: unknown;
  prompt: string;
  rawBytes: Buffer;
  masterBytes: Buffer | null;
  metadata: unknown;
}): StoredVisualMaster {
  const directory = visualMasterDirectory(input.root, input.slug);
  if (existsSync(path.join(directory, "master.png")) || existsSync(path.join(directory, "raw.png"))) {
    throw new Error("BLOCKED_EXISTING_MASTER");
  }
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "brief.json"), JSON.stringify(input.brief, null, 2));
  writeFileSync(path.join(directory, "art-direction.json"), JSON.stringify(input.artDirection, null, 2));
  writeFileSync(path.join(directory, "prompt.txt"), input.prompt);
  writeFileSync(path.join(directory, "raw.png"), input.rawBytes);
  if (input.masterBytes) writeFileSync(path.join(directory, "master.png"), input.masterBytes);
  const metadataFile = path.join(directory, "metadata.json");
  writeFileSync(metadataFile, JSON.stringify(input.metadata, null, 2));
  return {
    directory,
    masterFile: path.join(directory, "master.png"),
    rawFile: path.join(directory, "raw.png"),
    metadataFile,
  };
}
