import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertProductKey } from "@/lib/affiliate-hop/store";
import type { SandboxClick, SandboxSession } from "@/lib/sandbox/types";

export const DEFAULT_SANDBOX_ROOT = path.join(process.cwd(), "data", "sandbox-sessions");
export const DEFAULT_SANDBOX_ASSET_ROOT = path.join(process.cwd(), "data", "sandbox-assets");

const SESSION_ID = /^[a-z0-9][a-z0-9-]{7,80}$/i;

export function assertSessionId(sessionId: string): string {
  const id = sessionId.trim();
  if (!SESSION_ID.test(id)) throw new Error("sandbox session id is not safe");
  return id;
}

function writeAtomic(file: string, body: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, body, "utf8");
  try {
    renameSync(tmp, file);
  } catch {
    writeFileSync(file, body, "utf8");
    try {
      unlinkSync(tmp);
    } catch {
      /* leftover tmp */
    }
  }
}

function sessionFile(sessionId: string, root: string): string {
  return path.join(root, "sessions", `${assertSessionId(sessionId)}.json`);
}

function clickFile(productKey: string, root: string): string {
  return path.join(root, "clicks", assertProductKey(productKey), "clicks.json");
}

export function writeSandboxSession(session: SandboxSession, root = DEFAULT_SANDBOX_ROOT): void {
  writeAtomic(sessionFile(session.sessionId, root), `${JSON.stringify(session, null, 2)}\n`);
}

export function readSandboxSession(sessionId: string, root = DEFAULT_SANDBOX_ROOT): SandboxSession | null {
  const file = sessionFile(sessionId, root);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as SandboxSession;
  } catch {
    return null;
  }
}

export function readSandboxClicks(productKey: string, root = DEFAULT_SANDBOX_ROOT): SandboxClick[] {
  const file = clickFile(productKey, root);
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as SandboxClick[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeSandboxClicks(productKey: string, clicks: SandboxClick[], root = DEFAULT_SANDBOX_ROOT): void {
  writeAtomic(clickFile(productKey, root), `${JSON.stringify(clicks, null, 2)}\n`);
}
