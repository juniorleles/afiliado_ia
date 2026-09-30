import path from "node:path";

export const BOOTSTRAP_LIMIT_MS = 20_000;
export const READY_TOKEN = "DevServer: Ready";
export const DEFAULT_PORT = 3000;

export const PHASE_LINES = {
  checking: "Checking existing server",
  cleaning: "Cleaning",
  waiting_lock: "Waiting lock release",
  starting_next: "Starting Next",
  starting: "Starting",
  ready: "Ready",
} as const;

export type PhaseName = keyof typeof PHASE_LINES;

export type Proc = {
  pid: number;
  ppid: number;
  command: string;
};

export type Listener = {
  pid: number;
  port: number;
};

export type ServerRecord = {
  pid: number;
  rootPid: number;
  port: number | null;
  command: string;
};

export type HttpProbe = "ready" | "hung" | "down";

export type Plan =
  | { action: "start" }
  | { action: "reuse"; server: ServerRecord }
  | { action: "wait_boot"; server: ServerRecord }
  | { action: "heal"; reason: string; servers: ServerRecord[] };

export type Diagnosis = {
  blockingFile: string;
  blockingPid: number | null;
  blockingPort: number | null;
  stack: string[];
  suggestedFix: string;
};

export type StatusFile = {
  phase: "ready" | "bootstrap_failed" | "starting";
  repository: string;
  pid: number | null;
  port: number | null;
  lock: boolean;
  startupDurationMs: number | null;
  bootstrapDurationMs: number | null;
  readyAt: string | null;
  diagnosis: Diagnosis | null;
};

const BLOCKING_STACK = [
  "start-server.js await getRequestHandlers (Ready is logged only after this returns)",
  "router-server.js await setupDevBundler",
  "setup-dev-bundler.js await hotReloader.start",
  "hot-reloader-webpack.js await this.clean",
  "recursive-delete.js unlink .next/trace",
  "recursive-delete.js EPERM retry calls unlinkPath(p, isDir, t++) so the attempt count never advances",
];

export function normalizePath(value: string): string {
  return value.replace(/\//g, "\\").toLowerCase();
}

export function commandHasRepo(command: string, repoRoot: string): boolean {
  return normalizePath(command).includes(normalizePath(repoRoot));
}

export function isStartServer(command: string): boolean {
  return normalizePath(command).includes("\\next\\dist\\server\\lib\\start-server.js");
}

export function isNextBin(command: string): boolean {
  if (/(?:^|\s)next\s+dev(?:\s|$)/i.test(command)) return true;
  const normalized = normalizePath(command);
  return normalized.includes("\\next\\dist\\bin\\next") && /(?:^|\s)dev(?:\s|$)/.test(command);
}

export function isProductionStart(command: string): boolean {
  if (/(?:^|\s)next\s+start(?:\s|$)/i.test(command)) return true;
  return normalizePath(command).includes("\\next\\dist\\bin\\next") && /(?:^|\s)start(?:\s|$)/.test(command);
}

export function isNextPostCss(command: string): boolean {
  return normalizePath(command).includes("\\.next\\postcss.js");
}

export function isNextDevCommand(command: string): boolean {
  return isStartServer(command) || isNextBin(command) || isNextPostCss(command);
}

export function isRepoNextProcess(proc: Proc, procs: Proc[], repoRoot: string): boolean {
  if (isProductionStart(proc.command)) return false;
  const parent = procs.find((candidate) => candidate.pid === proc.ppid);
  if (parent && isProductionStart(parent.command)) return false;
  if (!isNextDevCommand(proc.command)) return false;
  if (commandHasRepo(proc.command, repoRoot)) return true;
  const child = procs.find(
    (candidate) =>
      candidate.ppid === proc.pid && isStartServer(candidate.command) && commandHasRepo(candidate.command, repoRoot),
  );
  return Boolean(child && /next/i.test(proc.command) && !isProductionStart(proc.command));
}

export function parsePort(command: string): number | null {
  const match = command.match(/(?:--port|-p)(?:=|\s+)(\d+)/);
  if (!match) return null;
  const port = Number(match[1]);
  return Number.isFinite(port) ? port : null;
}

export function nextDevArgs(userArgs: string[]): string[] {
  const hasBundler = userArgs.some((arg) => arg === "--turbopack" || arg === "--turbo" || arg === "--webpack");
  return hasBundler ? ["dev", ...userArgs] : ["dev", "--turbopack", ...userArgs];
}

export function requestedPort(userArgs: string[], fallback = DEFAULT_PORT): number {
  for (let index = 0; index < userArgs.length; index += 1) {
    const arg = userArgs[index];
    if (arg.startsWith("--port=")) {
      const port = Number(arg.slice("--port=".length));
      if (Number.isFinite(port)) return port;
    }
    if ((arg === "--port" || arg === "-p") && userArgs[index + 1]) {
      const port = Number(userArgs[index + 1]);
      if (Number.isFinite(port)) return port;
    }
  }
  return fallback;
}

export function devServers(procs: Proc[], repoRoot: string, listeners: Listener[]): ServerRecord[] {
  const ours = procs.filter((proc) => isRepoNextProcess(proc, procs, repoRoot));
  const startServers = ours.filter((proc) => isStartServer(proc.command));
  const bins = ours.filter((proc) => isNextBin(proc.command));
  const records: ServerRecord[] = [];
  for (const server of startServers) {
    const parent = bins.find((bin) => bin.pid === server.ppid);
    const listened = listeners.find((listener) => listener.pid === server.pid)?.port ?? null;
    records.push({
      pid: server.pid,
      rootPid: parent ? parent.pid : server.pid,
      port: listened ?? parsePort(parent?.command ?? server.command),
      command: server.command,
    });
  }
  for (const bin of bins) {
    if (startServers.some((server) => server.ppid === bin.pid)) continue;
    const listened = listeners.find((listener) => listener.pid === bin.pid)?.port ?? null;
    records.push({
      pid: bin.pid,
      rootPid: bin.pid,
      port: listened ?? parsePort(bin.command),
      command: bin.command,
    });
  }
  return records;
}

export function stopRank(command: string): number {
  if (isNextBin(command)) return 0;
  if (isStartServer(command)) return 1;
  if (isNextPostCss(command)) return 2;
  return 3;
}

export function collectStopPids(procs: Proc[], repoRoot: string, selfPid: number): number[] {
  return procs
    .filter((proc) => proc.pid !== selfPid && isRepoNextProcess(proc, procs, repoRoot))
    .sort((left, right) => stopRank(left.command) - stopRank(right.command) || left.pid - right.pid)
    .map((proc) => proc.pid);
}

export function plan(input: {
  servers: ServerRecord[];
  http: ReadonlyMap<number, HttpProbe>;
  traceLocked: boolean;
  packageJsonExists: boolean;
}): Plan {
  if (input.servers.length > 1) {
    return { action: "heal", reason: "multiple", servers: input.servers };
  }
  if (input.servers.length === 1) {
    const server = input.servers[0];
    const http = input.http.get(server.pid) ?? "down";
    if (http === "ready") return { action: "reuse", server };
    if (http === "hung" && input.packageJsonExists) return { action: "reuse", server };
    if (http === "hung") return { action: "heal", reason: "bootstrap-hang", servers: [server] };
    return { action: "wait_boot", server };
  }
  if (input.traceLocked) return { action: "heal", reason: "trace-locked", servers: [] };
  return { action: "start" };
}

export function formatRunning(repoRoot: string, server: ServerRecord): string {
  return [
    "Another Next.js development server is already running.",
    "Repository:",
    repoRoot,
    "PID",
    String(server.pid),
    "Port",
    server.port === null ? "unknown" : String(server.port),
  ].join("\n");
}

export function observeOutput(buffer: string): { sawStarting: boolean; sawReady: boolean } {
  const plain = buffer.replace(/\u001b\[[0-9;]*m/g, "");
  return {
    sawStarting: /Starting\.\.\./.test(plain),
    sawReady: /Ready in /.test(plain),
  };
}

export function tracePath(repoRoot: string): string {
  return path.join(repoRoot, ".next", "trace");
}

export function diagnose(input: {
  repoRoot: string;
  traceLocked: boolean;
  servers: ServerRecord[];
}): Diagnosis {
  const blocker = input.servers[0] ?? null;
  const file = input.traceLocked ? tracePath(input.repoRoot) : path.join(input.repoRoot, ".next");
  const pid = blocker?.pid ?? null;
  return {
    blockingFile: file,
    blockingPid: pid,
    blockingPort: blocker?.port ?? null,
    stack: input.traceLocked
      ? BLOCKING_STACK
      : ["startup remained at Starting...", "Ready was not printed within 20 seconds"],
    suggestedFix: pid
      ? `Stop the Next.js dev server PID ${pid} for this repository, confirm .next/trace is released, delete .next, and start one next dev through the Dev Server Manager.`
      : "Confirm no next dev process is holding .next/trace, delete .next, and start one next dev through the Dev Server Manager.",
  };
}

export function formatStartupFailure(diagnosis: Diagnosis): string {
  return [
    "startup failure",
    `Blocking file: ${diagnosis.blockingFile}`,
    `Blocking PID: ${diagnosis.blockingPid ?? "unknown"}`,
    `Blocking port: ${diagnosis.blockingPort ?? "unknown"}`,
    "Current stack:",
    ...diagnosis.stack.map((line) => `  ${line}`),
    `Suggested fix: ${diagnosis.suggestedFix}`,
  ].join("\n");
}

export function formatDiagnosis(diagnosis: Diagnosis): string {
  return ["BOOTSTRAP_DIAGNOSIS", formatStartupFailure(diagnosis)].join("\n");
}

export function readyLine(port: number | null): string {
  return `${READY_TOKEN} port=${port ?? "unknown"}`;
}

export function startupFailureFromStatus(status: StatusFile | null): string | null {
  if (!status) return "startup failure: Dev Server Manager did not record Ready";
  if (status.phase === "ready") return null;
  if (status.diagnosis) return formatStartupFailure(status.diagnosis);
  return "startup failure: bootstrap did not reach Ready";
}

export function deleteDelayMs(attempt: number): number {
  return Math.min(100 * 2 ** attempt, 1_600);
}

export const DELETE_ATTEMPTS = 5;
