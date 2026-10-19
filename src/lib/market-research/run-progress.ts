export type MarketRunProgress = {
  status: "running" | "done" | "error";
  query: string;
  provider: string;
  resultCount: number;
  queryDurationMs: number;
  completed: number;
  planned: number;
  startedAt: number;
  message: string;
};

const runs: Map<number, MarketRunProgress> =
  ((globalThis as { __aiaMarketRuns?: Map<number, MarketRunProgress> }).__aiaMarketRuns ||= new Map());

export function beginMarketRun(campaignId: number, planned: number): void {
  runs.set(campaignId, {
    status: "running",
    query: "",
    provider: "",
    resultCount: 0,
    queryDurationMs: 0,
    completed: 0,
    planned,
    startedAt: Date.now(),
    message: "",
  });
}

export function noteMarketQuery(
  campaignId: number,
  update: Pick<MarketRunProgress, "query" | "provider" | "resultCount" | "queryDurationMs">,
): void {
  const current = runs.get(campaignId);
  if (!current || current.status !== "running") return;
  runs.set(campaignId, {
    ...current,
    ...update,
    completed: current.completed + 1,
  });
}

export function noteMarketDetail(campaignId: number, query: string): void {
  const current = runs.get(campaignId);
  if (!current || current.status !== "running") return;
  runs.set(campaignId, { ...current, query });
}

export function finishMarketRun(campaignId: number, status: "done" | "error", message = ""): void {
  const current = runs.get(campaignId);
  if (!current) return;
  runs.set(campaignId, { ...current, status, message });
}

export function readMarketRun(campaignId: number): (MarketRunProgress & { elapsedMs: number }) | null {
  const current = runs.get(campaignId);
  if (!current) return null;
  return { ...current, elapsedMs: Math.max(0, Date.now() - current.startedAt) };
}

export function marketRunIsActive(campaignId: number): boolean {
  return runs.get(campaignId)?.status === "running";
}
