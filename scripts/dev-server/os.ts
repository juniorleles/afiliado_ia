import { execFile, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { tracePath, type HttpProbe, type Listener, type Proc, type StatusFile } from "./core";
import type { NextChild, SessionDeps } from "./session";

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof (error as { code: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return "";
}

function execText(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
      if (error && !stdout) reject(error);
      else resolve(stdout ?? "");
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function listProcesses(): Promise<Proc[]> {
  if (process.platform === "win32") {
    const stdout = await execText("powershell.exe", [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress -Depth 3",
    ]);
    const trimmed = stdout.trim();
    if (!trimmed || trimmed === "null") return [];
    const parsed = JSON.parse(trimmed) as
      | { ProcessId?: number; ParentProcessId?: number; CommandLine?: string | null }
      | Array<{ ProcessId?: number; ParentProcessId?: number; CommandLine?: string | null }>;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows
      .filter((row) => typeof row.ProcessId === "number" && typeof row.CommandLine === "string" && row.CommandLine.length > 0)
      .map((row) => ({
        pid: row.ProcessId as number,
        ppid: typeof row.ParentProcessId === "number" ? row.ParentProcessId : 0,
        command: row.CommandLine as string,
      }));
  }
  const stdout = await execText("ps", ["-eo", "pid=,ppid=,args="]);
  return stdout
    .split(/\r?\n/)
    .map((line) => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+([\s\S]+)$/);
      if (!match) return null;
      return { pid: Number(match[1]), ppid: Number(match[2]), command: match[3] };
    })
    .filter((row): row is Proc => row !== null);
}

export async function listListeners(): Promise<Listener[]> {
  const stdout = await execText("netstat", ["-ano", "-p", "TCP"]);
  const listeners: Listener[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5 || parts[3] !== "LISTENING") continue;
    const port = Number(parts[1]?.split(":").pop());
    const pid = Number(parts[4]);
    if (Number.isFinite(port) && Number.isFinite(pid)) listeners.push({ pid, port });
  }
  return listeners;
}

export function probeHttp(port: number, timeoutMs = 3_000): Promise<HttpProbe> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: HttpProbe) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const request = http.get(`http://127.0.0.1:${port}/`, (response) => {
      response.resume();
      finish("ready");
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy();
      finish("hung");
    });
    request.on("error", (error: NodeJS.ErrnoException) => {
      finish(error.code === "ECONNREFUSED" ? "down" : "hung");
    });
  });
}

async function probeWindowsExclusive(target: string): Promise<"free" | "locked"> {
  const literal = target.replace(/'/g, "''");
  const stdout = await execText("powershell.exe", [
    "-NoProfile",
    "-Command",
    `try { $stream = [System.IO.File]::Open('${literal}', [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None); $stream.Dispose(); Write-Output 'free' } catch [System.IO.IOException] { Write-Output 'locked' } catch [System.UnauthorizedAccessException] { Write-Output 'locked' }`,
  ]);
  return stdout.includes("locked") ? "locked" : "free";
}

export async function probeTrace(repoRoot: string): Promise<"absent" | "free" | "locked"> {
  const target = tracePath(repoRoot);
  try {
    await fs.promises.access(target);
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENOENT") return "absent";
    if (code === "EPERM" || code === "EACCES" || code === "EBUSY") return "locked";
    throw error;
  }
  if (process.platform === "win32") return probeWindowsExclusive(target);
  let handle: fs.promises.FileHandle | null = null;
  try {
    handle = await fs.promises.open(target, "r+");
    return "free";
  } catch (error) {
    const code = errorCode(error);
    if (code === "EPERM" || code === "EACCES" || code === "EBUSY") return "locked";
    throw error;
  } finally {
    await handle?.close();
  }
}

export async function stopPids(pids: number[]): Promise<void> {
  for (const pid of pids) {
    if (pid === process.pid || pid <= 0) continue;
    try {
      process.kill(pid, "SIGINT");
    } catch {
      // The process can already be gone, or Windows can refuse SIGINT for a process we did not spawn.
    }
    const started = Date.now();
    while (Date.now() - started < 3_000) {
      if (!isAlive(pid)) break;
      await sleep(200);
    }
    if (!isAlive(pid)) continue;
    if (process.platform === "win32") {
      await execText("taskkill", ["/PID", String(pid), "/T"]).catch(() => "");
      await sleep(400);
      if (isAlive(pid)) await execText("taskkill", ["/PID", String(pid), "/T", "/F"]).catch(() => "");
    } else {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Already exited.
      }
    }
  }
}

async function deleteNextDir(repoRoot: string): Promise<boolean> {
  try {
    await fs.promises.rm(path.join(repoRoot, ".next"), { recursive: true, force: true, maxRetries: 0 });
    return true;
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENOENT") return true;
    if (code === "EPERM" || code === "EBUSY" || code === "ENOTEMPTY" || code === "EACCES") return false;
    throw error;
  }
}

export function createSessionDeps(repoRoot: string, userArgs: string[]): SessionDeps & { shutdown: () => Promise<void> } {
  const stateDir = path.join(repoRoot, ".dev-server");
  const lockPath = path.join(stateDir, "manager.lock");
  const statusPath = path.join(stateDir, "status.json");
  const diagPath = path.join(stateDir, "diagnostics.log");
  const nextBin = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next");
  let currentPid: number | null = null;
  let stopping = false;

  const ensureDir = () => fs.mkdirSync(stateDir, { recursive: true });

  const releaseLock = () => {
    try {
      const raw = fs.readFileSync(lockPath, "utf8");
      const owner = JSON.parse(raw) as { pid?: number };
      if (owner.pid === process.pid) fs.rmSync(lockPath, { force: true });
    } catch {
      // A missing lock is already released.
    }
  };

  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    if (currentPid) await stopPids([currentPid]);
    releaseLock();
    process.exit(0);
  };

  return {
    repoRoot,
    selfPid: process.pid,
    nextArgs: userArgs,
    requestedPort: 0,
    now: () => Date.now(),
    sleep,
    listProcs: listProcesses,
    listListeners,
    probeHttp,
    probeTrace: () => probeTrace(repoRoot),
    packageJsonExists: () => fs.existsSync(path.join(repoRoot, ".next", "package.json")),
    stopPids,
    deleteNext: () => deleteNextDir(repoRoot),
    spawnNext: (args): NextChild => {
      const child: ChildProcess = spawn(process.execPath, [nextBin, ...args], {
        cwd: repoRoot,
        env: process.env,
        stdio: ["inherit", "pipe", "pipe"],
        windowsHide: false,
      });
      currentPid = child.pid ?? null;
      const earlyOut: string[] = [];
      const earlyErr: string[] = [];
      let onOut: ((chunk: string) => void) | null = null;
      let onErr: ((chunk: string) => void) | null = null;
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => {
        if (onOut) onOut(chunk);
        else earlyOut.push(chunk);
      });
      child.stderr?.on("data", (chunk: string) => {
        if (onErr) onErr(chunk);
        else earlyErr.push(chunk);
      });
      const exit = new Promise<number>((resolve) => {
        child.once("exit", (code) => resolve(code ?? 1));
        child.once("error", () => resolve(1));
      });
      return {
        pid: child.pid ?? 0,
        onStdout: (callback) => {
          onOut = callback;
          for (const chunk of earlyOut) callback(chunk);
          earlyOut.length = 0;
        },
        onStderr: (callback) => {
          onErr = callback;
          for (const chunk of earlyErr) callback(chunk);
          earlyErr.length = 0;
        },
        requestStop: async () => {
          if (child.pid) await stopPids([child.pid]);
        },
        exit,
      };
    },
    log: (line) => process.stdout.write(`${line}\n`),
    forward: (chunk) => process.stdout.write(chunk),
    writeStatus: (status: StatusFile) => {
      ensureDir();
      fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
    },
    diag: (event, fields) => {
      ensureDir();
      fs.appendFileSync(diagPath, `${JSON.stringify({ at: new Date().toISOString(), event, ...fields })}\n`);
    },
    isAlive,
    acquireLock: () => {
      ensureDir();
      try {
        fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid }), { flag: "wx" });
        return "acquired";
      } catch (error) {
        if (errorCode(error) === "EEXIST") return "busy";
        throw error;
      }
    },
    readLockOwner: () => {
      try {
        const owner = JSON.parse(fs.readFileSync(lockPath, "utf8")) as { pid?: number };
        return typeof owner.pid === "number" ? owner.pid : null;
      } catch {
        return null;
      }
    },
    releaseLock,
    readStatus: () => {
      try {
        return JSON.parse(fs.readFileSync(statusPath, "utf8")) as StatusFile;
      } catch {
        return null;
      }
    },
    waitWhileReusing: async (pid: number) => {
      while (!stopping && isAlive(pid)) await sleep(1_000);
    },
    shutdown,
  };
}
