import {
  BOOTSTRAP_LIMIT_MS,
  DELETE_ATTEMPTS,
  PHASE_LINES,
  collectStopPids,
  deleteDelayMs,
  devServers,
  diagnose,
  formatDiagnosis,
  formatRunning,
  observeOutput,
  plan,
  readyLine,
  type Diagnosis,
  type HttpProbe,
  type Listener,
  type PhaseName,
  type Proc,
  type ServerRecord,
  type StatusFile,
} from "./core";

export type NextChild = {
  pid: number;
  onStdout: (callback: (chunk: string) => void) => void;
  onStderr: (callback: (chunk: string) => void) => void;
  requestStop: () => Promise<void>;
  exit: Promise<number>;
};

export type SessionDeps = {
  repoRoot: string;
  selfPid: number;
  nextArgs: string[];
  requestedPort: number;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  listProcs: () => Promise<Proc[]>;
  listListeners: () => Promise<Listener[]>;
  probeHttp: (port: number) => Promise<HttpProbe>;
  probeTrace: () => Promise<"absent" | "free" | "locked">;
  packageJsonExists: () => boolean;
  stopPids: (pids: number[]) => Promise<void>;
  deleteNext: () => Promise<boolean>;
  spawnNext: (args: string[]) => NextChild;
  log: (line: string) => void;
  forward: (chunk: string) => void;
  writeStatus: (status: StatusFile) => void;
  diag: (event: string, fields: Record<string, unknown>) => void;
  isAlive: (pid: number) => boolean;
  acquireLock: () => "acquired" | "busy";
  readLockOwner: () => number | null;
  releaseLock: () => void;
  readStatus: () => StatusFile | null;
  waitWhileReusing: (pid: number) => Promise<void>;
};

function phase(deps: SessionDeps, name: PhaseName) {
  deps.log(PHASE_LINES[name]);
}

async function snapshot(deps: SessionDeps) {
  const procs = await deps.listProcs();
  const listeners = await deps.listListeners();
  const servers = devServers(procs, deps.repoRoot, listeners);
  const http = new Map<number, HttpProbe>();
  for (const server of servers) {
    http.set(server.pid, server.port === null ? "down" : await deps.probeHttp(server.port));
  }
  const trace = await deps.probeTrace();
  return {
    procs,
    servers,
    http,
    traceLocked: trace === "locked",
    packageJsonExists: deps.packageJsonExists(),
  };
}

async function holdLock(deps: SessionDeps): Promise<boolean> {
  if (deps.acquireLock() === "acquired") return true;
  const owner = deps.readLockOwner();
  if (owner && owner !== deps.selfPid && deps.isAlive(owner)) {
    const deadline = deps.now() + 90_000;
    while (deps.now() < deadline) {
      const status = deps.readStatus();
      if (status?.phase === "ready") return false;
      await deps.sleep(200);
    }
    return false;
  }
  deps.releaseLock();
  return deps.acquireLock() === "acquired";
}

async function releaseDirectory(deps: SessionDeps): Promise<boolean> {
  phase(deps, "cleaning");
  phase(deps, "waiting_lock");
  for (let round = 0; round < 3; round += 1) {
    if ((await deleteWithRetries(deps)) && (await deps.probeTrace()) !== "locked") return true;
    const pids = collectStopPids(await deps.listProcs(), deps.repoRoot, deps.selfPid);
    if (pids.length === 0) continue;
    deps.diag("lock_detection", { pids, repository: deps.repoRoot });
    await deps.stopPids(pids);
    await waitUntil(deps, BOOTSTRAP_LIMIT_MS / 2, async () => (await deps.probeTrace()) !== "locked");
  }
  return false;
}

async function waitUntil(deps: SessionDeps, timeoutMs: number, predicate: () => Promise<boolean>): Promise<boolean> {
  const start = deps.now();
  while (deps.now() - start < timeoutMs) {
    if (await predicate()) return true;
    await deps.sleep(200);
  }
  return predicate();
}

async function deleteWithRetries(deps: SessionDeps): Promise<boolean> {
  for (let attempt = 0; attempt < DELETE_ATTEMPTS; attempt += 1) {
    if (await deps.deleteNext()) return true;
    await deps.sleep(deleteDelayMs(attempt));
  }
  return false;
}

async function waitForBoot(deps: SessionDeps, server: ServerRecord): Promise<boolean> {
  if (server.port === null) return false;
  return waitUntil(deps, BOOTSTRAP_LIMIT_MS, async () => {
    const http = await deps.probeHttp(server.port as number);
    if (http === "ready") return true;
    return http === "hung" && deps.packageJsonExists();
  });
}

function statusBase(deps: SessionDeps, startedAt: number): Pick<StatusFile, "repository" | "startupDurationMs" | "bootstrapDurationMs" | "readyAt" | "lock"> {
  return {
    repository: deps.repoRoot,
    startupDurationMs: deps.now() - startedAt,
    bootstrapDurationMs: null,
    readyAt: null,
    lock: false,
  };
}

function writeReady(deps: SessionDeps, startedAt: number, bootstrapStartedAt: number | null, pid: number | null, port: number | null) {
  const readyAt = new Date().toISOString();
  deps.writeStatus({
    phase: "ready",
    ...statusBase(deps, startedAt),
    pid,
    port,
    lock: false,
    bootstrapDurationMs: bootstrapStartedAt === null ? null : deps.now() - bootstrapStartedAt,
    readyAt,
    diagnosis: null,
  });
  deps.diag("ready", {
    repository: deps.repoRoot,
    pid,
    port,
    lock: false,
    startupDurationMs: deps.now() - startedAt,
    bootstrapDurationMs: bootstrapStartedAt === null ? null : deps.now() - bootstrapStartedAt,
    readyAt,
  });
  phase(deps, "ready");
  deps.log(readyLine(port));
}

async function adoptPeer(deps: SessionDeps, startedAt: number): Promise<number | null> {
  const status = deps.readStatus();
  if (status?.phase === "ready" && status.pid && deps.isAlive(status.pid)) {
    return reuse(deps, startedAt, {
      pid: status.pid,
      rootPid: status.pid,
      port: status.port,
      command: "",
    });
  }
  deps.log("startup failure: another Dev Server Manager holds the repository lock");
  return null;
}

async function reuse(deps: SessionDeps, startedAt: number, server: ServerRecord) {
  deps.log(formatRunning(deps.repoRoot, server));
  deps.log("Reusing the running server.");
  deps.diag("existing_server", {
    repository: deps.repoRoot,
    pid: server.pid,
    port: server.port,
    lock: await deps.probeTrace().then((state) => state === "locked"),
  });
  writeReady(deps, startedAt, null, server.pid, server.port);
  await deps.waitWhileReusing(server.pid);
  return 0;
}

async function watchChild(deps: SessionDeps, child: NextChild): Promise<"ready" | "timeout" | "exited"> {
  let buffer = "";
  let exited = false;
  child.onStdout((chunk) => {
    deps.forward(chunk);
    buffer = `${buffer}${chunk}`.slice(-16_000);
  });
  child.onStderr((chunk) => {
    deps.forward(chunk);
    buffer = `${buffer}${chunk}`.slice(-16_000);
  });
  void child.exit.then(() => {
    exited = true;
  });
  const origin = deps.now();
  let startingAt: number | null = null;
  while (true) {
    const observed = observeOutput(buffer);
    if (observed.sawStarting && startingAt === null) {
      startingAt = deps.now();
      phase(deps, "starting");
    }
    if (observed.sawReady) return "ready";
    if (exited) return "exited";
    const anchor = startingAt ?? origin;
    if (deps.now() - anchor >= BOOTSTRAP_LIMIT_MS) return "timeout";
    await deps.sleep(100);
  }
}

async function fail(deps: SessionDeps, startedAt: number, diagnosis: Diagnosis): Promise<number> {
  deps.writeStatus({
    phase: "bootstrap_failed",
    ...statusBase(deps, startedAt),
    pid: diagnosis.blockingPid,
    port: diagnosis.blockingPort,
    lock: true,
    diagnosis,
  });
  deps.diag("bootstrap_failed", {
    repository: deps.repoRoot,
    pid: diagnosis.blockingPid,
    port: diagnosis.blockingPort,
    lock: true,
    blockingFile: diagnosis.blockingFile,
    startupDurationMs: deps.now() - startedAt,
  });
  deps.log(formatDiagnosis(diagnosis));
  return 1;
}

export async function runSession(deps: SessionDeps): Promise<number> {
  const startedAt = deps.now();
  let locked = false;
  try {
    phase(deps, "checking");
    let current = await snapshot(deps);
    let decision = plan({
      servers: current.servers,
      http: current.http,
      traceLocked: current.traceLocked,
      packageJsonExists: current.packageJsonExists,
    });
    if (decision.action === "wait_boot") {
      const booted = await waitForBoot(deps, decision.server);
      if (booted) decision = { action: "reuse", server: decision.server };
      else decision = { action: "heal", reason: "bootstrap-hang", servers: [decision.server] };
    }
    if (decision.action === "reuse") {
      return reuse(deps, startedAt, decision.server);
    }
    if (decision.action === "heal") {
      if (decision.servers.length === 0) {
        deps.log(
          ["Another Next.js development server is already running.", "Repository:", deps.repoRoot, "PID", "unknown", "Port", "unknown"].join("\n"),
        );
      }
      for (const server of decision.servers) deps.log(formatRunning(deps.repoRoot, server));
      locked = await holdLock(deps);
      if (!locked) {
        const adopted = await adoptPeer(deps, startedAt);
        if (adopted !== null) return adopted;
        return 1;
      }
      const cleared = await releaseDirectory(deps);
      if (!cleared) {
        current = await snapshot(deps);
        return fail(deps, startedAt, diagnose({ repoRoot: deps.repoRoot, traceLocked: current.traceLocked, servers: current.servers }));
      }
    } else {
      locked = await holdLock(deps);
      if (!locked) {
        const adopted = await adoptPeer(deps, startedAt);
        if (adopted !== null) return adopted;
        return 1;
      }
    }

    let healedWatchdog = false;
    while (true) {
      phase(deps, "starting_next");
      const bootstrapStartedAt = deps.now();
      const child = deps.spawnNext(deps.nextArgs);
      const watched = await watchChild(deps, child);
      if (watched === "ready") {
        writeReady(deps, startedAt, bootstrapStartedAt, child.pid, deps.requestedPort);
        const code = await child.exit;
        return code;
      }
      const after = await snapshot(deps);
      const diagnosis = diagnose({
        repoRoot: deps.repoRoot,
        traceLocked: after.traceLocked,
        servers: after.servers.length > 0 ? after.servers : [{ pid: child.pid, rootPid: child.pid, port: deps.requestedPort, command: "" }],
      });
      deps.log(formatDiagnosis(diagnosis));
      await child.requestStop();
      if (healedWatchdog) return fail(deps, startedAt, diagnosis);
      healedWatchdog = true;
      const cleared = await releaseDirectory(deps);
      if (!cleared) return fail(deps, startedAt, diagnosis);
    }
  } finally {
    if (locked) deps.releaseLock();
  }
}
