export type ImportStageProgress = {
  importId: string;
  stage: string;
  cancelled: boolean;
};

type ImportJob = {
  controller: AbortController;
  progress: ImportStageProgress;
};

const jobs: Map<string, ImportJob> =
  ((globalThis as { __aiaImportJobs?: Map<string, ImportJob> }).__aiaImportJobs ||= new Map());

export function createImportJob(importId: string): ImportJob {
  const existing = jobs.get(importId);
  if (existing) return existing;
  const controller = new AbortController();
  const job: ImportJob = {
    controller,
    progress: { importId, stage: "Checking primary source...", cancelled: false },
  };
  jobs.set(importId, job);
  return job;
}

export function getImportJob(importId?: string): ImportJob | undefined {
  if (!importId) return undefined;
  return jobs.get(importId);
}

export function setImportStage(importId: string | undefined, stage: string): void {
  if (!importId) return;
  const job = createImportJob(importId);
  job.progress.stage = stage;
}

export function getImportProgress(importId: string): ImportStageProgress | null {
  return jobs.get(importId)?.progress || null;
}

export function cancelImportJob(importId: string): boolean {
  const job = jobs.get(importId);
  if (!job) return false;
  job.progress.cancelled = true;
  job.progress.stage = "Cancelling…";
  job.controller.abort();
  return true;
}

export function importJobSignal(importId?: string): AbortSignal | undefined {
  return importId ? createImportJob(importId).controller.signal : undefined;
}

export function clearImportJob(importId?: string): void {
  if (!importId) return;
  jobs.delete(importId);
}
