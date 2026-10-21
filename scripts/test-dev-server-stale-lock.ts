// npx tsx scripts/test-dev-server-stale-lock.ts
// Execution 48: a manager.lock left by a dead Dev Server Manager must not block `npm run dev`.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSessionDeps } from "./dev-server/os";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  console.log("OK: " + message);
}

function lockFile(root: string): string {
  return path.join(root, ".dev-server", "manager.lock");
}

function writeLock(root: string, pid: number) {
  fs.mkdirSync(path.join(root, ".dev-server"), { recursive: true });
  fs.writeFileSync(lockFile(root), JSON.stringify({ pid }));
}

async function main() {
  // A pid that existed and is gone.
  const finished = spawnSync(process.execPath, ["-e", "process.exit(0)"]);
  const deadPid = finished.pid;
  assert(typeof deadPid === "number" && deadPid > 0, "a finished process gives a dead pid");

  // 1. Dead owner: the lock is reclaimed.
  const staleRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dev-stale-lock-"));
  writeLock(staleRoot, deadPid);
  const stale = createSessionDeps(staleRoot, []);
  assert(stale.acquireLock() === "acquired", "a lock owned by a dead process is reclaimed");
  assert(stale.readLockOwner() === process.pid, "the new owner is this manager");
  stale.releaseLock();
  assert(!fs.existsSync(lockFile(staleRoot)), "the reclaimed lock is released by its new owner");

  // 2. Live owner: the lock stays and is never taken.
  const liveRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dev-live-lock-"));
  const holder = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  await new Promise((resolve) => setTimeout(resolve, 300));
  try {
    writeLock(liveRoot, holder.pid as number);
    const live = createSessionDeps(liveRoot, []);
    assert(live.acquireLock() === "busy", "a lock owned by a live process stays busy");
    assert(live.readLockOwner() === holder.pid, "the live owner keeps the lock");
  } finally {
    holder.kill();
  }

  // 3. Unreadable or empty lock content is not trusted as a live owner.
  const brokenRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dev-broken-lock-"));
  fs.mkdirSync(path.join(brokenRoot, ".dev-server"), { recursive: true });
  fs.writeFileSync(lockFile(brokenRoot), "{not json");
  const broken = createSessionDeps(brokenRoot, []);
  assert(broken.acquireLock() === "busy", "a lock that is unreadable but brand new may still be being written, so it is not taken");
  const past = new Date(Date.now() - 60_000);
  fs.utimesSync(lockFile(brokenRoot), past, past);
  assert(broken.acquireLock() === "acquired", "a lock with unreadable content that is old is reclaimed");
  broken.releaseLock();

  // 4. A lock owned by this very process is not reclaimed twice by a second call.
  const ownRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dev-own-lock-"));
  const own = createSessionDeps(ownRoot, []);
  assert(own.acquireLock() === "acquired" && own.acquireLock() === "busy", "a second acquire in the same process sees the lock as busy");
  own.releaseLock();

  for (const root of [staleRoot, liveRoot, brokenRoot, ownRoot]) fs.rmSync(root, { recursive: true, force: true });
  console.log("DEV_SERVER_STALE_LOCK_OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
