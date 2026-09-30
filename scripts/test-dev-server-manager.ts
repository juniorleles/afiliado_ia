// npx tsx scripts/test-dev-server-manager.ts
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  collectStopPids,
  devServers,
  formatRunning,
  formatStartupFailure,
  nextDevArgs,
  observeOutput,
  plan,
  readyLine,
  startupFailureFromStatus,
  type HttpProbe,
  type Listener,
  type Proc,
  type ServerRecord,
  type StatusFile,
} from "./dev-server/core";
import { probeTrace } from "./dev-server/os";
import { runSession, type NextChild, type SessionDeps } from "./dev-server/session";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FALHOU: ${message}`);
  console.log(`OK: ${message}`);
}

const repo = "C:\\workspace\\afiliado_ia";

function proc(pid: number, ppid: number, command: string): Proc {
  return { pid, ppid, command };
}

function child(pid: number, script: "ready" | "hang"): NextChild {
  let resolveExit: (code: number) => void = () => undefined;
  const exit = new Promise<number>((resolve) => {
    resolveExit = resolve;
  });
  return {
    pid,
    onStdout: (callback) => {
      if (script === "ready") callback(" ✓ Starting...\n ✓ Ready in 1.1s\n");
      else callback(" ✓ Starting...\n");
    },
    onStderr: () => undefined,
    requestStop: async () => resolveExit(0),
    exit: script === "ready" ? Promise.resolve(0) : exit,
  };
}

function harness(procs: Proc[], httpFor: (port: number) => HttpProbe, options?: { trace?: "absent" | "free" | "locked"; packageJson?: boolean; hangs?: number }) {
  const logs: string[] = [];
  const stopped: number[][] = [];
  let spawned = 0;
  let deletes = 0;
  let t = 1_000;
  let locked = options?.trace === "locked";
  const hangs = options?.hangs ?? 0;
  const deps: SessionDeps = {
    repoRoot: repo,
    selfPid: 999,
    nextArgs: ["dev", "--turbopack"],
    requestedPort: 3000,
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
    listProcs: async () => procs,
    listListeners: async () => [] as Listener[],
    probeHttp: async (port) => httpFor(port),
    probeTrace: async () => (locked ? "locked" : "absent"),
    packageJsonExists: () => options?.packageJson ?? false,
    stopPids: async (pids) => {
      stopped.push(pids);
      if (pids.length > 0) locked = false;
    },
    deleteNext: async () => {
      deletes += 1;
      return !locked;
    },
    spawnNext: () => {
      spawned += 1;
      return child(4000 + spawned, spawned <= hangs ? "hang" : "ready");
    },
    log: (line) => logs.push(line),
    forward: (chunk) => logs.push(chunk),
    writeStatus: () => undefined,
    diag: () => undefined,
    isAlive: () => true,
    acquireLock: () => "acquired",
    readLockOwner: () => null,
    releaseLock: () => undefined,
    readStatus: () => null,
    waitWhileReusing: async () => undefined,
  };
  return { deps, logs, stopped, deletes: () => deletes, spawned: () => spawned };
}

function serverCommand(pid: number, port: number): Proc[] {
  const bin = proc(pid, 1, `node ${repo}\\node_modules\\next\\dist\\bin\\next dev --turbopack -p ${port}`);
  const server = proc(pid + 1, pid, `node ${repo}\\node_modules\\next\\dist\\server\\lib\\start-server.js`);
  return [bin, server];
}

async function main() {
  const unrelated = proc(50, 1, `node ${repo}\\scripts\\test-evidence-manager.ts`);
  const production = [
    proc(70, 1, `node ${repo}\\node_modules\\next\\dist\\bin\\next start`),
    proc(71, 70, `node ${repo}\\node_modules\\next\\dist\\server\\lib\\start-server.js`),
  ];
  const devA = serverCommand(10, 3000);
  const devB = serverCommand(20, 3015);
  const postcss = proc(12, 11, `node ${repo}\\.next\\postcss.js 1`);
  const procs = [unrelated, ...production, ...devA, ...devB, postcss];
  const stop = collectStopPids(procs, repo, 999);
  assert(!stop.includes(50), "unrelated node process is kept");
  assert(!stop.includes(70) && !stop.includes(71), "next start is kept");
  assert(stop.includes(10) && stop.includes(11) && stop.includes(20) && stop.includes(21) && stop.includes(12), "only this repository's next dev processes are selected");
  assert(stop.indexOf(10) < stop.indexOf(11), "the next dev parent is stopped before its server child");

  const listeners: Listener[] = [
    { pid: 11, port: 3000 },
    { pid: 21, port: 3015 },
  ];
  const servers = devServers(procs, repo, listeners);
  assert(servers.length === 2, "two dev servers are detected for one repository");
  assert(servers.some((server) => server.pid === 11 && server.port === 3000), "listening port is taken from the dev server");

  const reusePlan = plan({
    servers: [servers[0] as ServerRecord],
    http: new Map<number, HttpProbe>([[11, "ready"]]),
    traceLocked: true,
    packageJsonExists: true,
  });
  assert(reusePlan.action === "reuse", "a responding dev server is reused");

  const hungPlan = plan({
    servers: [servers[0] as ServerRecord],
    http: new Map<number, HttpProbe>([[11, "hung"]]),
    traceLocked: true,
    packageJsonExists: false,
  });
  assert(hungPlan.action === "heal" && hungPlan.reason === "bootstrap-hang", "a server stuck before Ready is a bootstrap conflict");

  const multi = plan({
    servers,
    http: new Map<number, HttpProbe>([
      [11, "ready"],
      [21, "ready"],
    ]),
    traceLocked: true,
    packageJsonExists: true,
  });
  assert(multi.action === "heal" && multi.reason === "multiple", "two dev servers for one repository are a conflict");

  const products = ["VisiFlora", "Neuro Serge", "Prime Biome", "Joint Genesis", "Prodentim", "Audifort", "Unknown Product"];
  const decisions = products.map(() =>
    plan({
      servers,
      http: new Map<number, HttpProbe>([
        [11, "ready"],
        [21, "ready"],
      ]),
      traceLocked: true,
      packageJsonExists: true,
    }),
  );
  assert(decisions.every((decision) => JSON.stringify(decision) === JSON.stringify(decisions[0])), "server decisions do not depend on a product");

  const managerFiles = [
    "scripts/dev-server/core.ts",
    "scripts/dev-server/session.ts",
    "scripts/dev-server/os.ts",
    "scripts/dev-server-manager.ts",
  ];
  const source = managerFiles.map((file) => fs.readFileSync(path.join(process.cwd(), file), "utf8")).join("\n");
  for (const name of products) assert(!source.includes(name), `dev server manager has no ${name} branch`);
  for (const forbidden of ["@/lib/", "presell-os.db", "getDb", "better-sqlite3", "product-facts", "evidence-manager"]) {
    assert(!source.includes(forbidden), `dev server manager does not reference ${forbidden}`);
  }

  assert(nextDevArgs([]).join(" ") === "dev --turbopack", "the manager preserves the turbopack dev command");
  assert(formatRunning(repo, servers[0] as ServerRecord).includes("Another Next.js development server is already running."), "conflict message names the running server");
  assert(formatRunning(repo, servers[0] as ServerRecord).includes("PID\n11"), "conflict message includes the pid");
  assert(formatRunning(repo, servers[0] as ServerRecord).includes("Port\n3000"), "conflict message includes the port");

  const reuse = harness(devA, () => "ready", { trace: "locked", packageJson: true });
  const reuseCode = await runSession(reuse.deps);
  assert(reuseCode === 0, "reusing a ready server exits cleanly");
  assert(reuse.spawned() === 0, "a second next dev is not started");
  assert(reuse.deletes() === 0, "a live server keeps its .next directory");
  assert(reuse.stopped.length === 0, "a live server is not stopped");
  assert(reuse.logs.some((line) => line.includes("Reusing the running server.")), "additional agents are told to reuse the server");

  const conflict = harness(procs, (port) => (port === 3000 ? "hung" : "ready"), { trace: "locked" });
  const conflictCode = await runSession(conflict.deps);
  assert(conflictCode === 0, "a conflict is healed and the new server reaches Ready");
  assert(conflict.stopped.length > 0 && conflict.stopped[0].includes(10) && !conflict.stopped[0].includes(50), "self-heal stops the conflicting next dev only");
  assert(conflict.deletes() > 0, "self-heal deletes .next after the lock is released");
  assert(conflict.logs.includes("Cleaning"), "cleanup status is shown");
  assert(conflict.logs.includes("Waiting lock release"), "lock wait status is shown");
  assert(conflict.logs.includes("Starting Next"), "next startup status is shown");
  assert(conflict.logs.includes("Ready"), "ready status is shown");

  const watchdog = harness(devA, () => "hung", { trace: "locked", hangs: 2 });
  const watchdogCode = await runSession(watchdog.deps);
  assert(watchdogCode === 1, "bootstrap failure aborts after one self-heal attempt");
  const report = watchdog.logs.join("\n");
  assert(report.includes("BOOTSTRAP_DIAGNOSIS"), "watchdog runs bootstrap diagnosis");
  assert(report.includes("Blocking file:"), "watchdog reports the blocking file");
  assert(report.includes("Blocking PID:"), "watchdog reports the blocking pid");
  assert(report.includes("Blocking port:"), "watchdog reports the blocking port");
  assert(report.includes("Current stack:"), "watchdog reports the current stack");
  assert(report.includes("Suggested fix:"), "watchdog reports a suggested fix");
  assert(report.includes("startup failure"), "bootstrap failure is reported for Playwright");
  assert(watchdog.spawned() === 2, "watchdog retries startup once");

  const healed = harness([], () => "down", { hangs: 1 });
  const healedCode = await runSession(healed.deps);
  assert(healedCode === 0 && healed.spawned() === 2, "a hung startup is diagnosed, cleaned, and reaches Ready on the retry");

  const startingOnly = observeOutput(" ✓ Starting...\n");
  assert(startingOnly.sawStarting && !startingOnly.sawReady, "Starting... is not treated as Ready");
  const readyOutput = observeOutput(" ✓ Ready in 5.4s\n");
  assert(readyOutput.sawReady, "Ready in is the bootstrap completion line");
  assert(readyLine(3000) === "DevServer: Ready port=3000", "Playwright waits for the Ready token");
  const failedStatus: StatusFile = {
    phase: "bootstrap_failed",
    repository: repo,
    pid: 11,
    port: 3000,
    lock: true,
    startupDurationMs: 20_000,
    bootstrapDurationMs: 20_000,
    readyAt: null,
    diagnosis: {
      blockingFile: `${repo}\\.next\\trace`,
      blockingPid: 11,
      blockingPort: 3000,
      stack: ["recursive-delete.js unlink .next/trace"],
      suggestedFix: "Start one next dev through the Dev Server Manager.",
    },
  };
  const failure = startupFailureFromStatus(failedStatus);
  assert(failure !== null && failure.includes("startup failure") && failure.includes("Blocking file:"), "Playwright aborts when bootstrap fails");
  assert(startupFailureFromStatus({ ...failedStatus, phase: "ready", diagnosis: null }) === null, "Playwright continues once Ready is recorded");
  assert(formatStartupFailure(failedStatus.diagnosis!).includes("Current stack:"), "startup failure includes the stack");

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "dev-server-lock-"));
  fs.mkdirSync(path.join(temp, ".next"));
  const traceFile = path.join(temp, ".next", "trace");
  const holder = spawn(process.execPath, ["-e", "const fs=require('fs'); fs.openSync(process.argv[1], 'a'); setInterval(() => {}, 1000);", traceFile], {
    stdio: "ignore",
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert((await probeTrace(temp)) === "locked", "an open .next/trace is detected as locked");
  if (holder.pid) {
    if (process.platform === "win32") {
      const { execFile } = await import("node:child_process");
      await new Promise<void>((resolve) => execFile("taskkill", ["/PID", String(holder.pid), "/T", "/F"], () => resolve()));
    } else {
      holder.kill("SIGKILL");
    }
  }
  const released = await new Promise<boolean>((resolve) => {
    const started = Date.now();
    const tick = async () => {
      const state = await probeTrace(temp);
      if (state !== "locked") resolve(true);
      else if (Date.now() - started > 5_000) resolve(false);
      else setTimeout(tick, 100);
    };
    void tick();
  });
  assert(released, "stopping the process that holds .next/trace releases the lock");
  fs.rmSync(temp, { recursive: true, force: true });

  console.log("DEV_SERVER_MANAGER_TESTS=PASS");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
